'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { isWorkerd } from '@/lib/runtime';
import {
  createInitial90dJob,
  createExtendedHistoryJob,
  createIncrementalJob,
  resumeJob as runResume,
  runJob,
  assertJobResumable,
} from '@/lib/sources/sync-runner';
import { setLastSyncAt, markSetupComplete } from '@/lib/store/settings';
import { ensureActivePlanPeriod } from '@/lib/plans/plan-periods';

function revalidateSyncSurfaces() {
  revalidatePath('/setup/sync');
  revalidatePath('/patrol');
  revalidatePath('/calendar');
  revalidatePath('/settings');
}

/**
 * cloud-4: on workerd, "running the job" means creating a Cloudflare
 * Workflow instance (workers/sync-workflow.ts via the SYNC_WORKFLOW
 * binding) instead of an in-process fire-and-forget promise chain — a
 * plain async promise started here would be liable to get cut off once
 * this request/action finishes (workerd doesn't keep a bare unawaited
 * promise alive past response completion the way Node does). Workflows
 * don't have that problem: once created, an instance runs independently
 * of the request that triggered it.
 *
 * We DO await the `.create()` call itself — it only enqueues the
 * instance (fast), not the sync itself, so the action still returns
 * quickly and the wizard/settings UI polls /api/strava/sync/status
 * exactly as before (that route reads the `syncJobs` table directly; it
 * has no idea whether a job is being driven by a Node promise or a
 * Workflow instance, so it needs zero changes).
 *
 * Instance ids are `sync-<jobId>-<timestamp>` rather than just `sync-<jobId>`
 * because Workflow instance ids must be unique — `.create()` throws if an
 * id already exists — and a job can be started, rate-limited, and resumed
 * (a fresh instance) more than once. The DB row (keyed by jobId, not
 * Workflow instance id) stays the single source of truth either way.
 */
async function triggerWorkerdSync(jobId: number, runCompletionHooks: boolean): Promise<void> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = getCloudflareContext();
    await env.SYNC_WORKFLOW.create({
      id: `sync-${jobId}-${Date.now()}`,
      params: { jobId, runCompletionHooks },
    });
  } catch {
    // Mirrors the Node fire-and-forget's `.catch(() => {})` — a failure to
    // even start the runner shouldn't crash the action. The job stays in
    // 'pending' status; the UI's stale-job / resume affordances cover it.
  }
}

/**
 * Wizard's final step calls this. Creates an initial_90d job and runs it
 * to completion (or rate limit / error). The page polls /api/strava/sync/status
 * for live updates while this is running.
 */
export async function startInitial90dSync(): Promise<{
  jobId: number;
  status: string;
}> {
  const job = await createInitial90dJob();

  if (isWorkerd()) {
    await triggerWorkerdSync(job.id, true);
  } else {
    // Fire and forget — runJob updates DB; the UI polls for status.
    // We DON'T await — we want this server action to return quickly so the
    // UI can start polling. Node will keep the runner alive in the background
    // until it completes or the process exits.
    runJob(job.id)
      .then(async () => {
        await setLastSyncAt(new Date());
        await markSetupComplete();
        // Materialise the plan_periods row from the wizard's settings.
        // The matrix uses plan_periods to know which weeks are coached;
        // without this call, the lazy seed only fires when a query first
        // hits and would silently fail in some configurations.
        try {
          await ensureActivePlanPeriod();
        } catch {
          // Non-fatal: the lazy seed will retry on the next query
        }
      })
      .catch(() => {});
  }

  revalidateSyncSurfaces();
  return { jobId: job.id, status: 'started' };
}

export async function startExtendedHistorySync(): Promise<{ jobId: number }> {
  const job = await createExtendedHistoryJob();
  if (isWorkerd()) {
    await triggerWorkerdSync(job.id, true);
  } else {
    runJob(job.id)
      .then(async () => {
        await setLastSyncAt(new Date());
      })
      .catch(() => {});
  }
  revalidateSyncSurfaces();
  return { jobId: job.id };
}

export async function startIncrementalSync(): Promise<{ jobId: number }> {
  const job = await createIncrementalJob();
  if (isWorkerd()) {
    await triggerWorkerdSync(job.id, true);
  } else {
    runJob(job.id)
      .then(async () => {
        await setLastSyncAt(new Date());
      })
      .catch(() => {});
  }
  revalidateSyncSurfaces();
  return { jobId: job.id };
}

export async function resumeJob(formData: FormData): Promise<void> {
  const jobId = parseInt(formData.get('jobId')?.toString() || '0', 10);
  if (!jobId) return;

  if (isWorkerd()) {
    try {
      await assertJobResumable(jobId);
      // Note: false — resumeJob never runs the setLastSyncAt/markSetupComplete/
      // ensureActivePlanPeriod completion hooks on Node either (its
      // fire-and-forget has no `.then()` chain at all), so parity here is
      // "don't run them", not an oversight.
      await triggerWorkerdSync(jobId, false);
    } catch {
      // Mirrors Node's `.catch(() => {})` below — a resume that can't
      // start (job not found, rate limit not yet reset) fails silently
      // from the action's point of view; the status poll surfaces the
      // job's real state either way.
    }
  } else {
    // Async fire-and-forget
    runResume(jobId).catch(() => {});
  }
  revalidateSyncSurfaces();
}

export async function cancelJob(formData: FormData): Promise<void> {
  const jobId = parseInt(formData.get('jobId')?.toString() || '0', 10);
  if (!jobId) return;

  await (await getDb())
    .update(schema.syncJobs)
    .set({
      status: 'failed',
      errorMessage: 'Cancelled by user',
      completedAt: new Date(),
      lastHeartbeatAt: new Date(),
    })
    .where(eq(schema.syncJobs.id, jobId));

  revalidateSyncSurfaces();
}
