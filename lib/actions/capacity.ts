'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { SETTINGS_KEYS } from '@/lib/constants/settings-keys';

/**
 * Persist the user's capacity caps (weekly volume + long run cap) to the
 * settings table. Empty string = clear the override.
 *
 * Constants for these keys live in lib/constants/settings-keys.ts so that
 * components can import them without dragging in this 'use server' file
 * (Next.js 16 strict-checks 'use server' files: only async functions
 * may be exported).
 */
export async function saveCapacity(formData: FormData) {
  const weekly = formData.get('weeklyVolumeCapKm')?.toString().trim() || '';
  const long = formData.get('longRunCapKm')?.toString().trim() || '';

  const db = (await getDb());
  for (const [key, value] of [
    [SETTINGS_KEYS.CAPACITY_WEEKLY, weekly],
    [SETTINGS_KEYS.CAPACITY_LONG, long],
  ] as const) {
    if (value) {
      await db
        .insert(schema.settings)
        .values({ key, value })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value, updatedAt: new Date() },
        });
    } else {
      await db.delete(schema.settings).where(eq(schema.settings.key, key));
    }
  }

  revalidatePath('/setup/weekly');
  revalidatePath('/calendar');
  revalidatePath('/patrol');
}
