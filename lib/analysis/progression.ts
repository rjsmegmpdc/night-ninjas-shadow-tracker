/**
 * Progression flags — running-volume safety checks.
 *
 * Coaches use two heuristics constantly to prevent injury:
 *
 *   1. Weekly mileage progression — don't bump volume by more than +10%
 *      week-over-week, or +25% over the recent 4-week mean.
 *
 *   2. Long-run proportion — long run shouldn't exceed ~35% of weekly
 *      volume; growth shouldn't exceed +2km per 2-week period.
 *
 * Both rules are stated and surfaced in **kilometres**, not load points.
 * The reasoning: load points are for the engine; km are for the human.
 * "You bumped 12km this week" reads naturally; "your weekly Daniels
 * points jumped 23" reads as alien.
 *
 * The load model and these progression checks coexist — they answer
 * different questions. Load = stress per minute, calibrated. Progression
 * = volume per week, raw. Both are right for their purpose.
 */

import 'server-only';
import { gte, lte, and } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { classifySport, isRunning } from './sport-classifier';
import { addDaysIso } from '@/lib/dates/iso';

/* ----------------------------------------------------------------------------
 * Mileage progression
 * ------------------------------------------------------------------------- */

export type ProgressionSeverity = 'ok' | 'caution' | 'risk';

export interface MileageProgression {
  /** This week's running km total. */
  thisWeekKm: number;
  /** Last week's running km total. */
  lastWeekKm: number;
  /** 4-week trailing mean (excluding this week). */
  trailing4WeekMeanKm: number;
  /** Percent change vs last week (e.g. +12.5). */
  weekOverWeekDeltaPct: number;
  /** Percent change vs trailing 4-week mean (e.g. +28.3). */
  vsMean4WeekDeltaPct: number;
  /**
   * Severity flag based on combined rules:
   *   'ok'      — both deltas within safe ranges
   *   'caution' — week-over-week >+10% OR vs-mean >+15%
   *   'risk'    — week-over-week >+25% OR vs-mean >+25%
   */
  severity: ProgressionSeverity;
  /** Human-readable explanation suitable for tooltips. */
  message: string;
}

/**
 * Check this-week's running mileage against last week and trailing 4-week
 * mean. Returns null when there's not enough history to evaluate (e.g.
 * brand new athlete with one week of data).
 */
export async function checkMileageProgression(
  thisWeekStartIso: string
): Promise<MileageProgression | null> {
  const lastWeekStart = isoOffset(thisWeekStartIso, -7);
  const fourWeeksBack = isoOffset(thisWeekStartIso, -28);

  const thisWeekEnd = isoOffset(thisWeekStartIso, 6);
  const lastWeekEnd = isoOffset(thisWeekStartIso, -1);
  const fourWeeksEnd = isoOffset(thisWeekStartIso, -1); // 4-week window ends day before this week

  const [thisWeekKm, lastWeekKm, trailingKm] = await Promise.all([
    sumRunningKm(thisWeekStartIso, thisWeekEnd),
    sumRunningKm(lastWeekStart, lastWeekEnd),
    sumRunningKm(fourWeeksBack, fourWeeksEnd),
  ]);

  // Need at least one prior week of data to evaluate
  if (lastWeekKm === 0 && trailingKm === 0) return null;

  const trailing4WeekMeanKm = trailingKm / 4;
  const weekOverWeekDeltaPct =
    lastWeekKm > 0 ? ((thisWeekKm - lastWeekKm) / lastWeekKm) * 100 : 0;
  const vsMean4WeekDeltaPct =
    trailing4WeekMeanKm > 0
      ? ((thisWeekKm - trailing4WeekMeanKm) / trailing4WeekMeanKm) * 100
      : 0;

  const severity = decideMileageSeverity(weekOverWeekDeltaPct, vsMean4WeekDeltaPct);
  const message = buildMileageMessage(
    thisWeekKm,
    lastWeekKm,
    weekOverWeekDeltaPct,
    vsMean4WeekDeltaPct,
    severity
  );

  return {
    thisWeekKm: round1(thisWeekKm),
    lastWeekKm: round1(lastWeekKm),
    trailing4WeekMeanKm: round1(trailing4WeekMeanKm),
    weekOverWeekDeltaPct: round1(weekOverWeekDeltaPct),
    vsMean4WeekDeltaPct: round1(vsMean4WeekDeltaPct),
    severity,
    message,
  };
}

function decideMileageSeverity(
  wowPct: number,
  vsMeanPct: number
): ProgressionSeverity {
  if (wowPct > 25 || vsMeanPct > 25) return 'risk';
  if (wowPct > 10 || vsMeanPct > 15) return 'caution';
  return 'ok';
}

