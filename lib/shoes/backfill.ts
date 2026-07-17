import 'server-only';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { fetchActivityDetail, StravaRateLimitError } from '@/lib/sources/strava-api';
import { ensureShoesForGearIds } from './ingest';
import type { SyncJob } from '@/lib/db/schema';

/**
 * Gear backfill — populates gear_id on historical activities.
 *
 * Activities pulled before the gear feature existed don't have gear_id
 * (the list endpoint omits it). To get gear data on those, we have to
 * GET each one individually via /activities/{id}.
 *
 * This is rate-limit-heavy: 1 call per activity. For a runner with 1500
 * historical activities, that's ~7.5× the 15-min limit. The runner
 * paginates through the work using sync_jobs as the state store, just
 * like the sync runner does — pause on rate limit, resume on user
 * action, heartbeat for orphan detection.
 *
 * User-triggered only. Not part of the auto-sync flow.
 */

const BATCH_SIZE = 50;
const SLEEP_BETWEEN_CALLS_MS = 200; // Polite spacing

export async function createGearBackfillJob(): Promise<SyncJob> {
  const db = (await getDb());
  const now = new Date();
  return db
    .insert(schema.syncJobs)
    .values({
      source: 'strava',
      jobType: 'gear_backfill',
      status: 'pending',
      startedAt: now,
      lastHeartbeatAt: now,
      cursorBefore: null,
      cursorAfter: null,
    })
    .returning()
    .get();
}

/**
 * How many activities still need backfill — exposed for the Settings UI
 * so the user can see the size of the work before triggering.
 */
export async function countActivitiesNeedingBackfill(): Promise<number> {
  const db = (await getDb());
  return db.$count(
    schema.activities,
    and(
      eq(schema.activities.source, 'strava'),
      isNull(schema.activities.gearId)
    )
  );
}

export async function runGearBackfillJob(jobId: number): Promise<SyncJob> {
  const db = (await getDb());

  await db
    .update(schema.syncJobs)
    .set({ status: 'running', lastHeartbeatAt: new Date() })
    .where(eq(schema.syncJobs.id, jobId));

  try {
    while (true) {
      // Fetch a batch of activities that still need a gear_id
      const batch = await db
        .select({ id: schema.activities.id, sourceId: schema.activities.sourceId })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.source, 'strava'),
            isNull(schema.activities.gearId)
          )
        )
        .limit(BATCH_SIZE)
        .all();

      if (batch.length === 0) {
        await db
          .update(schema.syncJobs)
          .set({
            status: 'completed',
            completedAt: new Date(),
            lastHeartbeatAt: new Date(),
          })
          .where(eq(schema.syncJobs.id, jobId));
        break;
      }

      const newGearIdsSeen: string[] = [];
      let processed = 0;

      for (const row of batch) {
        try {
          const detail = await fetchActivityDetail(row.sourceId);
          if (detail.gear_id) {
            await db
              .update(schema.activities)
              .set({ gearId: detail.gear_id, updatedAt: new Date() })
              .where(eq(schema.activities.id, row.id));
            newGearIdsSeen.push(detail.gear_id);
          } else {
            // No gear — write a sentinel so we don't re-process this activity
            // We use empty string so isNull queries skip it next time
            await db
              .update(schema.activities)
              .set({ gearId: '', updatedAt: new Date() })
              .where(eq(schema.activities.id, row.id));
          }
          processed++;
          await sleep(SLEEP_BETWEEN_CALLS_MS);
        } catch (err) {
          if (err instanceof StravaRateLimitError) {
            // Mark rate-limited and bail
            await db
              .update(schema.syncJobs)
              .set({
                status: 'rate_limited',
                rateLimitResetsAt: err.resetsAt,
                pagesFetched: sql`${schema.syncJobs.pagesFetched} + ${processed}`,
                added: sql`${schema.syncJobs.added} + ${processed}`,
                lastHeartbeatAt: new Date(),
              })
              .where(eq(schema.syncJobs.id, jobId));

            // Ingest whatever we got before bailing
            if (newGearIdsSeen.length > 0) {
              await ensureShoesForGearIds(newGearIdsSeen).catch(() => {});
            }
            return await getJob(jobId);
          }
          // Other errors — log via heartbeat and continue
          console.error('[gear-backfill]', err);
        }
      }

      // Update progress + heartbeat after each batch
      await db
        .update(schema.syncJobs)
        .set({
          pagesFetched: sql`${schema.syncJobs.pagesFetched} + 1`,
          added: sql`${schema.syncJobs.added} + ${processed}`,
          lastHeartbeatAt: new Date(),
        })
        .where(eq(schema.syncJobs.id, jobId));

      // Ingest the gears we discovered
      if (newGearIdsSeen.length > 0) {
        await ensureShoesForGearIds(newGearIdsSeen).catch(() => {});
      }
    }

    return await getJob(jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await db
      .update(schema.syncJobs)
      .set({
        status: 'failed',
        errorMessage: msg,
        lastHeartbeatAt: new Date(),
      })
      .where(eq(schema.syncJobs.id, jobId));
    return await getJob(jobId);
  }
}

async function getJob(jobId: number): Promise<SyncJob> {
  const db = (await getDb());
  const job = await db
    .select()
    .from(schema.syncJobs)
    .where(eq(schema.syncJobs.id, jobId))
    .get();
  if (!job) throw new Error(`Job ${jobId} not found after backfill run`);
  return job;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
