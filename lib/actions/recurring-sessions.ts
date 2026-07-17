'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

function revalidateGroupRuns() {
  revalidatePath('/setup/weekly');
  revalidatePath('/calendar');
  revalidatePath('/patrol');
}

export async function createRecurringSession(formData: FormData) {
  const name = formData.get('name')?.toString().trim() || 'Group run';
  const dow = parseInt(formData.get('dow')?.toString() || '0', 10);
  const sessionType = formData.get('sessionType')?.toString() as any;
  const distMin = formData.get('typicalDistanceKmMin')?.toString();
  const distMax = formData.get('typicalDistanceKmMax')?.toString();
  const paceLabel = formData.get('paceLabel')?.toString().trim() || null;
  const venue = formData.get('venue')?.toString().trim() || null;
  const isNinjaLoop = formData.get('isNinjaLoop') === 'true';

  await (await getDb()).insert(schema.recurringSessions).values({
    name,
    dow: isNinjaLoop ? -1 : dow,
    sessionType: sessionType || 'easy',
    typicalDistanceKmMin: distMin ? parseFloat(distMin) : null,
    typicalDistanceKmMax: distMax ? parseFloat(distMax) : null,
    paceLabel,
    venue,
    isActive: true,
    isNinjaLoop,
  });

  revalidateGroupRuns();
}

export async function deleteRecurringSession(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;
  await (await getDb()).delete(schema.recurringSessions).where(eq(schema.recurringSessions.id, id));
  revalidateGroupRuns();
}

export async function toggleRecurringSession(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  const isActive = formData.get('isActive') === 'true';
  if (!id) return;
  await (await getDb())
    .update(schema.recurringSessions)
    .set({ isActive: !isActive })
    .where(eq(schema.recurringSessions.id, id));
  revalidateGroupRuns();
}
