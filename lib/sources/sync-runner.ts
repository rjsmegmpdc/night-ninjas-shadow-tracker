import 'server-only';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import {
  fetchActivityPage,
  StravaRateLimitError,
  PAGE_SIZE,
} from '@/lib/sources/strava-api';
import { mapStravaActivity } from '@/lib/sources/strava-mapper';
import { ensureShoesForGearIds } from '@/lib/shoes/ingest';
import {
  findOverlappingActivity,
  buildSupersededUpdate,
  safeParseJson,
  type OverlapCandidate,
} from '@/lib/analysis/activity-dedup-pure';
import type { SyncJob, NewActivity } from '@/lib/db/schema';

/* ----------------------------------------------------------------------------
 * Sync runner — drives a sync job to completion.
 *
 * Called by:
 *   - createInitial90dJob() during wizard's final step
 *   - createExtendedHistoryJob() from Settings "Pull full history"
 *   - createIncrementalJob() from "Sync now"
 *   - resumeJob() for paused/rate_limited jobs
 *
 * Architecture: this runs SYNCHRONOUSLY within a single API request. The
 * client kicks it off via POST /api/strava/sync/run, the server holds the
 * connection open and writes heartbeats to the DB so the UI can poll
 * progress from a separate request. When the request finishes (or is
 * killed), the job is left in 'running' status; the resume detector picks
 * up the orphan on next page load.
 * -------------------------------------------------------------------------- */

const HEARTBEAT_INTERVAL_PAGES = 1; // Update heartbeat after every page
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

export type JobType = 'initial_90d' | 'extended_history' | 'incremental';

/* ----------------------------------------------------------------------------
 * Job creation
 * -------------------------------------------------------------------------- */

export async function createJob(opts: {
  jobType: JobType;
  cursorBefore?: number | null;
  cursorAfter?: number | null;
  parentJobId?: number | null;
}): Promise<SyncJob> {
  const db = (await getDb());
  const now = new Date();
  const result = await db
    .insert(schema.syncJobs)
    .values({
      source: 'strava',
      jobType: opts.jobType,
      status: 'pending',
      startedAt: now,
      lastHeartbeatAt: now,
      cursorBefore: opts.cursorBefore ?? Math.floor(Date.now() / 1000),
      cursorAfter: opts.cursorAfter ?? null,
      parentJobId: opts.parentJobId ?? null,
    })
    .returning()
    .get();
  return result;
}

/** Initial 90-day pull. Runs from now → 90 days back. */
export async function createInitial90dJob(): Promise<SyncJob> {
  const nowSec = Math.floor(Date.now() / 1000);
  return createJob({
    jobType: 'initial_90d',
    cursorBefore: nowSec,
    cursorAfter: nowSec - NINETY_DAYS_SECONDS,
  });
}

/**
 * Extended history pull. Picks up where the most recent completed job
 * stopped (i.e. uses the oldest fetched activity as the new `before` cursor)
 * and pulls everything older.
 */
