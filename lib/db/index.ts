import 'server-only';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Dual-runtime DB entry point.
 *
 * Node (local dev — `next dev` / `next start` on this machine) keeps
 * better-sqlite3 exactly as before: one embedded, synchronous connection
 * against the per-user data file (lib/db/data-dir.ts).
 *
 * Workerd (deployed to Cloudflare via OpenNext) uses drizzle-orm/d1 against
 * the `DB` binding, obtained through @opennextjs/cloudflare's
 * getCloudflareContext(). Both drivers are pulled in via dynamic import so
 * neither ends up in the other runtime's bundle: better-sqlite3 (a native
 * Node addon) must never reach the workerd bundle, and the D1/Cloudflare
 * context modules have no reason to load under Node.
 *
 * getDb() is async because of this — every call site does
 * `const db = await getDb();` (or `(await getDb()).select()...`) rather
 * than treating the connection as synchronous.
 *
 * AppDb is typed as the D1 (async) driver only, even though the Node branch
 * actually constructs a BetterSQLite3Database at runtime. TypeScript can't
 * cleanly merge the two drivers' overloaded query-builder methods through a
 * union type (it collapses `.select({...})` down to the wrong overload), so
 * we standardise on the async-shaped type and cast the sync driver into it
 * below. This is sound: every call site already awaits query results (the
 * await sweep that accompanied this change), and `await` on a
 * non-Promise value resolves it immediately, so the sync driver behaves
 * identically under the async type at both compile time and runtime.
 */
export type AppDb = DrizzleD1Database<typeof schema>;

let _db: AppDb | null = null;

/**
 * True when executing inside a Cloudflare Workers (workerd) runtime.
 * `navigator.userAgent === 'Cloudflare-Workers'` is workerd's documented
 * self-identification and is the mechanism OpenNext itself relies on.
 */
function isWorkerd(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}

async function createNodeDb(): Promise<AppDb> {
  const [{ drizzle }, { default: Database }, { dbFilePath }] = await Promise.all([
    import('drizzle-orm/better-sqlite3'),
    import('better-sqlite3'),
    import('./data-dir'),
  ]);

  const sqlite = new Database(dbFilePath());
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  // See the AppDb comment above — cast the sync driver to the async shape.
  return drizzle(sqlite, { schema }) as unknown as AppDb;
}

async function createD1Db(): Promise<AppDb> {
  const [{ drizzle }, { getCloudflareContext }] = await Promise.all([
    import('drizzle-orm/d1'),
    import('@opennextjs/cloudflare'),
  ]);

  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}

/** Single shared, runtime-selected DB connection. */
export async function getDb(): Promise<AppDb> {
  if (!_db) {
    _db = isWorkerd() ? await createD1Db() : await createNodeDb();
  }
  return _db;
}

export { schema };
