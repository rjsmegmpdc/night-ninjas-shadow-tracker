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

/* ----------------------------------------------------------------------------
 * Stage 6 (daily loop) - supersede mechanics, PURE.
 *
 * D-004 (locked): when a synced activity overlaps an existing manual entry,
 * the synced version wins by default. Rather than merging or deleting either
 * row, the manual row's `type` is swapped to the SUPERSEDED_TYPE sentinel.
 * Every existing type-filtered consumer (compliance.ts's Run/VirtualRun
 * checks, week-queries.ts's stats, unlogged-sessions-pure's COVERING_TYPES,
 * athlete-state.ts's load query) already excludes anything whose type isn't
 * one of the types it looks for - so the sentinel alone stops the row
 * counting a second time almost everywhere for free. The one place that
 * doesn't discriminate by type (athlete-state.ts's load query, which feeds
 * every activity in its window to computeActivityLoad()) gets an explicit
 * exclusion in that file.
 *
 * The athlete can restore a superseded manual entry (an explicit override of
 * the default), which reverses the transform on the manual row AND applies
 * the same sentinel treatment to the synced counterpart instead - only one
 * of the pair counts at a time.
 *
 * `nowIso` is an explicit parameter, not read internally via `new Date()` -
 * these functions stay deterministic/pure like every other `*-pure.ts`
 * module in this codebase (see prompt-context-pure.ts's same discipline).
 * This is a small, deliberate deviation from the literal two-argument
 * `buildSupersededUpdate(originalType, syncedSourceId)` / one-argument
 * `buildRestoreUpdate(rawJson)` signatures as briefed - callers pass the
 * timestamp they already have (e.g. sync-runner.ts's `now`).
 * -------------------------------------------------------------------------- */

/** Sentinel `activities.type` value marking a manual row as superseded by a synced overlap. */
export const SUPERSEDED_TYPE = 'ManualSuperseded';

export interface SupersedeMarker {
  /** The manual row's `type` before it was superseded (e.g. 'Run') - what buildRestoreUpdate restores. */
  originalType: string;
  /** sourceId of the synced activity that superseded this row. */
  supersededBySync: string;
  /** ISO timestamp of the supersede. */
  supersededAt: string;
  /** ISO timestamp of the most recent restore, if this row has been restored since. */
  restoredAt?: string;
}

export interface ActivityTypeUpdate {
  type: string;
  /** JSON string - a standalone fragment containing only this call's marker. The caller merges it with whatever else already lives in that row's rawJson (see sync-runner.ts's recordManualOverlapIfAny). */
  rawJson: string;
}

/** Parse `activities.raw_json`, tolerating null/malformed content. Shared by sync-runner.ts and prompt-context.ts so all three files read the same shape the same way. */
export function safeParseJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Build the {type, rawJson} update that marks an activity row as superseded.
 * Used both for the manual row when a sync first overlaps it, and
 * symmetrically for the synced row when the athlete restores the manual
 * entry (the pair only ever has one "active" side at a time).
 */
export function buildSupersededUpdate(
  originalType: string,
  syncedSourceId: string,
  nowIso: string
): ActivityTypeUpdate {
  const marker: SupersedeMarker = {
    originalType,
    supersededBySync: syncedSourceId,
    supersededAt: nowIso,
  };
  return { type: SUPERSEDED_TYPE, rawJson: JSON.stringify({ supersede: marker }) };
}

/**
 * Reverse a supersede. `rawJson` must be the row's CURRENT raw_json (which
 * may have other keys merged in alongside `supersede` - only that key is
 * read). Returns null if no supersede marker is present, so callers can use
 * it to validate "is this row actually superseded?" before acting (see
 * lib/actions/manual-activity.ts's restoreManualActivity).
 *
 * The supersede marker is kept, not deleted, with `restoredAt` added - the
 * history of "superseded, then restored" survives in case this cycles again
 * on a future sync.
 */
export function buildRestoreUpdate(rawJson: string | null, nowIso: string): ActivityTypeUpdate | null {
  const parsed = safeParseJson(rawJson);
  const supersede = parsed.supersede as Partial<SupersedeMarker> | undefined;
  if (!supersede || typeof supersede.originalType !== 'string') return null;

  const merged = {
    ...parsed,
    supersede: { ...supersede, restoredAt: nowIso },
  };
  return { type: supersede.originalType, rawJson: JSON.stringify(merged) };
}
