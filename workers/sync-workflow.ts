import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { runSyncJobPage, type SyncPageOutcome } from '@/lib/sources/sync-runner';

/**
 * cloud-4 — Strava sync runner, Cloudflare Workflows edition.
 *
 * Node keeps the fire-and-forget in-process loop in lib/actions/sync.ts /
 * lib/sources/sync-runner.ts unchanged. On workerd, this Workflow is the
 * durable equivalent: one `step.do()` per Strava activity page, reusing
 * the exact same `runSyncJobPage` unit (and therefore the exact same
 * cursor/resume model and `syncJobs` row) as the Node path — see
 * lib/sources/sync-runner.ts's `runSyncJobPage` doc comment.
 *
 * Step granularity: one page batch per step (mark-running and
 * mark-completed/mark-failed/completion-hooks are their own small steps
 * too). Each `sync-page` step gets its own retry policy — a transient
 * failure (Strava network blip, D1 hiccup) retries just that page, not
 * the whole job; the cursor already persisted by the last *successful*
 * page means a retried step re-fetches from where the job actually left
 * off, not from scratch. This is strictly more resilient than the Node
 * path, which has no automatic retry today (any error simply fails the
 * job — a human has to click "Sync now" again).
 *
 * IMPORTANT — cloudflare-context shim: `getDb()` (lib/db/index.ts) and
 * anything using @opennextjs/cloudflare's `getCloudflareContext()` (e.g.
 * the secrets layer's future D1/KV-backed store, once cloud-2 lands)
 * expect a context object to already be sitting on
 * `globalThis[Symbol.for('__cloudflare-context__')]`. In production that
 * global is populated by the OpenNext-generated fetch handler on every
 * request — but a Workflow instance is NOT a fetch request, so nothing
 * populates it before `run()` executes. We populate it ourselves from the
 * `env`/`ctx` the Workflows runtime already gives every WorkflowEntrypoint
 * via its constructor (this is NOT request-scoped state - it's the same
 * bindings object as the wrangler config, always available). This uses an
 * internal-but-stable detail of @opennextjs/cloudflare (a well-known
 * `Symbol.for` key, deliberately global-registry-scoped so any module in
 * the same isolate can set/read it) rather than a public API — flagged in
 * the cloud-4 report for verification against a real `wrangler dev` /
 * deployed run before cloud-5b ships this, and re-verification on every
 * @opennextjs/cloudflare version bump.
 */
function ensureCloudflareContext(env: unknown, ctx: unknown): void {
  const key = Symbol.for('__cloudflare-context__');
  const g = globalThis as unknown as { [k: symbol]: unknown };
  if (!g[key]) {
    g[key] = { env, cf: {}, ctx };
  }
}

interface SyncWorkflowParams {
  jobId: number;
  /**
   * Mirrors the `.then()` completion chains Node's lib/actions/sync.ts
   * attaches to `runJob()` for the three "start a fresh job" actions
   * (setLastSyncAt, and for initial_90d also markSetupComplete +
   * ensureActivePlanPeriod). `resumeJob` never runs these on Node either
   * (its fire-and-forget has no `.then()` at all) — pass false there for
   * parity.
   */
  runCompletionHooks: boolean;
}

export class StravaSyncWorkflow extends WorkflowEntrypoint<CloudflareEnv, SyncWorkflowParams> {
  async run(event: WorkflowEvent<SyncWorkflowParams>, step: WorkflowStep) {
    ensureCloudflareContext(this.env, this.ctx);
    const { jobId, runCompletionHooks } = event.payload;

    try {
      await step.do('mark-running', async () => {
        const db = await getDb();
        await db
          .update(schema.syncJobs)
          .set({ status: 'running', lastHeartbeatAt: new Date() })
          .where(eq(schema.syncJobs.id, jobId));
      });

      let outcome: SyncPageOutcome = 'more';
      while (outcome === 'more') {
        outcome = await step.do(
          'sync-page',
          {
            retries: {
              limit: 5,
              delay: '30 seconds',
              backoff: 'exponential',
            },
            timeout: '2 minutes',
          },
          async () => runSyncJobPage(jobId)
        );
      }

      if (outcome === 'done') {
        let jobType: string | null = null;
        await step.do('mark-completed', async () => {
          const db = await getDb();
          await db
            .update(schema.syncJobs)
            .set({ status: 'completed', completedAt: new Date(), lastHeartbeatAt: new Date() })
            .where(eq(schema.syncJobs.id, jobId));
          const job = await db
            .select({ jobType: schema.syncJobs.jobType })
            .from(schema.syncJobs)
            .where(eq(schema.syncJobs.id, jobId))
            .get();
          jobType = job?.jobType ?? null;
        });

        if (runCompletionHooks) {
          await step.do('completion-hooks', async () => {
            const { setLastSyncAt, markSetupComplete } = await import('@/lib/store/settings');
            await setLastSyncAt(new Date());
            if (jobType === 'initial_90d') {
              await markSetupComplete();
              try {
                const { ensureActivePlanPeriod } = await import('@/lib/plans/plan-periods');
                await ensureActivePlanPeriod();
              } catch {
                // Non-fatal, matches Node's try/catch in lib/actions/sync.ts
              }
            }
          });
        }
      }
      // 'rate_limited' outcome: runSyncJobPage already wrote status +
      // rateLimitResetsAt to the row. Nothing more to do here — the user
      // resumes via the existing resumeJob action, which (on workerd)
      // creates a fresh Workflow instance for the same jobId.
    } catch (err) {
      await step.do('mark-failed', async () => {
        const db = await getDb();
        const msg = err instanceof Error ? err.message : 'unknown error';
        await db
          .update(schema.syncJobs)
          .set({ status: 'failed', errorMessage: msg, lastHeartbeatAt: new Date() })
          .where(eq(schema.syncJobs.id, jobId));
      });
      throw err;
    }
  }
}
