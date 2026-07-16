/**
 * Athlete state — CTL / ATL / TSB derived from the load point-stream.
 *
 * Implements the Banister Performance Manager Chart (PMC) model on
 * Daniels-points input rather than TSS. Same exponentially-weighted
 * moving averages, just a different unit. The relative-magnitude
 * relationships and physiological interpretation are identical.
 *
 *   CTL — Chronic Training Load. 28-day exponentially-weighted moving
 *         average of daily load points. Represents fitness — what the
 *         athlete can sustain. Slow to change.
 *
 *   ATL — Acute Training Load. 7-day EWMA. Represents recent fatigue.
 *         Fast to change.
 *
 *   TSB — Training Stress Balance. CTL − ATL. Represents form / freshness.
 *         Positive = fresh; negative = loaded.
 *
 * Window: 8 weeks (56 days) of historical activity is queried to populate
 * the EWMAs. Long enough that the chronic average is fully populated
 * (CTL τ=42 days needs ~6 weeks to converge), short enough that ancient
 * training noise doesn't pollute current state.
 *
 * The pure math (EWMA, classification, confidence rollup) lives in
 * `./athlete-state-pure.ts` so it can be unit-tested without spinning
 * up SQLite or the server-only runtime.
 *
 * Stage 6 (daily loop): the load query excludes activities superseded by a
 * synced overlap (activities.type = SUPERSEDED_TYPE, D-004 - see
 * lib/analysis/activity-dedup-pure.ts). Every other type-filtered consumer
 * in the app (compliance.ts, week-queries.ts, unlogged-sessions-pure.ts)
 * already excludes the sentinel for free, because it never matches their
 * 'Run'/'VirtualRun'/etc filters. This query is the one exception -
 * computeActivityLoad() takes any activity regardless of type - so it needs
 * an explicit exclusion, which is what previously let a superseded manual
 * row and its synced replacement both count into CTL/ATL/TSB.
 */

import 'server-only';
import { gte, lte, and, ne } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { computeActivityLoad, type AthleteCalibration } from './load';
import { SUPERSEDED_TYPE } from './activity-dedup-pure';
import {
  computeEwma,
  classifyForm,
  rollupConfidence,
  round1,
  deriveDataFidelity,
  CTL_TIME_CONSTANT,
  ATL_TIME_CONSTANT,
  WINDOW_DAYS,
  type FormClass,
  type DataFidelity,
} from './athlete-state-pure';

export type { FormClass, DataFidelity };
export { deriveDataFidelity };

export interface AthleteState {
  asOfIso: string;
  ctl: number;
  atl: number;
  tsb: number;
  formClass: FormClass;
  confidence: 'calibrated' | 'pace-only' | 'estimated';
  activityCount: number;
  /**
   * Data fidelity of the chronologically most recent activity in the query
   * window (device-recorded vs P0-7 self-reported). Stage 6 - additive; not
   * a rollup over the whole window, just the freshest input, since that's
   * what a "how much should I trust this read right now" glance cares about.
   */
  dataFidelity: DataFidelity;
}

interface DailyLoadQuery {
  dailyLoad: Map<string, number>;
  confidenceCounts: { calibrated: number; 'pace-only': number; estimated: number };
  withLoad: number;
  /** `source` of the chronologically most recent activity in the window. */
  latestSource: string;
}

/**
 * Shared query + per-day aggregation behind getAthleteState and
 * getDailyLoadMap. Returns null when the window holds no activities.
 */
async function queryDailyLoad(
  calibration: AthleteCalibration,
  today: string,
  windowDays: number
): Promise<DailyLoadQuery | null> {
  // UTC-anchored: windowStartIso is compared against startDateLocal (a plain
  // 'YYYY-MM-DD...' string) in SQL, so a local-construct + UTC-read would start
  // the window a day early in NZ (UTC+12).
  const windowStart = new Date(today + 'T00:00:00Z');
  windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const db = getDb();
  const activities = await db
    .select()
    .from(schema.activities)
    .where(
      and(
        gte(schema.activities.startDateLocal, windowStartIso),
        lte(schema.activities.startDateLocal, today + 'T23:59:59'),
        ne(schema.activities.type, SUPERSEDED_TYPE)
      )
    )
    .all();

  if (activities.length === 0) return null;

  const dailyLoad = new Map<string, number>();
  const confidenceCounts = { calibrated: 0, 'pace-only': 0, estimated: 0 };
  let withLoad = 0;
  let latestSource = activities[0].source;
  let latestStartDateLocal = activities[0].startDateLocal;

  for (const a of activities) {
    if (a.startDateLocal > latestStartDateLocal) {
      latestStartDateLocal = a.startDateLocal;
      latestSource = a.source;
    }

    const load = computeActivityLoad(a, calibration);
    if (!load) continue;
    withLoad++;
    confidenceCounts[load.confidence]++;
    const dayIso = a.startDateLocal.slice(0, 10);
    dailyLoad.set(dayIso, (dailyLoad.get(dayIso) ?? 0) + load.points);
  }

  return { dailyLoad, confidenceCounts, withLoad, latestSource };
}

export async function getAthleteState(
  calibration: AthleteCalibration = {},
  asOfIso?: string
): Promise<AthleteState | null> {
  const today = asOfIso ?? new Date().toISOString().slice(0, 10);
  const q = await queryDailyLoad(calibration, today, WINDOW_DAYS);
  if (!q) return null;

  const ctl = computeEwma(q.dailyLoad, today, WINDOW_DAYS, CTL_TIME_CONSTANT);
  const atl = computeEwma(q.dailyLoad, today, WINDOW_DAYS, ATL_TIME_CONSTANT);
  const tsb = ctl - atl;

  return {
    asOfIso: today,
    ctl: round1(ctl),
    atl: round1(atl),
    tsb: round1(tsb),
    formClass: classifyForm(tsb),
    confidence: rollupConfidence(q.confidenceCounts, q.withLoad),
    activityCount: q.withLoad,
    dataFidelity: deriveDataFidelity(q.latestSource),
  };
}

/**
 * Per-day load points over a recent window, keyed by plain 'YYYY-MM-DD'
 * (the same keys getAthleteState's EWMA walks). Feeds the Phase 3b part 2
 * monotony trigger. Returns an empty Map when there is no recent activity.
 */
export async function getDailyLoadMap(
  calibration: AthleteCalibration = {},
  asOfIso?: string,
  windowDays = 28
): Promise<Map<string, number>> {
  const today = asOfIso ?? new Date().toISOString().slice(0, 10);
  const q = await queryDailyLoad(calibration, today, windowDays);
  return q?.dailyLoad ?? new Map<string, number>();
}
