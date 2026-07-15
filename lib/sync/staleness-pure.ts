/**
 * Daily-loop Stage 1 - ambient sync staleness (PURE).
 *
 * No DB, no server-only, no I/O. Decides whether opening Patrol should
 * auto-trigger the existing incremental Strava sync, given only:
 *   - when the last sync that actually SUCCEEDED completed (or null)
 *   - the current time
 *   - the freshness threshold (hours)
 *   - whether a sync job is currently active (running/paused)
 *   - whether the most recent job attempt failed (error/rate_limited)
 *
 * Suppression order, most authoritative first: active job > failed job >
 * never-synced > staleness. A failed latest job does NOT auto-retry -
 * retrying after a failure is a manual action (SyncButton), not ambient,
 * so we don't hammer Strava while it's down or rate-limited.
 *
 * Time comparisons use epoch milliseconds only (Date#getTime()), never
 * calendar-day construction from ISO strings - see the repo's known TZ
 * bug pattern around `new Date(isoDateOnly)`.
 */

export interface StalenessInput {
  /** When the last successfully-completed sync job finished, or null if none. */
  lastSuccessfulSyncCompletedAt: Date | null;
  /** Current time. */
  now: Date;
  /** Freshness window in hours before ambient sync should fire. Default 6. */
  thresholdHours?: number;
  /** True if a sync job is currently running or paused (mid-flight). */
  syncCurrentlyRunningOrPaused: boolean;
  /** True if the most recent job attempt ended in error or rate_limited. */
  lastJobFailed: boolean;
}

export interface StalenessResult {
  shouldSync: boolean;
  reason: 'sync-already-active' | 'last-sync-errored' | 'never-synced' | 'stale' | 'fresh';
}

const DEFAULT_THRESHOLD_HOURS = 6;
const MS_PER_HOUR = 3_600_000;

export function evaluateSyncStaleness(input: StalenessInput): StalenessResult {
  const thresholdHours = input.thresholdHours ?? DEFAULT_THRESHOLD_HOURS;

  if (input.syncCurrentlyRunningOrPaused) {
    return { shouldSync: false, reason: 'sync-already-active' };
  }

  if (input.lastJobFailed) {
    return { shouldSync: false, reason: 'last-sync-errored' };
  }

  if (input.lastSuccessfulSyncCompletedAt === null) {
    return { shouldSync: true, reason: 'never-synced' };
  }

  const ageHours =
    (input.now.getTime() - input.lastSuccessfulSyncCompletedAt.getTime()) / MS_PER_HOUR;

  if (ageHours >= thresholdHours) {
    return { shouldSync: true, reason: 'stale' };
  }

  return { shouldSync: false, reason: 'fresh' };
}
