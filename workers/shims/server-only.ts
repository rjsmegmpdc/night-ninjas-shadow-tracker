/**
 * Shim for the `server-only` package, used ONLY when wrangler/esbuild
 * bundles `worker-entry.ts` (see wrangler.jsonc's `main` + `alias`).
 *
 * `server-only` isn't a real resolvable npm package — Next.js vendors its
 * own copy and aliases the bare specifier to it via webpack, purely as a
 * build-time guard that throws if the module is pulled into a CLIENT
 * bundle. On the server compiler (and everywhere else) it's a no-op.
 *
 * `next build` already resolves/strips every `import 'server-only'` in the
 * app's own module graph before @opennextjs/cloudflare repackages the
 * output, so `.open-next/worker.js` never needs this shim. But
 * `worker-entry.ts` (this Workflow's custom entrypoint) imports shared
 * `lib/**` modules directly, via wrangler's own esbuild pass, which has no
 * such alias by default and would fail to resolve the bare `server-only`
 * specifier. `wrangler.jsonc`'s `alias` config redirects it here instead.
 */
export {};
