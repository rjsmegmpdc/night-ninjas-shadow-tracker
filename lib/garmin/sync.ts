/**
 * Garmin sync writer (Phase 12) - server-only.
 *
 * Pulls a date range of daily snapshots and upserts them into
 * daily_health_metrics. Upsert key is (date, source) so re-syncing a day
 * overwrites rather than duplicates.
 */

import 'server-only';
import { getDb, schema } from '@/lib/db';
import { fetchDailySnapshot } from './client';
import { snapshotToRow } from './mapper';
import { setGarminLastSyncAt } from '@/lib/store/settings';

export interface GarminSyncResult {
  ok: boolean;
  daysWritten: number;
  daysSkipped: number;
  error?: string;
}

/**
 * Sync the last `days` days (inclusive of today) from Garmin.
 * Default 7 for an incremental pull; backfill passes a larger number.
 */
export async function syncGarminRange(days = 7): Promise<GarminSyncResult> {
  const db = (await getDb());
  let daysWritten = 0;
  let daysSkipped = 0;

  try {
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);

      const snapshot = await fetchDailySnapshot(iso);
      if (!snapshot) {
        daysSkipped++;
        continue;
      }

      // Skip wholly-empty days (no device worn)
      const hasAny =
        snapshot.rhrBpm !== null ||
        snapshot.hrvMs !== null ||
        snapshot.sleepDurationS !== null ||
        snapshot.stressScore !== null ||
        snapshot.vo2maxDevice !== null ||
        snapshot.weightKg !== null;
      if (!hasAny) {
        daysSkipped++;
        continue;
      }

      const row = snapshotToRow(snapshot);
      await db
        .insert(schema.dailyHealthMetrics)
        .values(row)
        .onConflictDoUpdate({
          target: [schema.dailyHealthMetrics.date, schema.dailyHealthMetrics.source],
          set: {
            rhrBpm: row.rhrBpm,
            hrvMs: row.hrvMs,
            sleepDurationS: row.sleepDurationS,
            sleepScore: row.sleepScore,
            stressScore: row.stressScore,
            bodyBattery: row.bodyBattery,
            vo2maxDevice: row.vo2maxDevice,
            weightKg: row.weightKg,
            raw: row.raw,
            syncedAt: new Date().toISOString(),
          },
        });
      daysWritten++;
    }

    await setGarminLastSyncAt(new Date().toISOString());
    return { ok: true, daysWritten, daysSkipped };
  } catch (err) {
    return {
      ok: false,
      daysWritten,
      daysSkipped,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
