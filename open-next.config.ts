// OpenNext config for the Cloudflare adapter.
// Docs: https://opennext.js.org/cloudflare
//
// Incremental cache: R2 (not KV) — see wrangler.jsonc comment on the
// NEXT_INC_CACHE_R2_BUCKET binding for the free-tier reasoning. This is
// also @opennextjs/cloudflare's own documented default (see
// node_modules/@opennextjs/cloudflare/templates/open-next.config.ts).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
