import 'server-only';

/**
 * Phase 6 - race execution read layer.
 *
 * Assembles the goal race + athlete weight + program phase into the full
 * execution view: pacing (three strategies), fuelling, and carb-load. Pure
 * logic lives in execution-pure.ts. Returns null when there's no goal race
 * with a target time.
 */

import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import type { RaceResultRow } from '@/lib/db/schema';
import { getAthleteProfile } from '@/lib/store/settings';
import { getProgramPhase, type ProgramPhaseKind } from '@/lib/plans/program-phase';
import {
  pacePlan,
  fuelingPlan,
  carbLoadPlan,
  type PacePlan,
  type PaceStrategy,
} from './execution-pure';
import { getForecastForDate, type DayForecast } from '@/lib/weather/forecast';
import { heatAdjust, applyHeatToPaceSpk, type HeatAdjustment } from '@/lib/weather/heat-adjust-pure';
import { taperChecklist, buildTaperCues, type TaperChecklistItem } from './taper-pure';
import { recoveryProtocol, type RecoveryProtocol } from './post-race-pure';
import { getMacrocycleContext, type MacrocycleContext } from './macrocycle';
import { buildReconAggregate } from '@/lib/analysis/recent-weeks';
import { topWeeks } from '@/lib/analysis/best-week';

export type {
  PacePlan,
  PaceSegment,
  PaceStrategy,
  FuelingPlan,
  CarbLoadPlan,
  CarbLoadDay,
} from './execution-pure';
export type { DayForecast } from '@/lib/weather/forecast';
export type { HeatAdjustment, HeatSeverity } from '@/lib/weather/heat-adjust-pure';
export type { TaperChecklistItem } from './taper-pure';
export type { RecoveryPhase, RecoveryProtocol } from './post-race-pure';
export type { MacrocycleContext } from './macrocycle';

export interface TaperView {
  daysToRace: number;
  checklist: TaperChecklistItem[];
  cues: string[];
}

export interface PostRaceView {
  daysSinceRace: number;
  recovery: RecoveryProtocol;
  debrief: RaceResultRow | null;
}

const STRATEGIES: PaceStrategy[] = ['even', 'negative', 'progressive'];

export interface RaceExecutionView {
  race: { name: string; distanceKm: number; raceDate: string; targetTimeS: number };
  daysToRace: number | null;
  /** Within taper or race week - the execution surface matters most now. */
  isTaper: boolean;
  phaseKind: ProgramPhaseKind;
  /** Days since race day (post-race window); null otherwise. */
  daysSinceRace: number | null;
  pacing: Record<PaceStrategy, PacePlan>;
  fueling: ReturnType<typeof fuelingPlan>;
  carbLoad: ReturnType<typeof carbLoadPlan> | null;
  weightKg: number | null;
  /** Race-day forecast (Open-Meteo, Auckland default); null if >16 days out or fetch failed. */
  forecast: DayForecast | null;
  /** Heat advisory from the forecast; null when no forecast/temperature. */
  heat: HeatAdjustment | null;
  goalPaceSpk: number;
  heatAdjustedPaceSpk: number | null;
  /** Phase 6 part 2 - taper view, when in taper / race week; null otherwise. */
  taper: TaperView | null;
  /** Phase 6 part 2 - post-race protocol + debrief, when post-race; null otherwise. */
  postRace: PostRaceView | null;
  /** Phase 6 part 2 - multi-block / year-over-year context; null when unavailable. */
  macrocycle: MacrocycleContext | null;
}

export async function getRaceExecution(): Promise<RaceExecutionView | null> {
  const db = (await getDb());
  const goal = await db
    .select()
    .from(schema.races)
    .where(eq(schema.races.isGoal, true))
    .get();
  if (!goal || !goal.targetTimeS) return null;

  const profile = await getAthleteProfile();
  const phase = await getProgramPhase();

  const pacing = Object.fromEntries(
    STRATEGIES.map((s) => [s, pacePlan(goal.distanceKm, goal.targetTimeS as number, s)])
  ) as Record<PaceStrategy, PacePlan>;

  // Phase 7 - race-day forecast (Open-Meteo, Auckland default) + heat advisory.
  // Degrades to null when the race is >16 days out or the fetch fails.
  const goalPaceSpk = goal.targetTimeS / goal.distanceKm;
  const forecast = await getForecastForDate(goal.raceDate);
  let heat: HeatAdjustment | null = null;
  let heatAdjustedPaceSpk: number | null = null;
  if (forecast && forecast.tempMaxC !== null) {
    const conditions = { tempC: forecast.tempMaxC, humidityPct: forecast.humidityPct ?? 50 };
    heat = heatAdjust(conditions);
    heatAdjustedPaceSpk = applyHeatToPaceSpk(goalPaceSpk, conditions);
  }

  const isTaper = phase.kind === 'taper' || phase.kind === 'race-week';

  // Phase 6 part 2 - taper view: discipline checklist + honest confidence cues
  // drawn from block aggregates (no fabricated per-zone pace trends).
  let taper: TaperView | null = null;
  if (isTaper) {
    const [recon, best] = await Promise.all([buildReconAggregate(), topWeeks(8)]);
    const biggestWeekKm = best.length ? best[0].totalKm : null;
    const longestRunKm = best.length ? Math.max(...best.map((w) => w.longRunKm)) : null;
    taper = {
      daysToRace: phase.daysToRace ?? 0,
      checklist: taperChecklist(phase.daysToRace ?? 0),
      cues: buildTaperCues({
        volumeDeltaPct: recon?.totalKm.deltaPct ?? null,
        biggestWeekKm,
        compliancePct: recon?.compliance.currentPct ?? null,
        longestRunKm,
      }),
    };
  }

  // Phase 6 part 2 - post-race protocol + any logged debrief.
  let postRace: PostRaceView | null = null;
  if (phase.kind === 'post-race' && phase.daysSinceRace != null) {
    let debrief: RaceResultRow | null = null;
    try {
      debrief =
        (await db.select().from(schema.raceResults).where(eq(schema.raceResults.raceId, goal.id)).get()) ?? null;
    } catch {
      debrief = null; // table absent pre-migration
    }
    postRace = {
      daysSinceRace: phase.daysSinceRace,
      recovery: recoveryProtocol(phase.daysSinceRace, goal.distanceKm),
      debrief,
    };
  }

  // Phase 6 part 2 - multi-block / year-over-year context (degrades to null).
  const macrocycle = await getMacrocycleContext();

  return {
    race: {
      name: goal.name,
      distanceKm: goal.distanceKm,
      raceDate: goal.raceDate,
      targetTimeS: goal.targetTimeS,
    },
    daysToRace: phase.daysToRace,
    isTaper,
    phaseKind: phase.kind,
    daysSinceRace: phase.daysSinceRace,
    pacing,
    fueling: fuelingPlan(goal.targetTimeS),
    carbLoad: profile.weightKg ? carbLoadPlan(profile.weightKg) : null,
    weightKg: profile.weightKg ?? null,
    forecast,
    heat,
    goalPaceSpk,
    heatAdjustedPaceSpk,
    taper,
    postRace,
    macrocycle,
  };
}
