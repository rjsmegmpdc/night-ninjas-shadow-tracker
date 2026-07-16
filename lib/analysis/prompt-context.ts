/**
 * Prompt queue — server wrapper, symmetric to coach-read.ts. Assembles
 * `PromptContextInput` from the DB (today's journal row, unlogged prescribed
 * sessions, integration errors, configured defaults, today's skips) and
 * calls into `prompt-context-pure`'s `buildPromptQueue`. All the ordering/
 * filtering logic lives in the pure module; this file only does reads and
 * shape translation — same split as athlete-state.ts and coach-read.ts.
 *
 * Cross-layer reuse note: this wrapper imports `getSkippedPromptIds` from
 * lib/actions/journal.ts and `getAdapterStatuses` from
 * lib/actions/adapter-status.ts rather than re-querying the DB directly.
 * Both are already the canonical read path for that data (skip ledger,
 * adapter health) — duplicating their queries here would just be a second
 * place for that logic to drift. Neither imports back from this file, so
 * there's no cycle.
 *
 * Timezone: "today" is the athlete's local wall-clock date, derived via
 * date-fns-tz's `formatInTimeZone` against the configured timezone (same
 * pattern as lib/actions/manual-activity.ts) — never a bare
 * `new Date().toISOString().slice(0, 10)`, which reads UTC and drifts a day
 * for anyone east of Greenwich (NZ is UTC+12) whenever it's already
 * tomorrow in UTC but still today locally.
 */

import 'server-only';
import { formatInTimeZone } from 'date-fns-tz';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { getUserTimezone, getPromptDefaults } from '@/lib/store/settings';
import { getSkippedPromptIds } from '@/lib/actions/journal';
import { getAdapterStatuses } from '@/lib/actions/adapter-status';
import { getActivePlan } from '@/lib/plans/active-plan';
import { resolveWeekContext } from '@/lib/plans/week-context';
import { addDaysIso } from '@/lib/dates/iso';
import { getActivitiesInRange } from './week-queries';
import { findUnloggedSessions, type PrescribedSessionOnDate, type UnloggedSession } from './unlogged-sessions-pure';
import { SUPERSEDED_TYPE, safeParseJson, type SupersedeMarker } from './activity-dedup-pure';
import {
  buildPromptQueue,
  type PromptItem,
  type JournalCompletenessInput,
  type IntegrationErrorInput,
  type ManualOverlapInput,
} from './prompt-context-pure';
import type { PlanEngine, PlanParams, WeekTemplate } from '@/lib/plans/types';

/**
 * Kept in sync with unlogged-sessions-pure.ts's own default (3) but passed
 * explicitly everywhere it matters here, so the prescribed-session range
 * this file builds and the window `findUnloggedSessions` actually evaluates
 * can never silently drift apart if either default changes independently.
 */
const LOOKBACK_DAYS = 3;

/** UTC-anchored Monday->Sunday range containing dateIso. Mirrors coach-read.ts's weekRangeFor. */
function weekRangeFor(dateIso: string): { startIso: string; endIso: string } {
  const d = new Date(dateIso + 'T00:00:00Z');
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { startIso: monday.toISOString().slice(0, 10), endIso: sunday.toISOString().slice(0, 10) };
}

/** UTC-anchored day-of-week (Mon=0..Sun=6) for a plain YYYY-MM-DD string. Mirrors compliance.ts's dowOf, but safe for date-only strings (see lib/dates/iso.ts). */
function dowOfDateIso(dateIso: string): number {
  const d = new Date(dateIso + 'T00:00:00Z');
  return (d.getUTCDay() + 6) % 7;
}

function programWeekNumberForWeekStart(params: PlanParams, weekStartIso: string): number | null {
  const programStart = new Date(params.startDate);
  const weekStart = new Date(weekStartIso);
  const diffDays = Math.floor((weekStart.getTime() - programStart.getTime()) / 86_400_000);
  if (diffDays < 0) return null;
  const week = Math.floor(diffDays / 7) + 1;
  const programWeeks = params.programWeeks ?? 18;
  if (week > programWeeks) return null;
  return week;
}

async function getWeekTemplateForDate(
  dateIso: string,
  engine: PlanEngine,
  params: PlanParams,
  cache: Map<string, WeekTemplate | null>
): Promise<WeekTemplate | null> {
  const { startIso, endIso } = weekRangeFor(dateIso);
  const cached = cache.get(startIso);
  if (cached !== undefined) return cached;

  const programWeekNumber = programWeekNumberForWeekStart(params, startIso);
  let template: WeekTemplate | null = null;
  if (programWeekNumber !== null) {
    const context = await resolveWeekContext({ weekStartIso: startIso, weekEndIso: endIso });
    template = engine.renderWeek(params, programWeekNumber, context);
  }
  cache.set(startIso, template);
  return template;
}

