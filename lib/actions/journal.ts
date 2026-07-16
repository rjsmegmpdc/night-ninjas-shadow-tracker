'use server';

/**
 * Journal — daily wellness/stress/reflection writer + prompt-skip ledger.
 *
 * `logJournalEntry` generalises Phase 5's wellness upsert (lib/actions/wellness.ts,
 * now a thin delegate to this file) to the full daily-loop set: sleep
 * quality/hours, energy, work stress, perceived effort, and free-text notes.
 * Same partial-submit contract as before — only fields actually present in
 * the FormData are written, so a partial submit never clobbers an existing
 * value for that day.
 *
 * `recordPromptSkip` / `getSkippedPromptIds` back the Stage 3 prompt queue's
 * "don't reappear today" rule (lib/analysis/prompt-context-pure.ts). Skips
 * are stored in the `settings` table under dynamic keys
 * (`promptSkip.<date>.<promptId>`) rather than in journal.notes, for two
 * reasons: (1) journal.notes is real athlete-authored free text — embedding
 * a machine marker in it risks corrupting or getting overwritten by that
 * text; (2) the settings table is explicitly documented as a loose,
 * evolve-without-migration key/value store (see lib/db/schema.ts), which is
 * exactly what a growing set of per-day-per-prompt flags needs without a
 * schema change. This keeps journal rows purely athlete-facing data.
 */

import { revalidatePath } from 'next/cache';
import { sql, like } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { getDb, schema } from '@/lib/db';
import { getUserTimezone } from '@/lib/store/settings';

export interface JournalResult {
  ok: boolean;
  error?: string;
}

/** Parse an optional numeric field; clamps to [lo, hi]. Returns a 3-state result. */
function parseScale(
  raw: string,
  lo: number,
  hi: number,
  label: string,
  round: boolean
): { provided: false } | { provided: true; ok: true; value: number } | { provided: true; ok: false; error: string } {
  const s = raw.trim();
  if (s === '') return { provided: false };
  const n = Number(s);
  if (!Number.isFinite(n)) return { provided: true, ok: false, error: `${label} must be a number.` };
  const clamped = Math.max(lo, Math.min(hi, round ? Math.round(n) : n));
  return { provided: true, ok: true, value: clamped };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function logJournalEntry(formData: FormData): Promise<JournalResult> {
  // NZ wall-clock fallback (formatInTimeZone against the configured
  // timezone) — same pattern as lib/analysis/prompt-context.ts and
  // lib/actions/manual-activity.ts. A bare UTC slice would strand a
  // no-date submit in the wrong day's row for roughly half of every NZ
  // day, now that the prompt queue and Journal page both read/write
  // NZ-dated rows. (interruption-log-form.tsx has its own, separate,
  // parked instance of this bug — not touched here.)
  const dateRaw = String(formData.get('date') ?? '').trim();
  const date = dateRaw || formatInTimeZone(new Date(), await getUserTimezone(), 'yyyy-MM-dd');
  if (!DATE_RE.test(date)) return { ok: false, error: 'Date must be YYYY-MM-DD.' };

  const sq = parseScale(String(formData.get('sleepQuality') ?? ''), 1, 10, 'Sleep quality', true);
  const en = parseScale(String(formData.get('energy') ?? ''), 1, 10, 'Energy', true);
  const sh = parseScale(String(formData.get('sleepHours') ?? ''), 0, 16, 'Sleep hours', false);
  const ws = parseScale(String(formData.get('workStress') ?? ''), 1, 10, 'Work stress', true);
  const pe = parseScale(String(formData.get('perceivedEffort') ?? ''), 1, 10, 'Perceived effort', true);
  const notesRaw = formData.get('notes');
  const notes = notesRaw == null ? '' : String(notesRaw).trim();
  const notesProvided = notes !== '';

  for (const f of [sq, en, sh, ws, pe]) {
    if (f.provided && !f.ok) return { ok: false, error: f.error };
  }
  if (!sq.provided && !en.provided && !sh.provided && !ws.provided && !pe.provided && !notesProvided) {
    return { ok: false, error: 'Enter at least one field.' };
  }

  const insertVals: typeof schema.journal.$inferInsert = { date };
  const updates: Record<string, unknown> = { updatedAt: sql`(unixepoch())` };
  if (sq.provided && sq.ok) { insertVals.sleepQuality = sq.value; updates.sleepQuality = sq.value; }
  if (en.provided && en.ok) { insertVals.energy = en.value; updates.energy = en.value; }
  if (sh.provided && sh.ok) { insertVals.sleepHours = sh.value; updates.sleepHours = sh.value; }
  if (ws.provided && ws.ok) { insertVals.workStress = ws.value; updates.workStress = ws.value; }
  if (pe.provided && pe.ok) { insertVals.perceivedEffort = pe.value; updates.perceivedEffort = pe.value; }
  if (notesProvided) { insertVals.notes = notes; updates.notes = notes; }

  try {
    await getDb()
      .insert(schema.journal)
      .values(insertVals)
      .onConflictDoUpdate({ target: schema.journal.date, set: updates });
  } catch {
    return { ok: false, error: 'Could not save. Has the database been migrated?' };
  }

  revalidatePath('/profile');
  revalidatePath('/journal');
  revalidatePath('/patrol');
  return { ok: true };
}

/* ----------------------------------------------------------------------------
 * Prompt-skip ledger (Stage 3 - daily loop prompt queue).
 * -------------------------------------------------------------------------- */

const PROMPT_SKIP_KEY_PREFIX = 'promptSkip';

function promptSkipKey(date: string, promptId: string): string {
  return `${PROMPT_SKIP_KEY_PREFIX}.${date}.${promptId}`;
}

/** Persist that `promptId` was skipped on `date` so it doesn't reappear the same day. */
export async function recordPromptSkip(date: string, promptId: string): Promise<JournalResult> {
  if (!DATE_RE.test(date)) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
  if (!promptId.trim()) return { ok: false, error: 'promptId is required.' };

  const key = promptSkipKey(date, promptId);
  try {
    await getDb()
      .insert(schema.settings)
      .values({ key, value: 'true' })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: 'true', updatedAt: sql`(unixepoch())` } });
  } catch {
    return { ok: false, error: 'Could not save. Has the database been migrated?' };
  }

  revalidatePath('/patrol');
  return { ok: true };
}

/** Prompt ids already skipped on `date`. Feeds prompt-context-pure's `skippedPromptIds` input. */
export async function getSkippedPromptIds(date: string): Promise<string[]> {
  if (!DATE_RE.test(date)) return [];
  const prefix = promptSkipKey(date, '');
  const rows = await getDb()
    .select({ key: schema.settings.key })
    .from(schema.settings)
    .where(like(schema.settings.key, `${prefix}%`))
    .all();
  return rows.map((r) => r.key.slice(prefix.length));
}
