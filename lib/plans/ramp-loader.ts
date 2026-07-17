import 'server-only';
import { eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { getEngine } from '@/lib/plans/index';
import { getAthleteState } from '@/lib/analysis/athlete-state';
import { computeRampPlan, type RampPlan } from '@/lib/plans/ramp';
import type { ProgramPhase } from '@/lib/plans/program-phase';

/**
 * Load the ramp plan for the active dojo, given the current program phase.
 *
 * Returns null when:
 * - There's no active plan_period
 * - The phase is not pre-program (no ramp window relevant)
 * - The dojo's entry expectation is 0 (custom)
 *
 * When non-null, this is the ramp the user should be following before
 * Week 1 begins. Patrol's ramp card consumes it; the dojo selection
 * UI also consumes it to show what the user is signing up for.
 *
 * Current chronic load comes from CTL: we convert Daniels points back
 * to weekly km using the same baseline used in the load model. CTL is
 * 28-day EWMA of daily training points; multiply by 7 to get weekly
 * points, divide by run baseline (1.0) and average intensity factor
 * (~0.25 for easy-dominated training) to back into km. This is rough
 * but honest - we surface it as "approximate weekly km from chronic load".
 */
export async function getRampPlanForActivePeriod(
  phase: ProgramPhase
): Promise<RampPlan | null> {
  if (phase.kind !== 'pre-program') return null;

  const db = (await getDb());
  let period;
  try {
    period = await db
      .select()
      .from(schema.planPeriods)
      .where(isNull(schema.planPeriods.endDate))
      .get();
  } catch {
    return null;
  }
  if (!period) return null;

  const engine = getEngine(period.dojo as import('./types').Dojo);
  const goalRace = await db
    .select()
    .from(schema.races)
    .where(eq(schema.races.isGoal, true))
    .get();
  const level = (goalRace?.level as 'beginner' | 'intermediate' | 'advanced') ?? 'intermediate';

  const targetEntryKm = engine.entryWeeklyLoadKm(level);
  const athleteState = await getAthleteState({});

  // Convert chronic-load points to approximate weekly km.
  // CTL is 28-day EWMA of daily points. Weekly points = CTL * 7.
  // For easy-dominated running (most chronic load), points ~= duration_min * 1.0 (run baseline) * 0.25 (easy IF).
  // So duration_min ~= weeklyPoints / 0.25 = weeklyPoints * 4.
  // Using a typical easy pace of 5:30/km: km = duration_min / 5.5
  // => weeklyKm = (CTL * 7 * 4) / 5.5 ~= CTL * 5.09
  // We round this to ~5x as a defensible approximation surfaced in the rationale.
  const approxWeeklyKm = athleteState ? athleteState.ctl * 5 : 0;

  return computeRampPlan({
    currentChronicKm: approxWeeklyKm,
    targetEntryKm,
    weeksAvailable: phase.weeksToProgramStart ?? 0,
    athleteState,
  });
}
