'use server';

import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { allCachedHolidays } from '@/lib/data/nz-holidays';

function revalidateEvents() {
  revalidatePath('/setup/weekly');
  revalidatePath('/calendar');
  revalidatePath('/patrol');
}

export async function createCalendarEvent(formData: FormData) {
  const eventType = formData.get('eventType')?.toString() as any;
  const title = formData.get('title')?.toString().trim() || null;
  const startDate = formData.get('startDate')?.toString().trim();
  const endDate = formData.get('endDate')?.toString().trim() || null;
  const impact = (formData.get('impact')?.toString() as any) || 'reduced';
  const notes = formData.get('notes')?.toString().trim() || null;

  if (!startDate) throw new Error('Start date required.');

  await (await getDb()).insert(schema.calendarEvents).values({
    eventType: eventType || 'other',
    title,
    startDate,
    endDate,
    impact,
    notes,
  });

  revalidateEvents();
}

export async function deleteCalendarEvent(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;
  await (await getDb()).delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, id));
  revalidateEvents();
}

/* ----------------------------------------------------------------------------
 * Ninja Loop bulk actions — creates calendar events for every NZ public
 * holiday between today and a year out. Idempotent: skips dates that
 * already have a ninja_loop_holiday entry.
 * -------------------------------------------------------------------------- */

export async function enableNinjaLoopHolidays() {
  const db = (await getDb());
  const today = new Date().toISOString().slice(0, 10);
  const yearOut = new Date();
  yearOut.setFullYear(yearOut.getFullYear() + 1);
  const cutoff = yearOut.toISOString().slice(0, 10);

  const existing = await db
    .select({ startDate: schema.calendarEvents.startDate })
    .from(schema.calendarEvents)
    .where(eq(schema.calendarEvents.eventType, 'ninja_loop_holiday'))
    .all();
  const existingDates = new Set(existing.map((e) => e.startDate));

  // Read from DB cache — populated by refreshNzHolidays() from govt.nz.
  const cached = await allCachedHolidays();
  const toAdd = cached.filter(
    (h) => h.date >= today && h.date <= cutoff && !existingDates.has(h.date)
  );

  for (const h of toAdd) {
    await db.insert(schema.calendarEvents).values({
      eventType: 'ninja_loop_holiday',
      title: `Ninja Loop · ${h.name}`,
      startDate: h.date,
      endDate: null,
      impact: 'group_run',
    });
  }

  revalidateEvents();
}

export async function disableNinjaLoopHolidays() {
  await (await getDb())
    .delete(schema.calendarEvents)
    .where(eq(schema.calendarEvents.eventType, 'ninja_loop_holiday'));
  revalidateEvents();
}
