import type { D1Database } from '@cloudflare/workers-types';

/**
 * Augments @opennextjs/cloudflare's ambient `CloudflareEnv` interface with
 * the bindings this app needs. Kept next to lib/db since `DB` is the only
 * binding the db layer consumes today; add more here as cloud-2..5 land
 * secrets/storage bindings.
 */
declare global {
  interface CloudflareEnv {
    /** D1 database binding — see wrangler config. */
    DB: D1Database;
  }
}

export {};
