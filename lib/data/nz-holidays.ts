import 'server-only';
import { and, gte, lte, isNull, or, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

/**
 * NZ public holidays — reads from the local DB cache.
 *
 * The cache is populated by `lib/actions/refresh-holidays.ts` from
 * govt.nz. On first boot the table is empty; the calendar page calls
 * `autoRefreshIfDue()` on load which fills it.
 *
 * Region filtering: pass an `accept` predicate to filter (e.g. only
 * Auckland regional anniversaries + national holidays).
 */

export interface NzHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  region: string | null; // null = national
}

const AUCKLAND_REGION_LABEL_PATTERN = /Auckland/i;

/** Holidays falling between two ISO dates, filtered to national + Auckland regional. */
export async function holidaysInRange(
  fromIso: string,
  toIso: string
): Promise<NzHoliday[]> {
  const rows = await (await getDb())
    .select({
      date: schema.nzHolidays.date,
      name: schema.nzHolidays.name,
      region: schema.nzHolidays.region,
    })
    .from(schema.nzHolidays)
    .where(
      and(gte(schema.nzHolidays.date, fromIso), lte(schema.nzHolidays.date, toIso))
    )
    .all();

  return rows.filter(
    (h) => !h.region || AUCKLAND_REGION_LABEL_PATTERN.test(h.region)
  );
}

/** Get upcoming holidays from today forward. */
export async function upcomingHolidays(limit = 6): Promise<NzHoliday[]> {
  const today = new Date().toISOString().slice(0, 10);
  // Use the year + 2 as upper bound — covers everything in cache
  const upper = `${new Date().getFullYear() + 2}-12-31`;
  const all = await holidaysInRange(today, upper);
  return all.slice(0, limit);
}

/** Get all holidays from cache (for bulk Ninja Loop creation). */
export async function allCachedHolidays(): Promise<NzHoliday[]> {
  const today = new Date().toISOString().slice(0, 10);
  const upper = `${new Date().getFullYear() + 2}-12-31`;
  return holidaysInRange(today, upper);
}