function buildMileageMessage(
  thisKm: number,
  lastKm: number,
  wowPct: number,
  vsMeanPct: number,
  severity: ProgressionSeverity
): string {
  const wowSign = wowPct >= 0 ? '+' : '';
  const wowStr = `${wowSign}${round1(wowPct)}% vs last week (${round1(lastKm)}→${round1(thisKm)} km)`;
  const meanSign = vsMeanPct >= 0 ? '+' : '';
  const meanStr = `${meanSign}${round1(vsMeanPct)}% vs 4-week mean`;

  if (severity === 'risk') {
    return `Volume spike: ${wowStr}. ${meanStr}. Consider a cutback week.`;
  }
  if (severity === 'caution') {
    return `Volume rising: ${wowStr}. ${meanStr}.`;
  }
  return `${wowStr}. ${meanStr}.`;
}

/* ----------------------------------------------------------------------------
 * Long-run proportion
 * ------------------------------------------------------------------------- */

export interface LongRunCheck {
  /** This week's longest single run in km. */
  longRunKm: number;
  /** This week's total running km. */
  weeklyTotalKm: number;
  /** Long run as % of weekly total. */
  proportionPct: number;
  /** Long run growth vs 2 weeks ago (km). */
  growthVs2WeeksKm: number;
  /**
   * Severity flag:
   *   'ok'      — proportion ≤ 35% AND growth ≤ +2 km
   *   'caution' — proportion 35-40% OR growth +2 to +4 km
   *   'risk'    — proportion > 40% OR growth > +4 km
   */
  severity: ProgressionSeverity;
  message: string;
}

/**
 * Check this week's long run for safety against weekly total and
 * recent growth.
 *
 * Returns null when no running activities exist in the week.
 */
export async function checkLongRunProportion(
  thisWeekStartIso: string
): Promise<LongRunCheck | null> {
  const thisWeekEnd = isoOffset(thisWeekStartIso, 6);
  const twoWeeksAgoStart = isoOffset(thisWeekStartIso, -14);
  const twoWeeksAgoEnd = isoOffset(thisWeekStartIso, -8);

  const [thisWeek, twoWeeksAgo] = await Promise.all([
    getWeeklyRunStats(thisWeekStartIso, thisWeekEnd),
    getWeeklyRunStats(twoWeeksAgoStart, twoWeeksAgoEnd),
  ]);

  if (thisWeek.totalKm === 0 || thisWeek.longRunKm === 0) return null;

  const proportionPct = (thisWeek.longRunKm / thisWeek.totalKm) * 100;
  const growthVs2WeeksKm = thisWeek.longRunKm - twoWeeksAgo.longRunKm;
  const severity = decideLongRunSeverity(proportionPct, growthVs2WeeksKm);

  const message = buildLongRunMessage(
    thisWeek.longRunKm,
    thisWeek.totalKm,
    proportionPct,
    growthVs2WeeksKm,
    severity
  );

  return {
    longRunKm: round1(thisWeek.longRunKm),
    weeklyTotalKm: round1(thisWeek.totalKm),
    proportionPct: round1(proportionPct),
    growthVs2WeeksKm: round1(growthVs2WeeksKm),
    severity,
    message,
  };
}

function decideLongRunSeverity(
  proportionPct: number,
  growthKm: number
): ProgressionSeverity {
  if (proportionPct > 40 || growthKm > 4) return 'risk';
  if (proportionPct > 35 || growthKm > 2) return 'caution';
  return 'ok';
}

function buildLongRunMessage(
  longKm: number,
  totalKm: number,
  proportionPct: number,
  growthKm: number,
  severity: ProgressionSeverity
): string {
  const propStr = `${round1(longKm)}km long run (${round1(proportionPct)}% of weekly total)`;
  const growSign = growthKm >= 0 ? '+' : '';
  const growStr = `${growSign}${round1(growthKm)}km vs 2 weeks ago`;

  if (severity === 'risk') {
    return `${propStr}, ${growStr}. Long run is too large a share of weekly volume — risk territory.`;
  }
  if (severity === 'caution') {
    return `${propStr}, ${growStr}. Watch the proportion.`;
  }
  return `${propStr}, ${growStr}.`;
}

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

interface WeekRunStats {
  totalKm: number;
  longRunKm: number;
}

async function getWeeklyRunStats(
  fromIso: string,
  toIso: string
): Promise<WeekRunStats> {
  const db = (await getDb());
  const activities = await db
    .select()
    .from(schema.activities)
    .where(
      and(
        gte(schema.activities.startDateLocal, fromIso),
        lte(schema.activities.startDateLocal, toIso + 'T23:59:59')
      )
    )
    .all();

  let totalKm = 0;
  let longRunKm = 0;

  for (const a of activities) {
    const cat = classifySport(a.sportType ?? a.type, a.name);
    if (!isRunning(cat)) continue;
    if (!a.distanceM || a.distanceM <= 0) continue;
    const km = a.distanceM / 1000;
    totalKm += km;
    if (km > longRunKm) longRunKm = km;
  }

  return { totalKm, longRunKm };
}

async function sumRunningKm(fromIso: string, toIso: string): Promise<number> {
  const stats = await getWeeklyRunStats(fromIso, toIso);
  return stats.totalKm;
}

// Thin wrapper over the shared UTC-anchored helper (kept for call-site brevity).
function isoOffset(iso: string, days: number): string {
  return addDaysIso(iso, days);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
