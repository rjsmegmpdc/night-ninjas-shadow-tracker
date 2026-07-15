/**
 * Stage 2 (daily loop) - manual/synced activity overlap detection, PURE.
 *
 * Used by the Strava ingest path (lib/sources/sync-runner.ts) to spot when
 * an incoming synced activity is probably the same run as an existing
 * manual entry, so the overlap can be recorded (never auto-merged or
 * deleted - that's the Wave 2 "supersede" UI).
 *
 * Overlap = same local date AND (duration within +/-20% OR distance within
 * +/-15%). A metric only counts toward the match if both sides have it as a
 * positive, non-null value - a missing metric on either side never counts as
 * a match on its own.
 */

export interface OverlapCandidate {
  /** YYYY-MM-DD, local */
  localDateIso: string;
  durationS: number | null;
  distanceM: number | null;
}

const DURATION_TOLERANCE = 0.2;
const DISTANCE_TOLERANCE = 0.15;

function withinTolerance(x: number, y: number, tolerance: number): boolean {
  return Math.abs(x - y) <= Math.max(x, y) * tolerance;
}

export function activitiesOverlap(a: OverlapCandidate, b: OverlapCandidate): boolean {
  if (a.localDateIso !== b.localDateIso) return false;

  const durationMatch =
    a.durationS != null && b.durationS != null && a.durationS > 0 && b.durationS > 0
      ? withinTolerance(a.durationS, b.durationS, DURATION_TOLERANCE)
      : false;
  if (durationMatch) return true;

  const distanceMatch =
    a.distanceM != null && b.distanceM != null && a.distanceM > 0 && b.distanceM > 0
      ? withinTolerance(a.distanceM, b.distanceM, DISTANCE_TOLERANCE)
      : false;
  return distanceMatch;
}

/** Returns the first overlapping candidate, or null if none overlap. */
export function findOverlappingActivity<T extends OverlapCandidate>(
  incoming: OverlapCandidate,
  candidates: T[]
): T | null {
  return candidates.find((c) => activitiesOverlap(incoming, c)) ?? null;
}
