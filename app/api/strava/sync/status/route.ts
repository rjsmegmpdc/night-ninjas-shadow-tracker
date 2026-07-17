import { NextResponse, type NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { detectInterruptedJobs, getActiveJob, getMostRecentJob } from '@/lib/sources/sync-runner';

/**
 * GET /api/strava/sync/status
 *
 * Returns current state of the most recent sync job + total activity count.
 * Polled by:
 *   - Wizard sync step (every 1s during initial_90d)
 *   - Patrol/Calendar status banner
 *   - Settings sync manager
 *
 * Optional ?jobId= query param to fetch a specific job (used after resume).
 */
export async function GET(req: NextRequest) {
  // Self-heal any interrupted jobs (running but no heartbeat in 60s)
  await detectInterruptedJobs();

  const { searchParams } = new URL(req.url);
  const jobIdStr = searchParams.get('jobId');

  let job;
  if (jobIdStr) {
    const id = parseInt(jobIdStr, 10);
    job = await (await getDb())
      .select()
      .from(schema.syncJobs)
      .where(eq(schema.syncJobs.id, id))
      .get();
  } else {
    // No specific id — show the most recent active, or fall back to most recent overall
    job = (await getActiveJob()) ?? (await getMostRecentJob());
  }

  // Total activities currently in the DB
  const totalActivities = await (await getDb()).$count(schema.activities);

  return NextResponse.json({
    job: job
      ? {
          id: job.id,
          jobType: job.jobType,
          status: job.status,
          pagesFetched: job.pagesFetched,
          added: job.added,
          updated: job.updated,
          oldestFetched: job.oldestFetched,
          newestFetched: job.newestFetched,
          startedAt: job.startedAt instanceof Date ? job.startedAt.toISOString() : job.startedAt,
          completedAt:
            job.completedAt instanceof Date ? job.completedAt.toISOString() : job.completedAt,
          rateLimitResetsAt:
            job.rateLimitResetsAt instanceof Date
              ? job.rateLimitResetsAt.toISOString()
              : job.rateLimitResetsAt,
          errorMessage: job.errorMessage,
        }
      : null,
    totalActivities,
  });
}
