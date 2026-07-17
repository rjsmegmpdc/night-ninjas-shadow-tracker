'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import {
  createInitial90dJob,
  createExtendedHistoryJob,
  createIncrementalJob,
  resumeJob as runResume,
  runJob,
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
 * Wizard's final step calls this. Creates an initial_90d job and runs it
 * to completion (or rate limit / error). The page polls /api/strava/sync/status
 * for live updates while this is running.
 */
export async function startInitial90dSync(): Promise<{
  jobId: number;
  status: string;
}> {
  const job = await createInitial90dJob();

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

  revalidateSyncSurfaces();
  return { jobId: job.id, status: 'started' };
}

export async function startExtendedHistorySync(): Promise<{ jobId: number }> {
  const job = await createExtendedHistoryJob();
  runJob(job.id)
    .then(async () => {
      await setLastSyncAt(new Date());
    })
    .catch(() => {});
  revalidateSyncSurfaces();
  return { jobId: job.id };
}

export async function startIncrementalSync(): Promise<{ jobId: number }> {
  const job = await createIncrementalJob();
  runJob(job.id)
    .then(async () => {
      await setLastSyncAt(new Date());
    })
    .catch(() => {});
  revalidateSyncSurfaces();
  return { jobId: job.id };
}

export async function resumeJob(formData: FormData): Promise<void> {
  const jobId = parseInt(formData.get('jobId')?.toString() || '0', 10);
  if (!jobId) return;

  // Async fire-and-forget
  runResume(jobId).catch(() => {});
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
