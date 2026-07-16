'use server';

/**
 * Prompt-queue defaults — server action backing the Connections panel's
 * defaults editor (PRD 8.5, PHASES Phase 11: "Defaults for absent sources
 * configured in Connections"). Wraps lib/store/settings.ts's
 * setPromptDefaults with validation in the style of
 * lib/actions/journal.ts's parseScale.
 *
 * Semantics differ from journal.ts on purpose: journal.ts is a partial-submit
 * daily log where a blank field means "leave unchanged" (only fields present
 * in the FormData are written). This is a single always-fully-rendered
 * config form instead, so every submit reflects the whole current UI state —
 * a blank number field here means "clear this default" (explicit null), not
 * "leave unchanged". autoSkipWellnessCheckin is likewise sent as an explicit
 * 'true'/'false' string on every submit (the caller sets it from checkbox
 * state, since an unchecked HTML checkbox is simply absent from FormData and
 * would otherwise be indistinguishable from "field not submitted").
 */

import { revalidatePath } from 'next/cache';
import { setPromptDefaults } from '@/lib/store/settings';

export interface PromptDefaultsResult {
  ok: boolean;
  error?: string;
}

/** Parses a config-form scale field: blank clears the default, a number sets it (clamped). */
function parseScaleOrClear(
  raw: FormDataEntryValue | null,
  lo: number,
  hi: number,
  label: string,
  round: boolean
): { ok: true; value: number | null } | { ok: false; error: string } {
  const s = raw == null ? '' : String(raw).trim();
  if (s === '') return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number.` };
  const clamped = Math.max(lo, Math.min(hi, round ? Math.round(n) : n));
  return { ok: true, value: clamped };
}

export async function updatePromptDefaults(formData: FormData): Promise<PromptDefaultsResult> {
  const sq = parseScaleOrClear(formData.get('sleepQualityDefault'), 1, 10, 'Sleep quality default', true);
  if (!sq.ok) return { ok: false, error: sq.error };

  const sh = parseScaleOrClear(formData.get('sleepHoursDefault'), 0, 16, 'Sleep hours default', false);
  if (!sh.ok) return { ok: false, error: sh.error };

  const en = parseScaleOrClear(formData.get('energyDefault'), 1, 10, 'Energy default', true);
  if (!en.ok) return { ok: false, error: en.error };

  const autoSkipWellnessCheckin = formData.get('autoSkipWellnessCheckin') === 'true';

  try {
    await setPromptDefaults({
      wellnessCheckin: {
        sleepQuality: sq.value,
        sleepHours: sh.value,
        energy: en.value,
      },
      autoSkipWellnessCheckin,
    });
  } catch {
    return { ok: false, error: 'Could not save. Has the database been migrated?' };
  }

  // Both surfaces read prompt defaults: Patrol's prompt queue applies them
  // on skip, Profile's Connections panel displays/edits them.
  revalidatePath('/patrol');
  revalidatePath('/profile');
  return { ok: true };
}
