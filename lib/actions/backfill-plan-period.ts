'use server';

import { revalidatePath } from 'next/cache';
import { isNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { ensureActivePlanPeriod } from '@/lib/plans/plan-periods';

/**
 * Backfill the plan_periods table for the current active plan.
 *
 * Safe and idempotent:
 * - If an active period (end_date IS NULL) already exists, returns
 *   that one without inserting.
 * - If the seeder bails (no goal race configured, no dojo selected,
 *   plan_periods table missing), returns null without throwing.
 *
 * This handler exists for the case where the lazy seed in
 * ensureActivePlanPeriod() failed silently in earlier sessions, leaving
 * plan_periods empty even though a plan is configured. After this turn's
 * fix to the seeder, calling backfillActivePlanPeriod() will materialise
 * the row that should have existed all along.
 *
 * Returns metadata about the result so the UI can show a clear status.
 */
export async function backfillActivePlanPeriod(): Promise<{
  status: 'inserted' | 'already-existed' | 'no-active-plan';
  startDate?: string;
  dojo?: string;
}> {
  const db = (await getDb());

  // Check current state before invoking the seeder
  const before = await db
    .select()
    .from(schema.planPeriods)
    .where(isNull(schema.planPeriods.endDate))
    .get();

  if (before) {
    return {
      status: 'already-existed',
      startDate: before.startDate,
      dojo: before.dojo,
    };
  }

  const seeded = await ensureActivePlanPeriod();
  if (!seeded) {
    return { status: 'no-active-plan' };
  }

  revalidatePath('/dojo');
  revalidatePath('/patrol');

  return {
    status: 'inserted',
    startDate: seeded.startDate,
    dojo: seeded.dojo,
  };
}
