'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

/**
 * Phase 3b - accept or dismiss a coach proposal.
 *
 * Apply: stamps applied_at. The state-aware pipeline then serves the
 * stored after_state template for that week.
 *
 * Dismiss: stamps dismissed_at. Suppresses re-proposal for the same
 * trigger - except ACWR hard-rail rows, which the pipeline re-raises
 * until the underlying ratio drops below 1.5. The UI requires an extra
 * confirmation before dismissing a rail row; the server records the
 * dismissal either way (the audit trail is the point).
 */

export async function applyPlanAdjustment(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  const db = (await getDb());
  await db.update(schema.planAdjustments)
    .set({ appliedAt: new Date().toISOString() })
    .where(eq(schema.planAdjustments.id, id));
  revalidatePath('/patrol');
  revalidatePath('/settings');
}

export async function dismissPlanAdjustment(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  const db = (await getDb());
  await db.update(schema.planAdjustments)
    .set({ dismissedAt: new Date().toISOString() })
    .where(eq(schema.planAdjustments.id, id));
  revalidatePath('/patrol');
}
