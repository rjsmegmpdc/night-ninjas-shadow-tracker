import 'server-only';

/**
 * R2.5 VO2 max - read layer.
 *
 * Merges two storage locations into one resolved view:
 *   - vo2max_observations: manual-lab / cooper / rockport (full history)
 *   - daily_health_metrics.vo2max_device: device estimates (Garmin etc.)
 *
 * Then resolves a current value by source priority (lab > cooper >
 * rockport > device) and returns the full cross-source trend series.
 *
 * Degrades to empty when tables are absent (migrations not yet run).
 */

import { isNotNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import {
  resolveVo2,
  type Vo2Observation,
  type Vo2Source,
  type ResolvedVo2,
} from './vo2max-pure';

export type { Vo2Observation, Vo2Source, ResolvedVo2 } from './vo2max-pure';
export { cooperVo2, rockportVo2, vo2FitnessBand, resolveVo2 } from './vo2max-pure';

function isMissingTable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /no such table/i.test(m);
}

async function readStoredObservations(): Promise<Vo2Observation[]> {
  const db = (await getDb());
  try {
    const rows = await db.select().from(schema.vo2maxObservations).all();
    return rows.map((r) => ({
      dateIso: r.date,
      source: r.source as Vo2Source,
      value: r.value,
    }));
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

async function readDeviceObservations(): Promise<Vo2Observation[]> {
  const db = (await getDb());
  try {
    const rows = await db
      .select()
      .from(schema.dailyHealthMetrics)
      .where(isNotNull(schema.dailyHealthMetrics.vo2maxDevice))
      .all();
    return rows
      .filter((r) => r.vo2maxDevice !== null)
      .map((r) => ({ dateIso: r.date, source: 'device' as Vo2Source, value: r.vo2maxDevice as number }));
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export interface Vo2View extends ResolvedVo2 {
  /** Distinct sources that have at least one observation */
  sources: Vo2Source[];
  /** Change vs the earliest observation in the series (same units) */
  deltaFromFirst: number | null;
}

export async function getVo2View(): Promise<Vo2View> {
  const [stored, device] = await Promise.all([readStoredObservations(), readDeviceObservations()]);
  const all = [...stored, ...device];
  const resolved = resolveVo2(all);

  const sources = [...new Set(all.map((o) => o.source))] as Vo2Source[];
  const deltaFromFirst =
    resolved.series.length >= 2 && resolved.current !== null
      ? Math.round((resolved.current - resolved.series[0].value) * 10) / 10
      : null;

  return { ...resolved, sources, deltaFromFirst };
}

/* ----------------------------------------------------------------------------
 * R2.6 - assemble insight context from training load + biometrics, then
 * run the pure insights engine. Kept here (server) since it reads several
 * tables; the analysis itself is pure (vo2max-insights).
 * -------------------------------------------------------------------------- */

import { getMonthlyVolume } from './trends';
import { getBiometricSummary } from './biometrics';
import { buildVo2Insights, type Vo2InsightReport, type InsightContext } from './vo2max-insights';

export type { Vo2Insight, Vo2InsightReport, InsightTier } from './vo2max-insights';

export async function getVo2Insights(view: Vo2View): Promise<Vo2InsightReport> {
  if (view.series.length < 2) {
    return { insights: [], byTier: { trend: [], context: [], outlier: [] }, hasInsights: false };
  }

  // Build context: recent vs prior weekly km (from monthly volume), recent
  // sleep + resting HR (from biometrics). All optional - the engine hedges.
  const [monthly, bio] = await Promise.all([getMonthlyVolume(6), getBiometricSummary(28)]);

  const withKm = monthly.filter((m) => m.km > 0);
  const recentWeeklyKm = withKm.length ? withKm[withKm.length - 1].km / 4.345 : null;
  const priorWeeklyKm = withKm.length >= 2 ? withKm[withKm.length - 2].km / 4.345 : null;

  const recentSleepHours = bio.sleep.mean !== null ? bio.sleep.mean / 3600 : null;

  const ctx: InsightContext = {
    recentWeeklyKm,
    priorWeeklyKm,
    recentSleepHours,
    recentRestingHr: bio.rhr.mean,
    priorRestingHr: bio.rhr.priorMean,
  };

  return buildVo2Insights(view.series, ctx);
}
