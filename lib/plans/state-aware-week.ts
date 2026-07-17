import 'server-only';

/**
 * Phase 3b server pipeline - connects athlete state to the week's
 * prescription, honouring the coach mode and persisting every proposal
 * to plan_adjustments.
 *
 * Mode behaviour (locked design):
 *   manual    - interpretation logged (open row), raw template returned.
 *               User can apply from the card if they choose.
 *   assisted  - proposal row written (if none open), raw returned with
 *               the pending proposal surfaced for Apply / Dismiss.
 *   automatic - adjustment applied immediately, row written with
 *               applied_at set, adjusted template returned.
 *
 * Rails (regardless of mode):
 *   - ACWR >= 1.5 interpretation cannot be silently dismissed: a dismissed
 *     rail row does NOT suppress re-proposal on the next resolution.
 *   - Athlete-logged injuries never auto-adjust (handled upstream: the
 *     interpretation layer has no injury trigger by design - Phase 4
 *     interruption tracking owns that workflow).
 */

import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { getAthleteState, getDailyLoadMap } from '@/lib/analysis/athlete-state';
import { getActivitiesInRange } from '@/lib/analysis/week-queries';
import { listInterruptions } from '@/lib/analysis/interruptions';
import { hasActiveInjuryOrIllness, windowsOverlapping } from '@/lib/analysis/interruptions-pure';
import { dailyLoadSeries, evaluateMonotony } from '@/lib/analysis/monotony-pure';
import { getCoachMode, type CoachMode } from '@/lib/store/settings';
import { getEngine } from './index';
import type { Dojo, WeekTemplate } from './types';
import {
  interpretState,
  applyAdjustment,
  computeAcwr,
  phaseBandFor,
  DEFAULT_PROFILE,
  type StateInterpretation,
} from './state-awareness';

/** Monday-anchored week end (start + 6 days), UTC-anchored to match keys. */
function weekEndIsoFor(weekStartIso: string): string {
  const end = new Date(weekStartIso + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10);
}

