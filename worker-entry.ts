/**
 * Custom worker entrypoint — cloud-4.
 *
 * @opennextjs/cloudflare's generated `.open-next/worker.js` only exports a
 * `fetch` handler; it has no room for a hand-written export like a
 * WorkflowEntrypoint class. This thin wrapper re-exports the generated
 * fetch handler unchanged and adds the Strava sync Workflow as a named
 * export, per OpenNext's documented custom-worker pattern:
 * https://opennext.js.org/cloudflare/howtos/custom-worker
 *
 * wrangler.jsonc's `main` points here instead of directly at
 * `.open-next/worker.js` (flagged prominently in the cloud-4 report —
 * Dock/cloud-5b owns wrangler.jsonc at deploy time and should be aware of
 * this redirect).
 */
// @ts-ignore `.open-next/worker.js` is generated at build time and doesn't
// exist in this worktree until `opennextjs-cloudflare build` has run.
import { default as handler } from './.open-next/worker.js';

export { StravaSyncWorkflow } from './workers/sync-workflow';

export default {
  fetch: handler.fetch,
};