/**
 * Flatten the active plan's prescribed sessions for every day in
 * [fromIso, toIso] (inclusive) into unlogged-sessions-pure's input shape.
 * Weeks are rendered once and cached — the lookback window is small
 * (3 days by default) but can straddle a Monday boundary.
 */
async function buildPrescribedSessionsInRange(
  fromIso: string,
  toIso: string,
  engine: PlanEngine,
  params: PlanParams
): Promise<PrescribedSessionOnDate[]> {
  const cache = new Map<string, WeekTemplate | null>();
  const result: PrescribedSessionOnDate[] = [];

  let cursor = fromIso;
  while (cursor <= toIso) {
    const template = await getWeekTemplateForDate(cursor, engine, params, cache);
    if (template) {
      const dow = dowOfDateIso(cursor);
      const day = template.days.find((d) => d.dow === dow);
      if (day) {
        for (const session of day.sessions) {
          result.push({ dateIso: cursor, session });
        }
      }
    }
    cursor = addDaysIso(cursor, 1);
  }
  return result;
}

async function resolveUnloggedSessions(todayLocalIso: string): Promise<UnloggedSession[]> {
  const activePlan = await getActivePlan();
  if (!activePlan) return [];
  const { engine, params } = activePlan;

  const fromIso = addDaysIso(todayLocalIso, -LOOKBACK_DAYS);
  const [prescribed, activities] = await Promise.all([
    buildPrescribedSessionsInRange(fromIso, todayLocalIso, engine, params),
    getActivitiesInRange(fromIso, todayLocalIso),
  ]);

  return findUnloggedSessions(prescribed, activities, todayLocalIso, LOOKBACK_DAYS);
}

async function resolveTodaysJournal(todayLocalIso: string): Promise<JournalCompletenessInput | null> {
  const row = await getDb()
    .select({
      sleepQuality: schema.journal.sleepQuality,
      sleepHours: schema.journal.sleepHours,
      energy: schema.journal.energy,
    })
    .from(schema.journal)
    .where(eq(schema.journal.date, todayLocalIso))
    .get();
  if (!row) return null;
  return {
    sleepQuality: row.sleepQuality ?? null,
    sleepHours: row.sleepHours ?? null,
    energy: row.energy ?? null,
  };
}

async function resolveIntegrationErrors(): Promise<IntegrationErrorInput[]> {
  const statuses = await getAdapterStatuses();
  return statuses
    .filter((s) => s.status === 'error')
    .map((s) => ({ adapterId: s.id, message: s.detail }));
}

/**
 * Stage 6 - manual activity rows superseded by an overlapping synced
 * activity in the last 7 days (D-004: synced wins by default - see
 * lib/analysis/activity-dedup-pure.ts). Dismissal ("keep synced") is handled
 * uniformly by buildPromptQueue's existing `skippedPromptIds` filtering -
 * every candidate found here is passed through, whether or not it's already
 * been dismissed today.
 *
 * A restored row (lib/actions/manual-activity.ts's restoreManualActivity)
 * no longer has type=SUPERSEDED_TYPE, so it naturally drops out of this
 * query without any extra filtering.
 */
async function resolveSupersededOverlaps(todayLocalIso: string): Promise<ManualOverlapInput[]> {
  const fromIso = addDaysIso(todayLocalIso, -7);
  const rows = await getDb()
    .select()
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.type, SUPERSEDED_TYPE),
        gte(schema.activities.startDateLocal, fromIso),
        lte(schema.activities.startDateLocal, todayLocalIso + 'T99:99:99')
      )
    )
    .all();

  return rows.map((row) => {
    const parsed = safeParseJson(row.rawJson);
    const supersede = parsed.supersede as Partial<SupersedeMarker> | undefined;
    return {
      manualActivityId: row.id,
      dateIso: row.startDateLocal.slice(0, 10),
      syncedSourceId: supersede?.supersededBySync ?? '',
    };
  });
}

/** Assemble today's prompt queue for Patrol. Deterministic given DB state at call time. */
export async function getPromptQueue(): Promise<PromptItem[]> {
  const timezone = await getUserTimezone();
  const todayLocalIso = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');

  const [journal, unloggedSessions, integrationErrors, supersededOverlaps, defaults, skippedPromptIds] =
    await Promise.all([
      resolveTodaysJournal(todayLocalIso),
      resolveUnloggedSessions(todayLocalIso),
      resolveIntegrationErrors(),
      resolveSupersededOverlaps(todayLocalIso),
      getPromptDefaults(),
      getSkippedPromptIds(todayLocalIso),
    ]);

  return buildPromptQueue({
    todayLocalIso,
    journal,
    unloggedSessions,
    integrationErrors,
    supersededOverlaps,
    defaults,
    skippedPromptIds,
  });
}
