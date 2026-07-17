'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { ensureActivePlanPeriod } from '@/lib/plans/plan-periods';

/**
 * Phase 5 - set the program start date.
 *
 * plan_periods.startDate is the canonical start: both the matrix/program-phase
 * and getActivePlan() read it. The athlete can override the auto-derived date
 * here - e.g. when the block actually began on a different Monday. Mirrored
 * into the plan.startDate setting so the period seeder stays consistent.
 */
export interface SetStartDateResult {
  ok: boolean;
  error?: string;
}

export async function setPlanStartDate(formData: FormData): Promise<SetStartDateResult> {
  try {
    const raw = formData.get('start_date')?.toString() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(raw + 'T00:00:00Z').getTime())) {
      return { ok: false, error: 'Enter a valid date (YYYY-MM-DD).' };
    }

    const period = await ensureActivePlanPeriod();
    if (!period) {
      return { ok: false, error: 'No active plan yet. Pick a dojo and set a goal race first.' };
    }

    const db = (await getDb());
    await db
      .update(schema.planPeriods)
      .set({ startDate: raw })
      .where(eq(schema.planPeriods.id, period.id));

    // Keep the settings mirror in sync (the period seeder reads plan.startDate).
    await db
      .insert(schema.settings)
      .values({ key: 'plan.startDate', value: raw })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: raw, updatedAt: new Date() },
      });

    revalidatePath('/dojo');
    revalidatePath('/patrol');
    revalidatePath('/calendar');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