export interface CoachAdjustmentView {
  /** plan_adjustments row id, when one exists */
  adjustmentId: number | null;
  mode: CoachMode;
  /** True when an active injury/illness downgraded automatic to assisted. */
  injuryPaused: boolean;
  status: 'none' | 'pending' | 'applied' | 'auto-applied' | 'dismissed';
  rail: boolean;
  trigger: string | null;
  rationale: string;
  changes: string[];
  /** The template the matrix should use (adjusted when applied/automatic). */
  template: WeekTemplate;
  /** Raw weekly km vs adjusted, for the card's summary line. */
  rawTotalKm: number;
  adjustedTotalKm: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Acute (7d) vs chronic (28d) distance-based ACWR as of today. */
export async function getAcwrNow(): Promise<number | null> {
  const today = new Date();
  const d7 = new Date(today); d7.setDate(d7.getDate() - 7);
  const d28 = new Date(today); d28.setDate(d28.getDate() - 28);
  const acute = await getActivitiesInRange(isoDay(d7), isoDay(today));
  const chronic = await getActivitiesInRange(isoDay(d28), isoDay(today));
  const sumKm = (xs: { distanceM: number | null }[]) =>
    xs.reduce((s, a) => s + (a.distanceM ?? 0), 0) / 1000;
  return computeAcwr(sumKm(acute), sumKm(chronic));
}

/**
 * Resolve the state-aware view of one program week.
 *
 * Pure-read except for proposal persistence: in assisted/manual modes an
 * open proposal row is written when the interpretation is not 'hold' and
 * no open row exists; in automatic mode the row is written pre-applied.
 */
export async function resolveCoachAdjustment(opts: {
  dojo: Dojo;
  weekStartIso: string;
  weekNumber: number;
  programWeeks: number;
  rawTemplate: WeekTemplate;
}): Promise<CoachAdjustmentView> {
  const { dojo, weekStartIso, weekNumber, programWeeks, rawTemplate } = opts;
  const db = (await getDb());
  const mode = await getCoachMode();
  // Phase 4: read interruptions once - drives both the injury/illness AUTOMATIC
  // gate (locked rule: athlete-logged injuries never auto-adjust; the athlete
  // drives recovery) and the per-week sickness/travel window triggers. Degrades
  // to [] pre-migration.
  const interruptions = await listInterruptions();
  const injuryPaused = hasActiveInjuryOrIllness(interruptions);
  const engine = getEngine(dojo);
  const profile = engine.stateProfile ?? DEFAULT_PROFILE;

  const state = await getAthleteState();
  if (!state) {
    return {
      adjustmentId: null,
      mode,
      injuryPaused,
      status: 'none',
      rail: false,
      trigger: null,
      rationale: 'Not enough recent activity to assess training state.',
      changes: [],
      template: rawTemplate,
      rawTotalKm: rawTemplate.totalKmTarget,
      adjustedTotalKm: rawTemplate.totalKmTarget,
    };
  }
  const acwr = await getAcwrNow();
  const band = phaseBandFor(weekNumber, programWeeks);

  // Now-state monotony (Foster): high day-to-day sameness over the trailing
  // week. Passed to the engine only when it is actually trigger-worthy.
  const monoEval = evaluateMonotony(dailyLoadSeries(await getDailyLoadMap(), state.asOfIso, 7));
  const monotony = monoEval.shouldTrigger ? monoEval.monotony : null;

  // Week-anchored life-context windows overlapping THIS week.
  const weekEndIso = weekEndIsoFor(weekStartIso);
  const illnessWindow = windowsOverlapping(interruptions, weekStartIso, weekEndIso, ['illness']).length > 0;
  const travelWindow = windowsOverlapping(interruptions, weekStartIso, weekEndIso, ['travel']).length > 0;

  const interp: StateInterpretation = interpretState(
    {
      tsb: state.tsb,
      formClass: state.formClass,
      acwr,
      band,
      monotony,
      illnessWindow,
      travelWindow,
      evaluateNowState: true,
    },
    profile
  );

  // Life-context (illness/travel) proposals are surfaced, never auto-applied -
  // the athlete owns those calls, same spirit as the injury pause.
  const lifeContextTrigger =
    interp.trigger === 'sickness-window' || interp.trigger === 'travel-window';
  const effectiveMode: CoachMode =
    (injuryPaused || lifeContextTrigger) && mode === 'automatic' ? 'assisted' : mode;

  const base = {
    mode,
    injuryPaused,
    rail: interp.rail,
    trigger: interp.trigger,
    rationale: interp.rationale,
    rawTotalKm: rawTemplate.totalKmTarget,
  };

  // Existing rows for this week, newest first.
  const rows = await db
    .select()
    .from(schema.planAdjustments)
    .where(eq(schema.planAdjustments.weekStartIso, weekStartIso))
    .all();
  rows.sort((a, b) => (a.proposedAt < b.proposedAt ? 1 : -1));

  const applied = rows.find((r) => r.appliedAt !== null);
  if (applied && applied.afterState) {
    const template = JSON.parse(applied.afterState) as WeekTemplate;
    return {
      ...base,
      adjustmentId: applied.id,
      status: applied.mode === 'automatic' ? 'auto-applied' : 'applied',
      rationale: applied.rationale,
      changes: [],
      template,
      adjustedTotalKm: template.totalKmTarget,
    };
  }

  if (interp.adjustment === 'hold') {
    return {
      ...base,
      adjustmentId: null,
      status: 'none',
      changes: [],
      template: rawTemplate,
      adjustedTotalKm: rawTemplate.totalKmTarget,
    };
  }

  const adjusted = applyAdjustment(rawTemplate, interp, profile);

  // A dismissal suppresses re-proposal for the same trigger - EXCEPT the
  // hard rail, which always comes back until the state itself improves.
  const dismissed = rows.find((r) => r.dismissedAt !== null && r.trigger === interp.trigger);
  if (dismissed && !interp.rail) {
    return {
      ...base,
      adjustmentId: dismissed.id,
      status: 'dismissed',
      changes: adjusted.changes,
      template: rawTemplate,
      adjustedTotalKm: rawTemplate.totalKmTarget,
    };
  }

  const open = rows.find((r) => r.appliedAt === null && r.dismissedAt === null);

  if (effectiveMode === 'automatic') {
    const now = new Date().toISOString();
    let id: number;
    if (open) {
      await db.update(schema.planAdjustments)
        .set({ appliedAt: now, afterState: JSON.stringify(adjusted.template) })
        .where(eq(schema.planAdjustments.id, open.id));
      id = open.id;
    } else {
      const inserted = await db.insert(schema.planAdjustments).values({
        trigger: interp.trigger ?? 'tsb-low',
        rationale: interp.rationale,
        beforeState: JSON.stringify(rawTemplate),
        afterState: JSON.stringify(adjusted.template),
        mode,
        weekStartIso,
        appliedAt: now,
      }).returning({ id: schema.planAdjustments.id }).get();
      id = inserted.id;
    }
    return {
      ...base,
      adjustmentId: id,
      status: 'auto-applied',
      changes: adjusted.changes,
      template: adjusted.template,
      adjustedTotalKm: adjusted.template.totalKmTarget,
    };
  }

  // manual / assisted - ensure one open proposal row exists.
  let id: number;
  if (open) {
    id = open.id;
  } else {
    const inserted = await db.insert(schema.planAdjustments).values({
      trigger: interp.trigger ?? 'tsb-low',
      rationale: interp.rationale,
      beforeState: JSON.stringify(rawTemplate),
      afterState: JSON.stringify(adjusted.template),
      mode: effectiveMode,
      weekStartIso,
    }).returning({ id: schema.planAdjustments.id }).get();
    id = inserted.id;
  }

  return {
    ...base,
    adjustmentId: id,
    status: 'pending',
    changes: adjusted.changes,
    template: rawTemplate, // not applied yet
    adjustedTotalKm: adjusted.template.totalKmTarget,
  };
}

/** Open (pending) proposals count - cheap badge for surfaces. */
export async function countOpenProposals(): Promise<number> {
  const db = (await getDb());
  const rows = await db
    .select({ id: schema.planAdjustments.id })
    .from(schema.planAdjustments)
    .where(and(isNull(schema.planAdjustments.appliedAt), isNull(schema.planAdjustments.dismissedAt)))
    .all();
  return rows.length;
}
