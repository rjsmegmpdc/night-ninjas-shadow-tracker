'use server';

import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { fetchNzHolidaysFromIcal } from '@/lib/sources/nz-holidays';

const KEY_LAST_REFRESH = 'nz_holidays.last_refresh_at';
const KEY_LAST_ERROR = 'nz_holidays.last_error';
const KEY_LAST_SOURCE = 'nz_holidays.last_source';

/* ----------------------------------------------------------------------------
 * Refresh — replaces the entire nz_holidays cache with fresh data from
 * sohnemann iCal. Called from the manual button, on first boot when the table is
 * empty, and automatically on/after 1 September each year.
 * -------------------------------------------------------------------------- */

async function setSetting(key: string, value: string) {
  const db = (await getDb());
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date() },
    });
}

async function getSetting(key: string): Promise<string | null> {
  const db = (await getDb());
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();
  return row?.value ?? null;
}

/**
 * Manual refresh — the button on the calendar page.
 * Does NOT throw on failure; returns a status object so the UI can show it.
 */
export async function refreshNzHolidays(): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  const db = (await getDb());
  try {
    const fresh = await fetchNzHolidaysFromIcal();

    // Replace-and-insert. We delete sohnemann iCal-sourced rows; manual rows survive.
    await db.delete(schema.nzHolidays).where(eq(schema.nzHolidays.source, 'github-ical'));

    const now = new Date();
    for (const h of fresh) {
      await db.insert(schema.nzHolidays).values({
        date: h.date,
        name: h.name,
        region: h.region,
        year: h.year,
        source: 'github-ical',
        fetchedAt: now,
      });
    }

    await setSetting(KEY_LAST_REFRESH, now.toISOString());
    await setSetting(KEY_LAST_SOURCE, 'github-ical');
    await setSetting(KEY_LAST_ERROR, '');

    revalidatePath('/calendar');
    revalidatePath('/setup/weekly');
    revalidatePath('/patrol');

    return { ok: true, count: fresh.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    await setSetting(KEY_LAST_ERROR, msg);
    return { ok: false, count: 0, error: msg };
  }
}

/* ----------------------------------------------------------------------------
 * Auto-refresh check.
 *
 * Conditions to trigger a refresh (called from page renders, cheap to no-op):
 *   1. No data in the table at all (first ever boot)
 *   2. Today is on/after 1 September AND last refresh was before 1 September of this year
 *
 * The Sept 1 trigger ensures next year's data lands in the cache as soon
 * as MBIE publishes it.
 * -------------------------------------------------------------------------- */

export async function autoRefreshIfDue(): Promise<void> {
  const db = (await getDb());

  // 1. Empty table → refresh
  const count = await db.$count(schema.nzHolidays);
  if (count === 0) {
    await refreshNzHolidays();
    return;
  }

  // 2. Past Sept 1 + last refresh was before this year's Sept 1 → refresh
  const today = new Date();
  const sept1ThisYear = new Date(today.getFullYear(), 8, 1); // month is 0-indexed (8 = Sept)

  if (today >= sept1ThisYear) {
    const lastRefreshStr = await getSetting(KEY_LAST_REFRESH);
    const lastRefresh = lastRefreshStr ? new Date(lastRefreshStr) : null;
    if (!lastRefresh || lastRefresh < sept1ThisYear) {
      await refreshNzHolidays();
    }
  }
}

/* ----------------------------------------------------------------------------
 * Status accessor — for the UI to show "last refreshed: X ago"
 * -------------------------------------------------------------------------- */

export async function getRefreshStatus(): Promise<{
  lastRefreshAt: string | null;
  lastSource: string | null;
  lastError: string | null;
  nextAutoRefreshAt: string;
}> {
  const [lastRefreshAt, lastSource, lastError] = await Promise.all([
    getSetting(KEY_LAST_REFRESH),
    getSetting(KEY_LAST_SOURCE),
    getSetting(KEY_LAST_ERROR),
  ]);

  // Next auto-refresh: 1 September of this year if not yet passed, else next year
  const today = new Date();
  let nextSept = new Date(today.getFullYear(), 8, 1);
  if (today >= nextSept) {
    nextSept = new Date(today.getFullYear() + 1, 8, 1);
  }

  return {
    lastRefreshAt,
    lastSource,
    lastError: lastError || null,
    nextAutoRefreshAt: nextSept.toISOString().slice(0, 10),
  };
}

/* ----------------------------------------------------------------------------
 * Hide a holiday from the upcoming list.
 *
 * Hard-deletes the row from nz_holidays cache. If sohnemann iCal still
 * lists it on the next refresh, it'll come back. Users can use the
 * "Refresh" button to restore.
 * -------------------------------------------------------------------------- */
export async function deleteHoliday(formData: FormData) {
  const date = formData.get('date')?.toString();
  const name = formData.get('name')?.toString();
  if (!date || !name) return;

  const db = (await getDb());
  await db
    .delete(schema.nzHolidays)
    .where(
      and(
        eq(schema.nzHolidays.date, date),
        eq(schema.nzHolidays.name, name)
      )
    );

  // Also remove any auto-created Ninja Loop on that date
  await db
    .delete(schema.calendarEvents)
    .where(
      and(
        eq(schema.calendarEvents.eventType, 'ninja_loop_holiday'),
        eq(schema.calendarEvents.startDate, date)
      )
    );

  revalidatePath('/calendar');
  revalidatePath('/setup/weekly');
}
