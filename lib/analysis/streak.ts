import 'server-only';
import { eq, gte } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { SETTINGS_KEYS } from '@/lib/constants/settings-keys';

/**
 * Streak computation.
 *
 * Counts consecutive days ending YESTERDAY (the most recent completed
 * day) that have at least one qualifying activity. Today is excluded
 * because it's incomplete — the athlete may still train later. Including
 * today as a miss would generate false alarms throughout the day.
 *
 * Alarm logic: if yesterday has no qualifying activity, the streak is
 * "broken" — alarm shows. The count reflects whatever streak was
 * accumulated up to and including the last qualifying day before the
 * break.
 *
 * Mode (governed by setting `streak.run_everyday`):
 *   - false (default): any sport_type counts as a streak day
 *   - true: only Run / TrailRun / VirtualRun count
 *
 * Returns null when there's no activity history at all (don't show
 * the streak counter pre-sync).
 */

export interface StreakState {
  /** Consecutive days with qualifying activity, ending at the last unbroken day. */
  count: number;
  /** True when yesterday has no qualifying activity — alarm shows. */
  isBroken: boolean;
  /** ISO date of the most recent qualifying activity, for context. */
  lastQualifyingDate: string | null;
  /** True when run-every-day mode is active (only runs count). */
  runEverydayMode: boolean;
}

const RUN_SPORT_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

export async function getStreakState(): Promise<StreakState | null> {
  const db = (await getDb());

  const settingRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, SETTINGS_KEYS.STREAK_RUN_EVERYDAY))
    .get();

  const runEverydayMode = settingRow?.value === 'true';

  // Pull last 400 days of activities — covers any reasonable streak with
  // headroom. Indexed query, fast against local SQLite.
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 400);
  const cutoffIso = isoDate(cutoff);

  const rows = await db
    .select({
      date: schema.activities.startDateLocal,
      sportType: schema.activities.sportType,
    })
    .from(schema.activities)
    .where(gte(schema.activities.startDateLocal, cutoffIso))
    .all();

  if (rows.length === 0) return null;

  // Set of qualifying-activity day-ISOs
  const qualifyingDays = new Set<string>();
  let mostRecent: string | null = null;
  for (const r of rows) {
    if (runEverydayMode && (!r.sportType || !RUN_SPORT_TYPES.has(r.sportType))) {
      continue;
    }
    const dayIso = r.date.slice(0, 10);
    qualifyingDays.add(dayIso);
    if (!mostRecent || dayIso > mostRecent) mostRecent = dayIso;
  }

  // Edge case: in run-everyday mode but no runs in window
  if (qualifyingDays.size === 0) {
    return {
      count: 0,
      isBroken: true,
      lastQualifyingDate: null,
      runEverydayMode,
    };
  }

  // Walk back from yesterday counting consecutive qualifying days.
  // If yesterday is empty → isBroken=true and count is the run before.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = isoDate(yesterday);
  const isBroken = !qualifyingDays.has(yesterdayIso);

  const cursor = new Date(yesterday);
  if (isBroken) {
    // Skip yesterday — start counting from the day before
    cursor.setDate(cursor.getDate() - 1);
  }

  let count = 0;
  while (qualifyingDays.has(isoDate(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
    if (count > 365) break; // hard runaway guard
  }

  return {
    count,
    isBroken,
    lastQualifyingDate: mostRecent,
    runEverydayMode,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
