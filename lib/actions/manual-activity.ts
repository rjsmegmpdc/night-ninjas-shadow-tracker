'use server';

/**
 * Stage 2 (daily loop) - P0-7 manual results fallback. Logs a run that has
 * no synced data as a manual `activities` row (source='manual'), so it flows
 * through compliance/ACWR identically to a synced run. Optionally upserts
 * RPE into that day's journal entry (additive - never touches other journal
 * fields, mirrors lib/actions/wellness.ts's logWellness).
 *
 * Timezone: lib/store/settings.ts (getUserTimezone) is owned by another
 * teammate this wave and already exposes the setting used here — imported
 * read-only, not modified.
 */

import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { getUserTimezone } from '@/lib/store/settings';
import { formatInTimeZone } from 'date-fns-tz';
import {
  validateManualActivityInput,
  deriveManualActivityTimestamps,
  type ManualActivityInput,
} from '@/lib/analysis/manual-activity-pure';

export interface ManualActivityResult {
  ok: boolean;
  id?: number;
  error?: string;
}

function parseFormInput(formData: FormData): ManualActivityInput {
  const num = (k: string): number => Number(formData.get(k));
  const optNum = (k: string): number | null => {
    const v = formData.get(k)?.toString().trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN; // let validation reject a non-numeric entry
  };
  return {
    distanceKm: num('distance_km'),
    durationMin: num('duration_min'),
    dateIso: String(formData.get('date') ?? '').trim(),
    timeHm: String(formData.get('time') ?? '').trim(),
    avgHr: optNum('avg_hr'),
    rpe: optNum('rpe'),
    notes: formData.get('notes')?.toString() || null,
  };
}

export async function createManualActivity(formData: FormData): Promise<ManualActivityResult> {
  try {
    const timezone = await getUserTimezone();
    const todayLocalIso = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');

    const input = parseFormInput(formData);
    const validated = validateManualActivityInput(input, todayLocalIso);
    if (!validated.ok) return { ok: false, error: validated.error };

    const { startDateLocal, startDateUtc } = deriveManualActivityTimestamps(
      validated.value.dateIso,
      validated.value.timeHm,
      timezone
    );

    const sourceId = 'manual-' + crypto.randomUUID();

    const inserted = await getDb()
      .insert(schema.activities)
      .values({
        source: 'manual',
        sourceId,
        name: validated.value.name,
        type: 'Run',
        sportType: 'Run',
        startDateUtc,
        startDateLocal,
        distanceM: validated.value.distanceM,
        movingTimeS: validated.value.movingTimeS,
        elapsedTimeS: validated.value.movingTimeS,
        avgSpeedMs: validated.value.avgSpeedMs,
        avgHr: validated.value.avgHr,
      })
      .returning({ id: schema.activities.id })
      .get();

    if (validated.value.rpe !== null) {
      await getDb()
        .insert(schema.journal)
        .values({ date: validated.value.dateIso, perceivedEffort: validated.value.rpe })
        .onConflictDoUpdate({
          target: schema.journal.date,
          set: { perceivedEffort: validated.value.rpe, updatedAt: sql`(unixepoch())` },
        });
    }

    revalidatePath('/patrol');
    revalidatePath('/journal');
    revalidatePath('/recon');
    return { ok: true, id: inserted.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
