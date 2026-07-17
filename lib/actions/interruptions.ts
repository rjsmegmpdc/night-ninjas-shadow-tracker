'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

/**
 * Phase 4 server actions - log / resolve / delete an interruption.
 *
 * Locked decision: these NEVER touch plan_adjustments. Phase 4 informs only;
 * the athlete drives recovery. The 3b pipeline reads the active-injury flag
 * (hasActiveInjuryOrIllnessNow) to pause automatic adjustments, but nothing
 * here auto-modifies the plan.
 */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const TYPES = ['injury', 'illness', 'travel', 'other'] as const;
const SEVERITIES = ['niggle', 'moderate', 'severe'] as const;
type IType = (typeof TYPES)[number];
type ISeverity = (typeof SEVERITIES)[number];

export interface InterruptionResult {
  ok: boolean;
  id?: number;
  error?: string;
}

function revalidate(): void {
  revalidatePath('/journal');
  revalidatePath('/patrol');
}

/** Log a new interruption (defaults start_date to today; blank end = ongoing). */
export async function logInterruption(formData: FormData): Promise<InterruptionResult> {
  try {
    const type = formData.get('type')?.toString() as IType | undefined;
    const severity = formData.get('severity')?.toString() as ISeverity | undefined;
    if (!type || !TYPES.includes(type)) {
      return { ok: false, error: 'Pick an interruption type.' };
    }
    if (!severity || !SEVERITIES.includes(severity)) {
      return { ok: false, error: 'Pick a severity (niggle / moderate / severe).' };
    }
    const startDate = (formData.get('start_date')?.toString() || todayIso()).slice(0, 10);
    const endRaw = formData.get('end_date')?.toString();
    const endDate = endRaw ? endRaw.slice(0, 10) : null;
    if (endDate && endDate < startDate) {
      return { ok: false, error: 'End date cannot be before the start date.' };
    }
    // Body region only applies to injuries.
    const bodyRegion =
      type === 'injury' ? formData.get('body_region')?.toString() || null : null;
    const note = formData.get('note')?.toString() || null;

    const inserted = await (await getDb())
      .insert(schema.interruptions)
      .values({ type, bodyRegion, severity, startDate, endDate, note })
      .returning({ id: schema.interruptions.id })
      .get();
    revalidate();
    return { ok: true, id: inserted.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Mark an interruption resolved (sets end_date; defaults to today). */
export async function resolveInterruption(formData: FormData): Promise<InterruptionResult> {
  try {
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id)) return { ok: false, error: 'Missing interruption id.' };
    const endDate = (formData.get('end_date')?.toString() || todayIso()).slice(0, 10);
    await (await getDb())
      .update(schema.interruptions)
      .set({ endDate })
      .where(eq(schema.interruptions.id, id));
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Delete an interruption outright (logged in error). */
export async function deleteInterruption(formData: FormData): Promise<InterruptionResult> {
  try {
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id)) return { ok: false, error: 'Missing interruption id.' };
    await (await getDb()).delete(schema.interruptions).where(eq(schema.interruptions.id, id));
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
