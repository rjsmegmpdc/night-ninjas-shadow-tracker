'use server';

import { revalidatePath } from 'next/cache';
import { eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { ensureActivePlanPeriod } from '@/lib/plans/plan-periods';

const VALID_DOJOS = ['hansons', 'lydiard', 'daniels', 'pfitzinger', 'higdon', 'polarised', 'ultra', 'custom'] as const;

/**
 * Switch the active dojo from within the app (post-setup).
 *
 * Differs from selectDojo (the wizard action) in that:
 * - No redirect to /setup/races - stays on /dojo
 * - Closes the existing active plan period if dojo changes
 * - Seeds a fresh plan period for the new dojo
 *
 * The period swap is intentionally simple for now:
 * - Old period gets closed_reason='dojo-switched'
 * - New period inherits current settings (start date will be 'today')
 *
 * A future Phase 14 task ("dojo migration") will handle smarter
 * bridging - what to do with the goal race date, whether to keep the
 * 18-week count or recompute, etc. For now, keep it predictable.
 */
export async function switchDojo(formData: FormData) {
  const dojo = formData.get('dojo')?.toString();
  if (!dojo || !VALID_DOJOS.includes(dojo as (typeof VALID_DOJOS)[number])) {
    throw new Error('Invalid dojo');
  }

  const db = (await getDb());

  // Read current dojo
  const current = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'plan.dojo'))
    .get();

  if (current?.value === dojo) {
    // No-op: same dojo, just bounce back to /dojo with a revalidate
    revalidatePath('/dojo');
    return;
  }

  // Update dojo setting
  await db
    .insert(schema.settings)
    .values({ key: 'plan.dojo', value: dojo })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: dojo, updatedAt: new Date() },
    });

  // Close any active plan period - new dojo gets a fresh one
  await db
    .update(schema.planPeriods)
    .set({ endDate: new Date().toISOString().slice(0, 10), closedReason: 'dojo-switched' })
    .where(isNull(schema.planPeriods.endDate));

  // Seed a fresh active period under the new dojo
  await ensureActivePlanPeriod();

  revalidatePath('/dojo');
  revalidatePath('/patrol');
  revalidatePath('/calendar');
}
