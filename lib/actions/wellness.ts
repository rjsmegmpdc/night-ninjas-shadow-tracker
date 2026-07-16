'use server';

/**
 * Phase 5 - daily wellness slider. Upserts one journal row per date with the
 * athlete's morning self-assessment (sleep quality, sleep hours, energy).
 *
 * Stage 3 (daily loop) note: the upsert logic itself moved to
 * lib/actions/journal.ts's `logJournalEntry`, generalised to the full journal
 * field set (work stress, perceived effort, notes) for the prompt-queue's
 * wellness-checkin prompt. This file now just re-exports under the original
 * name so WellnessSliderForm's import keeps working unchanged.
 */

import { logJournalEntry, type JournalResult } from './journal';

export type WellnessResult = JournalResult;

export async function logWellness(formData: FormData): Promise<WellnessResult> {
  return logJournalEntry(formData);
}
