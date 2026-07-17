import 'server-only';
import { eq, lte, gte, isNull, desc, asc, and, or } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import type { PlanPeriod } from '@/lib/db/schema';
import { getEngine } from '@/lib/plans/index';
import type { PlanEngine, PlanParams } from '@/lib/plans/types';

/**
 * Plan period queries.
 *
 * The current settings row (plan.dojo, plan.startDate etc.) is the source
 * of truth for the *active* plan. plan_periods records the *history* of
 * past plans so historical weeks can be evaluated against the dojo and
 * goal that were active at that time.
 *
 * The active period is the one with end_date IS NULL. Past periods have
 * end_date set to the day before the next period began.
 *
 * Lazy seed: when this module's helpers are first called and the table
 * is empty but settings has a plan configured, we materialise an active
 * period from the current settings. This means existing users don't lose
 * history when plan_periods migration is applied.
 */

const SETTINGS_KEYS = {
  DOJO: 'plan.dojo',
  START_DATE: 'plan.startDate',
  PROGRAM_WEEKS: 'plan.programWeeks',
} as const;

/**
 * Ensures a plan_period row exists for the currently-active plan. Idempotent.
 * Reads settings + the goal race; inserts a row with end_date NULL if the
 * table has no active period and settings indicate a plan is configured.
 *
 * Should be called any time we're about to query plan_periods, since the
 * table may be empty on first read after the migration.
 */
/**
 * Detect "table does not exist" errors from better-sqlite3.
 *
 * When migration 0005_plan_periods hasn't been applied yet, the
 * plan_periods table is missing and any query against it throws
 * `SqliteError: no such table: plan_periods`. We catch that here and
 * degrade gracefully — the matrix falls back to rendering against
 * current-settings only, which is correct behaviour pre-migration.
 *
 * This also self-heals once the migration is applied; subsequent
 * calls succeed normally.
 */
function isMissingTableError(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? '';
  return msg.includes('no such table: plan_periods');
}

export async function ensureActivePlanPeriod(): Promise<PlanPeriod | null> {
  const db = (await getDb());

  let existing: PlanPeriod | undefined;
  try {
    existing = await db
      .select()
      .from(schema.planPeriods)
      .where(isNull(schema.planPeriods.endDate))
      .get();
  } catch (e) {
    if (isMissingTableError(e)) return null;
    throw e;
  }

  if (existing) return existing;

  // No active period — try to seed from current settings
  const settingsRows = await db.select().from(schema.settings).all();
  const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));

  const dojo = settingsMap[SETTINGS_KEYS.DOJO];
  const startDate = settingsMap[SETTINGS_KEYS.START_DATE];
  const programWeeksStr = settingsMap[SETTINGS_KEYS.PROGRAM_WEEKS];

  if (!dojo) return null;

  // Pull the goal race for snapshot data
  const goalRace = await db
    .select()
    .from(schema.races)
    .where(eq(schema.races.isGoal, true))
    .get();

  if (!goalRace || !goalRace.targetTimeS) return null;

  const programWeeks = programWeeksStr ? parseInt(programWeeksStr, 10) : 18;

  // If settings doesn't have an explicit start_date, synthesise one the
  // same way getActivePlan() does: program-weeks before the goal race,
  // or today if that lies in the past.
  //
  // This handles the (common) case where a setup wizard wrote plan.dojo
  // but nothing wrote plan.startDate. Without this fallback, the seeder
  // would bail, plan_periods would stay empty, and the matrix would
  // render every week as base-maintenance even though there's a coached
  // plan active.
  let resolvedStartDate = startDate;
  if (!resolvedStartDate) {
    const goalDate = new Date(goalRace.raceDate);
    const naturalStart = new Date(goalDate.getTime() - programWeeks * 7 * 86400 * 1000);
    const today = new Date();
    const synthesised = naturalStart < today ? naturalStart : today;
    resolvedStartDate = synthesised.toISOString().slice(0, 10);
  }

  try {
    const inserted = await db
      .insert(schema.planPeriods)
      .values({
        dojo,
        startDate: resolvedStartDate,
        endDate: null,
        goalRaceId: goalRace.id,
        goalDistanceKm: goalRace.distanceKm,
        goalTargetTimeS: goalRace.targetTimeS,
        programWeeks,
        level: goalRace.level,
        closedReason: null,
      })
      .returning()
      .get();

    return inserted;
  } catch (e) {
    if (isMissingTableError(e)) return null;
    throw e;
  }
}

