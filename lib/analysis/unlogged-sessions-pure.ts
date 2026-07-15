import type { SessionTarget } from '@/lib/plans/types';
import type { Activity } from '@/lib/db/schema';

/**
 * Stage 2 (daily loop) - unlogged prescribed sessions, PURE.
 *
 * Finds past, non-rest prescribed sessions that have no matching Run-type
 * activity on their local date. Feeds the "log a manual result?" nudge.
 *
 * "Covered" uses the same Run-type set as compliance.ts's evaluateSession
 * (Run | VirtualRun) rather than week-queries' broader stats set (which also
 * includes TrailRun) - this function is answering the same question
 * evaluateSession does ("would this come back 'none'?"), so it stays
 * consistent with that engine rather than the aggregate-stats definition.
 *
 * No DB, no I/O - callers supply the prescribed sessions (with their real
 * calendar dates already resolved from a WeekTemplate) and the activities in
 * range.
 */

const COVERING_TYPES = new Set(['Run', 'VirtualRun']);

export interface PrescribedSessionOnDate {
  /** YYYY-MM-DD, local */
  dateIso: string;
  session: SessionTarget;
}

export interface UnloggedSession extends PrescribedSessionOnDate {
  daysAgo: number;
}

/** UTC-anchored day diff - see lib/dates/iso.ts for why the anchoring matters. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00Z').getTime();
  const to = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((to - from) / 86_400_000);
}

export function findUnloggedSessions(
  prescribed: PrescribedSessionOnDate[],
  activities: Pick<Activity, 'type' | 'startDateLocal'>[],
  todayLocalIso: string,
  lookbackDays = 3
): UnloggedSession[] {
  const coveredDates = new Set(
    activities
      .filter((a) => COVERING_TYPES.has(a.type))
      .map((a) => a.startDateLocal.slice(0, 10))
  );

  const earliestIso = new Date(todayLocalIso + 'T00:00:00Z');
  earliestIso.setUTCDate(earliestIso.getUTCDate() - lookbackDays);
  const earliestDateIso = earliestIso.toISOString().slice(0, 10);

  const result: UnloggedSession[] = [];
  for (const p of prescribed) {
    if (p.session.type === 'rest') continue;
    if (p.dateIso >= todayLocalIso) continue; // excludes today and any future date
    if (p.dateIso < earliestDateIso) continue; // outside the lookback window
    if (coveredDates.has(p.dateIso)) continue;
    result.push({ ...p, daysAgo: daysBetween(p.dateIso, todayLocalIso) });
  }
  return result;
}
