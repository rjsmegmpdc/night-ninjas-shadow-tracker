import 'server-only';
import { eq, asc, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { getEngine, type PlanEngine, type PlanParams } from '@/lib/plans';
import { SETTINGS_KEYS } from '@/lib/constants/settings-keys';

/* ----------------------------------------------------------------------------
 * Active plan resolver.
 *
 * KNOWN GAP: the `plans` table exists but isn't currently populated. The
 * wizard captures all the inputs (dojo via setup, goal race in the races
 * table, capacity caps in settings) but doesn't persist them as a single
 * `plans` row. Until that's fixed, this module derives an implicit plan
 * at query time.
 *
 * Once the wizard is updated to create a real `plans` row on completion,
 * this module's `getActivePlan()` should switch to reading from there.
 * The function signature stays the same; consumers don't change.
 * -------------------------------------------------------------------------- */

export interface ActivePlan {
  engine: PlanEngine;
  params: PlanParams;
}

/**
 * Settings key the wizard's dojo step writes (or will write) when the user
 * picks a dojo. For now we read from settings directly; if absent, fall
 * back to Hansons as a sensible default.
 */
const KEY_DOJO = 'plan.dojo';

/**
 * Resolve the current active plan. Returns null if we can't synthesise
 * one (no goal race set yet) — caller should show empty state.
 */
export async function getActivePlan(): Promise<ActivePlan | null> {
  const db = (await getDb());

  // 1. Find the goal race
  const goalRace = await db
    .select()
    .from(schema.races)
    .where(eq(schema.races.isGoal, true))
    .get();
  if (!goalRace || !goalRace.targetTimeS) {
    return null;
  }

  // 2. Read settings — dojo + capacity caps
  const settingsRows = await db.select().from(schema.settings).all();
  const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));

  const dojo = (settingsMap[KEY_DOJO] as
    | 'hansons'
    | 'norwegian-singles'
    | 'lydiard'
    | 'daniels'
    | 'pfitzinger'
    | 'higdon'
    | 'polarised'
    | 'ultra'
    | 'custom'
    | undefined) ?? 'hansons';
  const weeklyCapStr = settingsMap[SETTINGS_KEYS.CAPACITY_WEEKLY];
  const longCapStr = settingsMap[SETTINGS_KEYS.CAPACITY_LONG];

  const engine = getEngine(dojo);

  // 3. Determine program start date. The canonical, athlete-editable start is
  //    plan_periods.startDate (Phase 5); fall back to the derived start
  //    (program-weeks before the goal race, or today) when no period exists.
  const goalDate = new Date(goalRace.raceDate);
  const programWeeks = engine.defaultProgramWeeks;
  const naturalStart = new Date(goalDate.getTime() - programWeeks * 7 * 86400 * 1000);
  const today = new Date();
  const derivedStart = (naturalStart < today ? naturalStart : today).toISOString().slice(0, 10);

  let startDate = derivedStart;
  try {
    const activePeriod = await db
      .select({ startDate: schema.planPeriods.startDate })
      .from(schema.planPeriods)
      .where(isNull(schema.planPeriods.endDate))
      .get();
    if (activePeriod?.startDate) startDate = activePeriod.startDate;
  } catch {
    // plan_periods table missing pre-migration; keep the derived start.
  }

  const params: PlanParams = {
    goalDistanceKm: goalRace.distanceKm,
    goalTimeS: goalRace.targetTimeS,
    level: (goalRace.level as 'beginner' | 'intermediate' | 'advanced') ?? 'intermediate',
    weeklyVolumeCapKm: weeklyCapStr ? parseFloat(weeklyCapStr) : undefined,
    longRunCapKm: longCapStr ? parseFloat(longCapStr) : undefined,
    programWeeks,
    startDate,
  };

  return { engine, params };
}

/**
 * Compute the current week number of the active plan, given today's date.
 * Returns null if the plan hasn't started yet, or if it's past programWeeks.
 *
 * Uses the user's local time — the "current week" in NZ might differ from
 * a UTC-based calculation by up to a day.
 */
export function currentWeekNumber(params: PlanParams, now: Date = new Date()): number | null {
  const start = new Date(params.startDate);
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 0) return null;
  const week = Math.floor(diffDays / 7) + 1;
  const programWeeks = params.programWeeks ?? 18;
  if (week > programWeeks) return null;
  return week;
}

/**
 * Get the [start, end] ISO date range for the user's current training week
 * (Monday → Sunday). Used to query activities for Patrol.
 */
export function currentWeekRange(now: Date = new Date()): { startIso: string; endIso: string } {
  const d = new Date(now);
  // JS getDay: Sun=0, Mon=1, ... Sat=6.
  // We want Monday as week start.
  const dow = d.getDay();
  const daysSinceMonday = (dow + 6) % 7; // Mon=0, ..., Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    startIso: toLocalIso(monday),
    endIso: toLocalIso(sunday),
  };
}

function toLocalIso(d: Date): string {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
