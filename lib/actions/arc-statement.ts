'use server';

/**
 * G-005 (UI redesign) - arc statement server action.
 *
 * The arc statement is a nullable, athlete-authored motivation caption
 * (DESIGN-SPEC.md §2.5) shown under Patrol's (and Race's) page title, edited
 * on Profile. Validated here in lib/actions/journal.ts's style: parse the
 * form field, validate, return a typed { ok, error? } result rather than
 * throwing, so the editor form can render the error inline.
 *
 * A blank submit clears the statement (stored as null) — same "empty means
 * unset" posture as the rest of the app's optional fields.
 */

import { revalidatePath } from 'next/cache';
import { setArcStatement, ARC_STATEMENT_MAX_LENGTH } from '@/lib/store/settings';

export interface ArcStatementResult {
  ok: boolean;
  error?: string;
}

export async function updateArcStatement(formData: FormData): Promise<ArcStatementResult> {
  const raw = formData.get('arcStatement');
  const trimmed = raw == null ? '' : String(raw).trim();

  if (trimmed.length > ARC_STATEMENT_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep it to ${ARC_STATEMENT_MAX_LENGTH} characters or fewer (currently ${trimmed.length}).`,
    };
  }

  try {
    await setArcStatement(trimmed === '' ? null : trimmed);
  } catch {
    return { ok: false, error: 'Could not save. Has the database been migrated?' };
  }

  revalidatePath('/patrol');
  revalidatePath('/profile');
  return { ok: true };
}