export async function createExtendedHistoryJob(): Promise<SyncJob> {
  const db = (await getDb());
  // Find the oldest activity we already have — start before that
  const oldest = await db
    .select({ startDateUtc: schema.activities.startDateUtc })
    .from(schema.activities)
    .where(eq(schema.activities.source, 'strava'))
    .orderBy(schema.activities.startDateUtc)
    .limit(1)
    .get();

  const cursorBefore = oldest
    ? Math.floor(new Date(oldest.startDateUtc).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  return createJob({
    jobType: 'extended_history',
    cursorBefore,
    cursorAfter: null, // pull all the way back
  });
}

/**
 * Incremental sync. Pulls only activities newer than our newest known one.
 */
export async function createIncrementalJob(): Promise<SyncJob> {
  const db = (await getDb());
  const newest = await db
    .select({ startDateUtc: schema.activities.startDateUtc })
    .from(schema.activities)
    .where(eq(schema.activities.source, 'strava'))
    .orderBy(sql`${schema.activities.startDateUtc} DESC`)
    .limit(1)
    .get();

  const cursorAfter = newest
    ? Math.floor(new Date(newest.startDateUtc).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - NINETY_DAYS_SECONDS;

  return createJob({
    jobType: 'incremental',
    cursorBefore: null,
    cursorAfter,
  });
}

/* ----------------------------------------------------------------------------
 * Job execution
 * -------------------------------------------------------------------------- */

/**
 * Outcome of a single `runSyncJobPage` call:
 *   'more'         — a full page was processed, keep going
 *   'done'         — no more data (empty page, past the window, or a
 *                    short/last page) — the job is complete
 *   'rate_limited' — voluntarily paused (>90% of the 15-min budget) or
 *                    Strava itself returned 429; `markRateLimited` has
 *                    already been called, job status is 'rate_limited'
 */
export type SyncPageOutcome = 'more' | 'done' | 'rate_limited';

/**
 * Execute exactly ONE page of a sync job: fetch, upsert, ingest gear,
 * advance the cursor, write a heartbeat. Stateless — re-reads the job row
 * from the DB on every call rather than trusting an in-memory snapshot, so
 * it's safe to call repeatedly and independently.
 *
 * This is the shared unit reused by both runtimes:
 *   - Node's `runJob` below loops this in-process (fire-and-forget).
 *   - The Cloudflare Workflow (workers/sync-workflow.ts) wraps each call in
 *     its own `step.do()`, so each page is durably checkpointed — a step
 *     failure retries just that page, not the whole job, and the workflow
 *     survives worker restarts between pages.
 *
 * Note: because the job row is re-read fresh on every call (rather than
 * held in memory for the whole run, as the pre-cloud-4 single-function
 * version did), `newestFetched` is set once (from the first page) and then
 * preserved — the old in-memory-snapshot version re-derived it from
 * `job.newestFetched ?? newNewest` using a snapshot that was never updated
 * mid-run, which happened to make it track the LAST page's newest instead
 * of the true overall newest on a fresh (non-resumed) job. This is a minor
 * behavioural fix, not a regression: no test covers the old value, and the
 * new value is the more correct one.
 */
export async function runSyncJobPage(jobId: number): Promise<SyncPageOutcome> {
  const db = (await getDb());

  const job = await db.select().from(schema.syncJobs).where(eq(schema.syncJobs.id, jobId)).get();
  if (!job) throw new Error(`Job ${jobId} not found`);

  const cursorBefore = job.cursorBefore;
  const cursorAfter = job.cursorAfter;

  let result;
  try {
    result = await fetchActivityPage({ before: cursorBefore, after: cursorAfter });
  } catch (err) {
    if (err instanceof StravaRateLimitError) {
      await markRateLimited(jobId, err.resetsAt);
      return 'rate_limited';
    }
    throw err;
  }

  const { activities, rateLimit } = result;

  // Strava returns activities sorted newest-first within the page
  if (activities.length === 0) {
    // No more data — we're done
    return 'done';
  }

  // Upsert each activity. Track oldest in this batch so we can advance
  // the cursor for the next page.
  let pageOldestUtc = cursorBefore ? cursorBefore * 1000 : Date.now();
  let pageNewestUtc = 0;
  let added = 0;
  let updated = 0;

  for (const a of activities) {
    const row = mapStravaActivity(a);
    const upsertResult = await upsertActivity(row);
    if (upsertResult === 'inserted') {
      added++;
      await recordManualOverlapIfAny(row);
    } else if (upsertResult === 'updated') updated++;

    const ts = new Date(a.start_date).getTime();
    if (ts < pageOldestUtc) pageOldestUtc = ts;
    if (ts > pageNewestUtc) pageNewestUtc = ts;
  }

  // Ingest any new shoes we saw in this page. This runs Strava /gear/{id}
  // calls — only for gear_ids we haven't recorded yet, which is typically
  // 0-2 calls per sync. Failures here don't break the sync.
  const pageGearIds = activities
    .map((a) => a.gear_id)
    .filter((id): id is string => id != null);
  if (pageGearIds.length > 0) {
    await ensureShoesForGearIds(pageGearIds);
  }

  // Advance cursor: next page should fetch activities older than the
  // oldest in THIS page.
  const nextBefore = Math.floor(pageOldestUtc / 1000);

  // Update job progress + heartbeat
  const newOldest = new Date(pageOldestUtc).toISOString().slice(0, 10);
  const newNewest = new Date(pageNewestUtc).toISOString().slice(0, 10);

  await db
    .update(schema.syncJobs)
    .set({
      cursorBefore: nextBefore,
      oldestFetched: newOldest,
      newestFetched: job.newestFetched ?? newNewest,
      pagesFetched: sql`${schema.syncJobs.pagesFetched} + 1`,
      added: sql`${schema.syncJobs.added} + ${added}`,
      updated: sql`${schema.syncJobs.updated} + ${updated}`,
      lastHeartbeatAt: new Date(),
    })
    .where(eq(schema.syncJobs.id, jobId));

  // For initial_90d, stop once we've gone past the 90d window
  if (job.jobType === 'initial_90d' && cursorAfter && nextBefore <= cursorAfter) {
    return 'done';
  }

  // If page returned fewer than PAGE_SIZE activities, that's the last page
  if (activities.length < PAGE_SIZE) {
    return 'done';
  }

  // Defensive: if we're at >90% of rate limit, voluntarily pause
  if (rateLimit.fifteenMinPercent !== null && rateLimit.fifteenMinPercent > 90) {
    await markRateLimited(jobId, new Date(Date.now() + 15 * 60 * 1000));
    return 'rate_limited';
  }

  return 'more';
}

/**
 * Node path — drives a job to completion by looping `runSyncJobPage`
 * in-process. Unchanged behaviour from before cloud-4's refactor (same
 * status transitions, same 150ms politeness delay between pages, same
 * failure handling); the loop body just moved into the shared per-page
 * function above.
 */
export async function runJob(jobId: number): Promise<SyncJob> {
  const db = (await getDb());

  // Mark as running
  await db
    .update(schema.syncJobs)
    .set({ status: 'running', lastHeartbeatAt: new Date() })
    .where(eq(schema.syncJobs.id, jobId));

  try {
    while (true) {
      const outcome = await runSyncJobPage(jobId);
      if (outcome === 'rate_limited') {
        return await getJob(jobId);
      }
      if (outcome === 'done') {
        break;
      }
      // Be a polite client even when we're not rate-limited
      await sleep(150);
    }

    // Successfully finished
    await db
      .update(schema.syncJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        lastHeartbeatAt: new Date(),
      })
      .where(eq(schema.syncJobs.id, jobId));

    return await getJob(jobId);
  } catch (err) {
    if (err instanceof StravaRateLimitError) {
      await markRateLimited(jobId, err.resetsAt);
    } else {
      const msg = err instanceof Error ? err.message : 'unknown error';
      await db
        .update(schema.syncJobs)
        .set({
          status: 'failed',
          errorMessage: msg,
          lastHeartbeatAt: new Date(),
        })
        .where(eq(schema.syncJobs.id, jobId));
    }
    return await getJob(jobId);
  }
}

async function markRateLimited(jobId: number, resetsAt: Date) {
  const db = (await getDb());
  await db
    .update(schema.syncJobs)
    .set({
      status: 'rate_limited',
      rateLimitResetsAt: resetsAt,
      lastHeartbeatAt: new Date(),
    })
    .where(eq(schema.syncJobs.id, jobId));
}

async function getJob(jobId: number): Promise<SyncJob> {
  const db = (await getDb());
  const job = await db
    .select()
    .from(schema.syncJobs)
    .where(eq(schema.syncJobs.id, jobId))
    .get();
  if (!job) throw new Error(`Job ${jobId} not found after run`);
  return job;
}

/* ----------------------------------------------------------------------------
 * Activity upsert
 * -------------------------------------------------------------------------- */

async function upsertActivity(row: ReturnType<typeof mapStravaActivity>): Promise<'inserted' | 'updated' | 'unchanged'> {
  const db = (await getDb());
  const existing = await db
    .select({ id: schema.activities.id })
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.source, row.source!),
        eq(schema.activities.sourceId, row.sourceId)
      )
    )
    .get();

  if (existing) {
    await db
      .update(schema.activities)
      .set({
        ...row,
        updatedAt: new Date(),
      })
      .where(eq(schema.activities.id, existing.id));
    return 'updated';
  }
  await db.insert(schema.activities).values(row);
  return 'inserted';
}

