'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

/**
 * Save the user's dojo choice. Called from /setup/dojo when they click
 * a dojo card.
 *
 * Writes to settings table key 'plan.dojo'. The active-plan resolver
 * reads this back to materialise a PlanEngine at query time.
 */
export async function selectDojo(formData: FormData) {
  const dojo = formData.get('dojo')?.toString();
  if (!dojo || !['hansons', 'lydiard', 'daniels', 'pfitzinger', 'higdon', 'polarised', 'ultra', 'custom'].includes(dojo)) {
    throw new Error('Invalid dojo');
  }

  const db = (await getDb());
  await db
    .insert(schema.settings)
    .values({ key: 'plan.dojo', value: dojo })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: dojo, updatedAt: new Date() },
    });

  revalidatePath('/setup/dojo');
  revalidatePath('/patrol');
  revalidatePath('/calendar');

  redirect('/setup/races?dojo=' + dojo);
}
