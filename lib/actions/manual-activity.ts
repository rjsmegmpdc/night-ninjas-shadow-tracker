'use server';

/**
 * Stage 2 (daily loop) - P0-7 manual results fallback. Logs a run that has
 * no synced data as a manual `activities` row (source='manual'), so it flows
 * through compliance/ACWR identically to a synced run. Optionally upserts
 * RPE into that day's journal entry (additive - never touches other journal
 * fields, mirrors lib/actions/wellness.ts's logWellness).
 *
 * Stage 6 adds restoreManualActivity - the athlete's override of D-004's
 * "synced wins by default" supersede (see lib/analysis/activity-dedup-pure.ts
 * and lib/sources/sync-runner.ts's recordManualOverlapIfAny).
 *
 * Timezone: lib/store/settings.ts (getUserTimezone) is owned by another
 * teammate this wave and already exposes the setting used here — imported
 * read-only, not modified.
 */

import { revalidatePath } from 'next/cache';
import { sql, eq, and, ne } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { getUserTimezone } from '@/lib/store/settings';
import { formatInTimeZone } from 'date-fns-tz';
import {
  validateManualActivityInput,
  deriveManualActivityTimestamps,
  type ManualActivityInput,
} from '@/lib/analysis/manual-activity-pure';
import {
  SUPERSEDED_TYPE,
  buildRestoreUpdate,
  buildSupersededUpdate,
  safeParseJson,
  type SupersedeMarker,
} from '@/lib/analysis/activity-dedup-pure';
import { recordPromptSkip } from '@/lib/actions/journal';
import { manualOverlapPromptId } from '@/lib/analysis/prompt-context-pure';

export interface ManualActivityResult {
  ok: boolean;
  id?: number;
  error?: string;
}

export interface RestoreManualActivityResult {
  ok: boolean;
  error?: string;
  /** Set on an otherwise-successful restore when the synced counterpart couldn't be flipped (see restoreManualActivity). */
  warning?: string;
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

    const inserted = await (await getDb())
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
      await (await getDb())
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

/* ----------------------------------------------------------------------------
 * Stage 6 - restore a superseded manual activity (D-004's athlete override).
 *
 * Symmetric: the manual row goes back to its original type; the synced
 * counterpart it was superseded by takes the sentinel treatment instead, so
 * only one of the pair ever counts toward compliance/load at a time. Best-
 * effort on the synced-row half - if that row can't be located (e.g. it was
 * since deleted), the manual row is still restored; we just can't flip its
 * counterpart, which is logged for the athlete via the returned error text
 * rather than silently swallowed.
 * -------------------------------------------------------------------------- */

export async function restoreManualActivity(activityId: number): Promise<RestoreManualActivityResult> {
  try {
    const db = (await getDb());
    const manualRow = await db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, activityId))
      .get();
    if (!manualRow) return { ok: false, error: 'Activity not found.' };
    if (manualRow.source !== 'manual' || manualRow.type !== SUPERSEDED_TYPE) {
      return { ok: false, error: 'This activity is not currently superseded — nothing to restore.' };
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const existingMarker = safeParseJson(manualRow.rawJson).supersede as Partial<SupersedeMarker> | undefined;
    const restore = buildRestoreUpdate(manualRow.rawJson, nowIso);
    if (!restore) {
      return { ok: false, error: 'No supersede record found on this activity — cannot restore.' };
    }

    await db
      .update(schema.activities)
      .set({ type: restore.type, rawJson: restore.rawJson, updatedAt: now })
      .where(eq(schema.activities.id, manualRow.id));

    // Symmetric flip: the synced counterpart takes the sentinel treatment
    // instead, since the athlete has now explicitly chosen the manual entry.
    let warning: string | undefined;
    const syncedSourceId = existingMarker?.supersededBySync;
    if (syncedSourceId) {
      const syncedRow = await db
        .select()
        .from(schema.activities)
        .where(and(eq(schema.activities.sourceId, syncedSourceId), ne(schema.activities.source, 'manual')))
        .get();
      if (syncedRow) {
        const syncedSupersede = buildSupersededUpdate(syncedRow.type, manualRow.sourceId, nowIso);
        const mergedSyncedRawJson = {
          ...safeParseJson(syncedRow.rawJson),
          ...safeParseJson(syncedSupersede.rawJson),
        };
        await db
          .update(schema.activities)
          .set({ type: syncedSupersede.type, rawJson: JSON.stringify(mergedSyncedRawJson), updatedAt: now })
          .where(eq(schema.activities.id, syncedRow.id));
      } else {
        warning = 'Restored, but the synced activity it overlapped could not be found — both may now count toward load.';
      }
    }

    await recordPromptSkip(manualRow.startDateLocal.slice(0, 10), manualOverlapPromptId(manualRow.id));

    revalidatePath('/patrol');
    revalidatePath('/journal');
    revalidatePath('/recon');
    return warning ? { ok: true, warning } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