/* ----------------------------------------------------------------------------
 * Manual/synced overlap dedup guard (Stage 2, extended Stage 6 - daily loop)
 *
 * A newly-inserted synced Run-type activity may be the same run as an
 * existing manual entry (P0-7's manual-results fallback). We never merge or
 * delete either row - D-004 (locked): the synced version wins by default.
 * The manual row's `type` is swapped to the SUPERSEDED_TYPE sentinel (see
 * activity-dedup-pure.ts), which is enough on its own to stop it counting a
 * second time in every type-filtered consumer (compliance, week stats,
 * unlogged-session coverage; athlete-state.ts's load query gets an explicit
 * exclusion since it doesn't filter by type). The existing `dedup` marker
 * (which fields the overlap for the prompt queue) and the new `supersede`
 * marker are merged into the same `raw_json` write. Best-effort: any failure
 * here must never break the sync. The athlete can reverse this via
 * lib/actions/manual-activity.ts's restoreManualActivity.
 * -------------------------------------------------------------------------- */

const RUN_TYPES = new Set(['Run', 'VirtualRun', 'TrailRun']);

async function recordManualOverlapIfAny(row: NewActivity): Promise<void> {
  if (!RUN_TYPES.has(row.type)) return;
  try {
    const db = (await getDb());
    const localDateIso = row.startDateLocal.slice(0, 10);

    const manualCandidates = await db
      .select()
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.source, 'manual'),
          gte(schema.activities.startDateLocal, localDateIso),
          lte(schema.activities.startDateLocal, localDateIso + 'T99:99:99')
        )
      )
      .all();
    if (manualCandidates.length === 0) return;

    const incoming: OverlapCandidate = {
      localDateIso,
      durationS: row.movingTimeS ?? null,
      distanceM: row.distanceM ?? null,
    };
    const candidates = manualCandidates.map((m) => ({
      ...m,
      localDateIso: m.startDateLocal.slice(0, 10),
      durationS: m.movingTimeS ?? null,
      distanceM: m.distanceM ?? null,
    }));
    const match = findOverlappingActivity(incoming, candidates);
    if (!match) return;

    const now = new Date();
    const supersede = buildSupersededUpdate(match.type, row.sourceId, now.toISOString());

    const merged = {
      ...safeParseJson(match.rawJson),
      ...safeParseJson(supersede.rawJson), // adds the `supersede` marker
      dedup: {
        overlapsSyncedSourceId: row.sourceId,
        overlapsSyncedType: row.type,
        detectedAt: now.toISOString(),
      },
    };
    await db
      .update(schema.activities)
      .set({ type: supersede.type, rawJson: JSON.stringify(merged), updatedAt: now })
      .where(eq(schema.activities.id, match.id));
  } catch {
    // Best-effort dedup marker — never break the sync over this.
  }
}