/**
 * Returns the plan period that was active for a given calendar date,
 * or null if no period covers that date.
 *
 * Active period (end_date NULL) covers any date >= start_date.
 * Past period covers start_date <= date <= end_date inclusive.
 */
export async function getPlanPeriodForDate(iso: string): Promise<PlanPeriod | null> {
  await ensureActivePlanPeriod();
  const db = (await getDb());

  try {
    const period = await db
      .select()
      .from(schema.planPeriods)
      .where(
        and(
          lte(schema.planPeriods.startDate, iso),
          or(
            isNull(schema.planPeriods.endDate),
            gte(schema.planPeriods.endDate, iso)
          )
        )
      )
      .orderBy(desc(schema.planPeriods.startDate))
      .get();

    return period ?? null;
  } catch (e) {
    if (isMissingTableError(e)) return null;
    throw e;
  }
}

/**
 * Returns all plan periods that overlap a date range, ordered ascending.
 *
 * Used by the matrix to render multiple weeks efficiently — fetch all
 * relevant periods once instead of one query per week.
 */
export async function getPlanPeriodsInRange(
  fromIso: string,
  toIso: string
): Promise<PlanPeriod[]> {
  await ensureActivePlanPeriod();
  const db = (await getDb());

  try {
    const periods = await db
      .select()
      .from(schema.planPeriods)
      .where(
        and(
          lte(schema.planPeriods.startDate, toIso),
          or(
            isNull(schema.planPeriods.endDate),
            gte(schema.planPeriods.endDate, fromIso)
          )
        )
      )
      .orderBy(asc(schema.planPeriods.startDate))
      .all();

    return periods;
  } catch (e) {
    if (isMissingTableError(e)) return [];
    throw e;
  }
}

/* ----------------------------------------------------------------------------
 * Build engine + PlanParams for a historical period
 * ------------------------------------------------------------------------- */

export interface PlanPeriodResolved {
  period: PlanPeriod;
  engine: PlanEngine;
  params: PlanParams;
}

/**
 * Resolve a period into engine + params suitable for renderWeek().
 *
 * Falls back to current settings caps (weekly volume, long-run cap) since
 * those aren't snapshotted on the period — they're user preferences that
 * should follow the user, not be fixed at period start.
 *
 * Returns null if the period lacks the data needed to render plans
 * (missing goal info, invalid dojo, etc).
 */
export async function resolvePlanPeriod(
  period: PlanPeriod
): Promise<PlanPeriodResolved | null> {
  if (!period.goalDistanceKm || !period.goalTargetTimeS) return null;

  let engine: PlanEngine;
  try {
    const e = getEngine(period.dojo as Parameters<typeof getEngine>[0]);
    if (!e) return null;
    engine = e;
  } catch {
    return null;
  }

  // Pull current weekly/long-run caps from settings (user preferences, not period-bound)
  const db = (await getDb());
  const settingsRows = await db.select().from(schema.settings).all();
  const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
  const weeklyCapStr = settingsMap['capacity.weekly_cap_km'];
  const longCapStr = settingsMap['capacity.long_run_cap_km'];

  const params: PlanParams = {
    goalDistanceKm: period.goalDistanceKm,
    goalTimeS: period.goalTargetTimeS,
    level: (period.level as 'beginner' | 'intermediate' | 'advanced') ?? 'intermediate',
    weeklyVolumeCapKm: weeklyCapStr ? parseFloat(weeklyCapStr) : undefined,
    longRunCapKm: longCapStr ? parseFloat(longCapStr) : undefined,
    programWeeks: period.programWeeks,
    startDate: period.startDate,
  };

  return { period, engine, params };
}
