import type { D1Database, R2Bucket, Workflow } from '@cloudflare/workers-types';

/**
 * Augments @opennextjs/cloudflare's ambient `CloudflareEnv` interface with
 * the bindings this app needs. Kept next to lib/db since `DB` is the only
 * binding the db layer consumes today; add more here as cloud-2..5 land
 * secrets/storage bindings.
 *
 * cloud-3 adds PHOTOS (R2 — shoe photo storage, see lib/storage/shoe-photos.ts).
 * cloud-4 adds SYNC_WORKFLOW (Workflows — Strava sync runner, see
 * workers/sync-workflow.ts and wrangler.jsonc's "workflows" block).
 */
declare global {
  interface CloudflareEnv {
    /** D1 database binding — see wrangler config. */
    DB: D1Database;
    /** R2 bucket binding for shoe photo storage — see wrangler config. */
    PHOTOS: R2Bucket;
    /** Workflows binding for the Strava sync runner — see wrangler config. */
    SYNC_WORKFLOW: Workflow<{ jobId: number; runCompletionHooks: boolean }>;
  }
}

export {};
