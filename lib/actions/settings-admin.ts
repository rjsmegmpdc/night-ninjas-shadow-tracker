'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { isWorkerd } from '@/lib/runtime';
import { clearStravaSecrets } from '@/lib/store/secrets';
import { logEvent } from '@/lib/store/usage-log';

/* ----------------------------------------------------------------------------
 * Settings actions — admin operations on the local install.
 *
 * Two destructive actions live here:
 *   - disconnectStrava : clear OS keychain entries (revokable, restartable)
 *   - wipeEverything   : delete DB tables + clear keychain (terminal)
 *
 * Both require explicit form-submitted confirmation tokens to prevent
 * accidental triggers (CSRF-style guard but the threat model is mainly
 * "user clicked the wrong button").
 * -------------------------------------------------------------------------- */

/**
 * Disconnect Strava — clears the OS keychain entries holding the
 * client_secret and OAuth tokens. The activity data in the DB is
 * preserved.
 *
 * After this runs, the user has to walk through wizard steps 2 & 3
 * (Strava App + Connect) to re-authorise. All other settings persist.
 */
export async function disconnectStrava(formData: FormData) {
  const confirm = formData.get('confirm')?.toString();
  if (confirm !== 'disconnect') {
    throw new Error('Confirmation required');
  }

  await clearStravaSecrets();

  logEvent({ type: 'action', name: 'disconnectStrava', outcome: 'ok' });

  revalidatePath('/settings');
  revalidatePath('/');
}

/**
 * Wipe everything — terminal action.
 *
 * Drops every row from every user-data table (activities, races,
 * recurring_sessions, calendar_events, journal, plans, sync_jobs, sync_log,
 * settings, nz_holidays). Schema stays — only data goes. Then clears
 * Strava keychain. User is redirected to the wizard root.
 *
 * The two-token confirmation pattern here: form must include both
 * `confirm=wipe` AND a textarea field where user types the literal
 * word "WIPE". Catches accidental form re-submission.
 */
export async function wipeEverything(formData: FormData) {
  const confirm = formData.get('confirm')?.toString();
  const typed = formData.get('typed')?.toString().trim().toUpperCase();

  if (confirm !== 'wipe') throw new Error('Confirmation token missing');
  if (typed !== 'WIPE') throw new Error('Type "WIPE" exactly to confirm');

  const db = (await getDb());

  // Delete in any order — all data, no schema. Foreign keys are loose.
  await db.delete(schema.activities);
  await db.delete(schema.calendarEvents);
  await db.delete(schema.recurringSessions);
  await db.delete(schema.races);
  await db.delete(schema.journal);
  await db.delete(schema.plans);
  await db.delete(schema.syncJobs);
  await db.delete(schema.syncLog);
  await db.delete(schema.nzHolidays);
  await db.delete(schema.settings);

  await clearStravaSecrets();

  logEvent({ type: 'action', name: 'wipeEverything', outcome: 'ok' });

  // Send them back to the wizard root
  redirect('/');
}

/**
 * Build a JSON dump of every user-data table. Shared by the
 * `/api/settings/export` download route (both node and workerd — see
 * cloud-3: this used to be a server action that wrote the dump to
 * <dataDir>/exports/<file>.json on disk and returned the path for the UI
 * to display/copy; it's now served as a browser download instead, so
 * there's no runtime fs write on either path and no behavioural gap
 * between node and workerd).
 */
export async function buildDataExport(): Promise<{ json: string; filename: string; sizeKb: number }> {
  const db = (await getDb());

  const dump = {
    exportedAt: new Date().toISOString(),
    appVersion: '0.1.0',
    activities: await db.select().from(schema.activities).all(),
    races: await db.select().from(schema.races).all(),
    recurringSessions: await db.select().from(schema.recurringSessions).all(),
    calendarEvents: await db.select().from(schema.calendarEvents).all(),
    journal: await db.select().from(schema.journal).all(),
    plans: await db.select().from(schema.plans).all(),
    syncJobs: await db.select().from(schema.syncJobs).all(),
    settings: await db.select().from(schema.settings).all(),
    nzHolidays: await db.select().from(schema.nzHolidays).all(),
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `shadow-tracker-export-${stamp}.json`;
  const json = JSON.stringify(dump, null, 2);
  const sizeKb = Math.round(Buffer.byteLength(json) / 1024);

  logEvent({
    type: 'action',
    name: 'exportData',
    outcome: 'ok',
    meta: {
      activityCount: dump.activities.length,
      sizeKb,
    },
  });

  return { json, filename, sizeKb };
}

/**
 * Aggregate stats for the Data section of Settings.
 */
export async function getDataStats(): Promise<{
  activityCount: number;
  oldestActivity: string | null;
  newestActivity: string | null;
  raceCount: number;
  syncJobCount: number;
  dbSizeKb: number | null;
}> {
  const db = (await getDb());
  const activityCount = await db.$count(schema.activities);
  const raceCount = await db.$count(schema.races);
  const syncJobCount = await db.$count(schema.syncJobs);

  let oldestActivity: string | null = null;
  let newestActivity: string | null = null;
  if (activityCount > 0) {
    const oldest = await db
      .select({ d: schema.activities.startDateLocal })
      .from(schema.activities)
      .orderBy(schema.activities.startDateLocal)
      .limit(1)
      .get();
    const newest = await db
      .select({ d: schema.activities.startDateLocal })
      .from(schema.activities)
      .orderBy(sql`${schema.activities.startDateLocal} DESC`)
      .limit(1)
      .get();
    oldestActivity = oldest?.d.slice(0, 10) ?? null;
    newestActivity = newest?.d.slice(0, 10) ?? null;
  }

  // Best-effort DB size — node only (a local .db file). On workerd, D1 is a
  // remote database with no local file to stat, so this is always null
  // there; skip touching fs entirely rather than reaching a workerd-side
  // fs call that would just fail the try/catch anyway.
  let dbSizeKb: number | null = null;
  if (!isWorkerd()) {
    try {
      const [{ default: fs }, { default: path }, { resolveDataDir }] = await Promise.all([
        import('node:fs'),
        import('node:path'),
        import('@/lib/db/data-dir'),
      ]);
      const dbPath = path.join(resolveDataDir(), 'shadow-tracker.db');
      if (fs.existsSync(dbPath)) {
        dbSizeKb = Math.round(fs.statSync(dbPath).size / 1024);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    activityCount,
    oldestActivity,
    newestActivity,
    raceCount,
    syncJobCount,
    dbSizeKb,
  };
}