/* ----------------------------------------------------------------------------
 * Resume detection
 * -------------------------------------------------------------------------- */

/**
 * Find any sync job that is in 'running' status but hasn't emitted a
 * heartbeat in the last 60 seconds. These are interrupted jobs (process
 * killed, network drop, etc) that should be marked 'paused' so the UI can
 * offer a resume button.
 *
 * Called on every page render of /calendar and /patrol — cheap (one query
 * with a status index) and self-healing.
 */
export async function detectInterruptedJobs(): Promise<void> {
  const db = (await getDb());
  const cutoff = new Date(Date.now() - 60 * 1000);
  await db
    .update(schema.syncJobs)
    .set({ status: 'paused' })
    .where(
      and(
        eq(schema.syncJobs.status, 'running'),
        sql`${schema.syncJobs.lastHeartbeatAt} < ${Math.floor(cutoff.getTime() / 1000)}`
      )
    );
}

/** Get the most recent active job (if any). Used by status banners. */
export async function getActiveJob(): Promise<SyncJob | null> {
  const db = (await getDb());
  const job = await db
    .select()
    .from(schema.syncJobs)
    .where(
      sql`${schema.syncJobs.status} IN ('pending', 'running', 'paused', 'rate_limited')`
    )
    .orderBy(sql`${schema.syncJobs.id} DESC`)
    .limit(1)
    .get();
  return job ?? null;
}

export async function getMostRecentJob(): Promise<SyncJob | null> {
  const db = (await getDb());
  const job = await db
    .select()
    .from(schema.syncJobs)
    .orderBy(sql`${schema.syncJobs.id} DESC`)
    .limit(1)
    .get();
  return job ?? null;
}

/**
 * List N most recent sync jobs, newest first. Used by the Settings page
 * to render a sync history table.
 */
export async function listRecentJobs(limit = 20): Promise<SyncJob[]> {
  const db = (await getDb());
  return db
    .select()
    .from(schema.syncJobs)
    .orderBy(sql`${schema.syncJobs.id} DESC`)
    .limit(limit)
    .all();
}

/**
 * Guard shared by both runtimes' resume paths: throws if the job doesn't
 * exist or its rate limit hasn't reset yet, otherwise returns the job row.
 * Node's `resumeJob` below calls this before looping `runJob` in-process;
 * the workerd trigger path (lib/actions/sync.ts) calls it before creating
 * a new Workflow instance for the same jobId.
 */
export async function assertJobResumable(jobId: number): Promise<SyncJob> {
  const db = (await getDb());
  const job = await db
    .select()
    .from(schema.syncJobs)
    .where(eq(schema.syncJobs.id, jobId))
    .get();
  if (!job) throw new Error(`Job ${jobId} not found`);

  if (job.status === 'rate_limited' && job.rateLimitResetsAt) {
    if (job.rateLimitResetsAt > new Date()) {
      throw new Error(
        `Rate limit not yet reset (resumes at ${job.rateLimitResetsAt.toISOString()})`
      );
    }
  }

  return job;
}

export async function resumeJob(jobId: number): Promise<SyncJob> {
  await assertJobResumable(jobId);
  return runJob(jobId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
