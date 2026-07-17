import 'server-only';
import { getDb, schema } from '@/lib/db';
import { sql } from 'drizzle-orm';

/* ----------------------------------------------------------------------------
 * Best week analysis.
 *
 * Ranks weeks of training by a composite score:
 *   - Total volume (km)
 *   - Average suffer score (proxy for intensity)
 *   - Session count (consistency)
 *   - Long run achieved
 *
 * The "Strike" — your best-ever training week.
 * -------------------------------------------------------------------------- */

export interface WeekStats {
  weekStart: string;     // YYYY-MM-DD, Monday
  totalKm: number;
  runs: number;
  longRunKm: number;
  totalSufferScore: number;
  movingTimeS: number;
  score: number;         // composite ranking score
}

export async function topWeeks(limit = 10): Promise<WeekStats[]> {
  const db = (await getDb());
  const rows = await db
    .select({
      weekStart: sql<string>`date(${schema.activities.startDateLocal}, 'weekday 0', '-6 days')`,
      totalKm: sql<number>`SUM(${schema.activities.distanceM}) / 1000.0`,
      runs: sql<number>`COUNT(*)`,
      longRunKm: sql<number>`MAX(${schema.activities.distanceM}) / 1000.0`,
      totalSufferScore: sql<number>`COALESCE(SUM(${schema.activities.sufferScore}), 0)`,
      movingTimeS: sql<number>`COALESCE(SUM(${schema.activities.movingTimeS}), 0)`,
    })
    .from(schema.activities)
    .where(sql`${schema.activities.type} IN ('Run', 'VirtualRun')`)
    .groupBy(sql`date(${schema.activities.startDateLocal}, 'weekday 0', '-6 days')`)
    .all();

  const scored = rows.map((r) => ({
    ...r,
    score: r.totalKm * 1.0 + r.totalSufferScore * 0.3 + r.runs * 2.0 + r.longRunKm * 0.5,
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
