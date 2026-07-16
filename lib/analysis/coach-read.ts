/**
 * Coach read — server wrapper. Queries the most recent activity, resolves
 * its prescribed-session compliance (if a plan was active that day), reads
 * current athlete state, and calls into `coach-read-pure` for the
 * deterministic Sensei-voice assembly. Follows the same split as
 * athlete-state.ts: all the math lives in the pure module, this file only
 * does DB reads and shape translation.
 *
 * Compliance resolution note: a day can carry more than one prescribed
 * session (e.g. an easy run + strength) and more than one activity. We pick
 * the first non-rest session compliance that actually matched something
 * (flag !== 'none'); if none matched, we fall back to the first non-rest
 * session so an honest "no session recorded" read is still possible. This is
 * a best-effort match on day-of-week, not activity-id — acceptable for a
 * single daily read, same tradeoff evaluateWeek already makes internally.
 *
 * Stage 6: the "most recent activity" query excludes superseded rows
 * (activities.type = SUPERSEDED_TYPE, D-004 - see
 * lib/analysis/activity-dedup-pure.ts). A superseded manual entry and its
 * synced replacement can land within minutes of each other; without this
 * exclusion, ORDER BY startDateLocal DESC could pick the stale superseded
 * row over the accurate synced one.
 *
 * G-005 (UI redesign): resolveComplianceForActivity now also forwards
 * actualKm/actualPaceSpk and the prescribed distance/pace bands to
 * coach-read-pure's CoachReadComplianceInput, for its evidence-chip builder.
 * No new query - these all already exist on the `session` object evaluateWeek
 * produces; this is a pure pass-through.
 */

import 'server-only';
import { sql, ne } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { getActivePlan } from '@/lib/plans/active-plan';
import { resolveWeekContext } from '@/lib/plans/week-context';
import { getActivitiesInRange } from './week-queries';
import { evaluateWeek, type SessionCompliance } from './compliance';
import { getAthleteState } from './athlete-state';
import { SUPERSEDED_TYPE } from './activity-dedup-pure';
import { buildCoachRead, type CoachRead, type CoachReadComplianceInput } from './coach-read-pure';
import type { Activity } from '@/lib/db/schema';
import type { PlanParams } from '@/lib/plans/types';

function dowOf(isoLocal: string): number {
  // ISO week with Mon=0 ... Sun=6 — mirrors compliance.ts's private dowOf.
  const d = new Date(isoLocal);
  const js = d.getDay(); // Sun=0..Sat=6
  return (js + 6) % 7;
}

/** UTC-anchored Monday->Sunday range containing dateIso. See lib/dates/iso.ts for why UTC-anchoring matters. */
function weekRangeFor(dateIso: string): { startIso: string; endIso: string } {
  const d = new Date(dateIso + 'T00:00:00Z');
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { startIso: monday.toISOString().slice(0, 10), endIso: sunday.toISOString().slice(0, 10) };
}

function programWeekNumberForWeekStart(params: PlanParams, weekStartIso: string): number | null {
  const programStart = new Date(params.startDate);
  const weekStart = new Date(weekStartIso);
  const diffDays = Math.floor((weekStart.getTime() - programStart.getTime()) / 86_400_000);
  if (diffDays < 0) return null;
  const week = Math.floor(diffDays / 7) + 1;
  const programWeeks = params.programWeeks ?? 18;
  if (week > programWeeks) return null;
  return week;
}

function pickDaySession(sessions: SessionCompliance[]): SessionCompliance | null {
  const nonRest = sessions.filter((s) => s.target.type !== 'rest');
  if (nonRest.length === 0) return null;
  return nonRest.find((s) => s.flag !== 'none') ?? nonRest[0];
}

async function resolveComplianceForActivity(activity: Activity): Promise<CoachReadComplianceInput | null> {
  const activePlan = await getActivePlan();
  if (!activePlan) return null;
  const { engine, params } = activePlan;

  const dateIso = activity.startDateLocal.slice(0, 10);
  const weekRange = weekRangeFor(dateIso);
  const programWeekNumber = programWeekNumberForWeekStart(params, weekRange.startIso);
  if (programWeekNumber === null) return null;

  const context = await resolveWeekContext({
    weekStartIso: weekRange.startIso,
    weekEndIso: weekRange.endIso,
  });
  const template = engine.renderWeek(params, programWeekNumber, context);
  const weekActivities = await getActivitiesInRange(weekRange.startIso, weekRange.endIso);
  const compliance = evaluateWeek(template, weekActivities);

  const day = compliance.days.find((d) => d.dow === dowOf(activity.startDateLocal));
  const session = day ? pickDaySession(day.sessions) : null;
  if (!session) return null;

  return {
    flag: session.flag,
    message: session.message,
    sessionLabel: session.target.label,
    // G-005: pass-through only - these already exist on `session`, evaluateWeek
    // computed them, no new query. Undefined stays undefined (no `?? undefined`
    // needed) so coach-read-pure's evidence builder only emits a chip when
    // every value it needs is genuinely present.
    actualKm: session.actualKm,
    actualPaceSpk: session.actualPaceSpk,
    targetDistanceKmMin: session.target.distanceKmMin,
    targetDistanceKmMax: session.target.distanceKmMax,
    targetPaceSpkMin: session.target.paceZone?.minSpk,
    targetPaceSpkMax: session.target.paceZone?.maxSpk,
  };
}

/** Build the coach read for the most recent activity. Null if no activity exists yet. */
export async function getCoachRead(): Promise<CoachRead | null> {
  const db = getDb();
  const latest = await db
    .select()
    .from(schema.activities)
    .where(ne(schema.activities.type, SUPERSEDED_TYPE))
    .orderBy(sql`${schema.activities.startDateLocal} DESC`)
    .limit(1)
    .get();
  if (!latest) return null;

  const [compliance, athleteState] = await Promise.all([
    resolveComplianceForActivity(latest),
    getAthleteState(),
  ]);

  return buildCoachRead({
    activity: {
      type: latest.type,
      distanceKm: latest.distanceM != null ? latest.distanceM / 1000 : null,
      movingTimeMin: latest.movingTimeS != null ? latest.movingTimeS / 60 : null,
      dateIso: latest.startDateLocal.slice(0, 10),
      isSelfReported: latest.source === 'manual',
    },
    compliance,
    athleteState: athleteState
      ? { ctl: athleteState.ctl, atl: athleteState.atl, tsb: athleteState.tsb, formClass: athleteState.formClass }
      : null,
  });
}
