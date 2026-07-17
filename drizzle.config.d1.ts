import type { Config } from 'drizzle-kit';

/**
 * D1 (remote) target for drizzle-kit — used for introspection/studio against
 * the deployed Cloudflare D1 database via drizzle-kit's HTTP driver.
 *
 * Schema generation itself doesn't need this file: D1 is SQLite-dialect, so
 * `npm run db:generate` (drizzle.config.ts) already produces D1-compatible
 * SQL into lib/db/migrations, and those same files are applied to D1 with
 * `wrangler d1 migrations apply <DB_NAME> --remote` (wrangler owns its own
 * migration-tracking table; it doesn't read drizzle-kit's journal).
 *
 * This config exists for drizzle-kit commands that need a live connection
 * to the remote D1 database (e.g. `drizzle-kit studio --config
 * drizzle.config.d1.ts`). Requires:
 *   CLOUDFLARE_ACCOUNT_ID  — Cloudflare account id
 *   CLOUDFLARE_DATABASE_ID — D1 database id (from `wrangler d1 create`)
 *   CLOUDFLARE_D1_TOKEN    — API token scoped to D1 edit
 * None of these are read anywhere else in the app; set them locally when
 * you need to run one of these commands, never commit them.
 */
export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? '',
    token: process.env.CLOUDFLARE_D1_TOKEN ?? '',
  },
  verbose: true,
  strict: true,
} satisfies Config;
