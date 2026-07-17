import 'server-only';

/**
 * Phase 12 surfacing - read layer for daily_health_metrics.
 *
 * One row per (date, source). Collapsed to one value per field per day by
 * SOURCE PRIORITY (manual-lab > garmin > whoop > apple-health > coros >
 * manual), resolved per-field via the pure helpers in biometrics-pure.
 *
 * Degrades to empty when the table is absent (migration not yet run) so
 * the UI shows its pre-sync state.
 */

import { gte, lte, and } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import {
  resolveDayRows,
  trendFor,
  type ResolvedDayMetrics,
  type MetricTrend,
} from './biometrics-pure';

export type { ResolvedDayMetrics, MetricTrend, MetricRowLike } from './biometrics-pure';
export { resolveDayRows, trendFor, rankSource } from './biometrics-pure';

function isMissingTable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /no such table/i.test(m);
}

export async function getResolvedMetrics(startIso: string, endIso: string): Promise<ResolvedDayMetrics[]> {
  const db = (await getDb());
  let rows: (typeof schema.dailyHealthMetrics.$inferSelect)[];
  try {
    rows = await db
      .select()
      .from(schema.dailyHealthMetrics)
      .where(and(gte(schema.dailyHealthMetrics.date, startIso), lte(schema.dailyHealthMetrics.date, endIso)))
      .all();
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }

  const byDate = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }

  const out: ResolvedDayMetrics[] = [];
  for (const [date, dayRows] of byDate) {
    out.push(resolveDayRows(date, dayRows));
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export interface BiometricSummary {
  hasAnyData: boolean;
  windowDays: number;
  rhr: MetricTrend;
  hrv: MetricTrend;
  sleep: MetricTrend;
  sleepScore: MetricTrend;
  bodyBattery: MetricTrend;
  stress: MetricTrend;
  vo2max: MetricTrend;
  weight: MetricTrend;
  sources: string[];
}

export async function getBiometricSummary(windowDays = 14): Promise<BiometricSummary> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (windowDays - 1));
  const startIso = start.toISOString().slice(0, 10);
  const endIso = today.toISOString().slice(0, 10);

  const days = await getResolvedMetrics(startIso, endIso);
  const sources = [...new Set(days.flatMap((d) => d.sources))];

  return {
    hasAnyData: days.some((d) => d.sources.length > 0),
    windowDays,
    rhr: trendFor(days, 'rhrBpm'),
    hrv: trendFor(days, 'hrvMs'),
    sleep: trendFor(days, 'sleepDurationS'),
    sleepScore: trendFor(days, 'sleepScore'),
    bodyBattery: trendFor(days, 'bodyBattery'),
    stress: trendFor(days, 'stressScore'),
    vo2max: trendFor(days, 'vo2maxDevice'),
    weight: trendFor(days, 'weightKg'),
    sources,
  };
}
