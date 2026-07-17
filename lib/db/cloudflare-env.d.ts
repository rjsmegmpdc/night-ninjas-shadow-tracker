import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

/**
 * Augments @opennextjs/cloudflare's ambient `CloudflareEnv` interface with
 * the bindings this app needs. Kept next to lib/db since `DB` is the only
 * binding the db layer consumes today; add more here as cloud-2..5 land
 * secrets/storage bindings.
 *
 * cloud-3 adds PHOTOS (R2 — shoe photo storage, see lib/storage/shoe-photos.ts).
 */
declare global {
  interface CloudflareEnv {
    /** D1 database binding — see wrangler config. */
    DB: D1Database;
    /** R2 bucket binding for shoe photo storage — see wrangler config. */
    PHOTOS: R2Bucket;
  }
}

export {};
