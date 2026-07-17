// DRAFT — cloud-5a scaffold. Not run against any remote by this agent.
//
// Exports the local better-sqlite3 database (schema + data) to a single
// .sql file suitable for `wrangler d1 execute --remote --file=...`.
//
// Why not just use the sqlite3 CLI's `.dump`? Because we can't assume the
// `sqlite3` binary is on PATH (it isn't on this machine), and the project
// already depends on better-sqlite3, so we generate the dump in pure JS
// against a DB we know how to open.
//
// Usage:
//   node scripts/d1-export.mjs [<dbPath>] [<outFile>]
//
// Defaults:
//   dbPath  = %APPDATA%\NightNinjas\shadow-tracker.db  (see lib/db/data-dir.ts)
//   outFile = scripts/d1-import/export-<timestamp>.sql
//
// Caveats to check before the real cloud-5b import (D1 is SQLite-compatible
// but not identical):
//   - D1 does not support all SQLite pragmas/extensions; this script emits
//     plain CREATE TABLE / CREATE INDEX / INSERT statements only.
//   - Large exports may need chunked `wrangler d1 execute` calls — D1 has a
//     per-statement/file size limit. If shadow-tracker.db is large, split
//     the output file before import.
//   - Table order matters for FK constraints; this script preserves the
//     order tables appear in sqlite_master, which for drizzle-generated
//     schemas normally already respects dependency order. Verify before
//     importing.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function defaultDbPath() {
  const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appdata, "NightNinjas", "shadow-tracker.db");
}

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return String(value);
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  // string: escape single quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
  const dbPath = process.argv[2] || defaultDbPath();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile =
    process.argv[3] || path.join("scripts", "d1-import", `export-${timestamp}.sql`);

  if (!fs.existsSync(dbPath)) {
    console.error(`[d1-export] ERROR: DB not found at ${dbPath}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const db = new Database(dbPath, { readonly: true });

  const objects = db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '__drizzle%'
       ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END`
    )
    .all();

  const lines = [];
  lines.push(`-- D1 import dump generated ${new Date().toISOString()}`);
  lines.push(`-- Source: ${dbPath}`);
  lines.push(`-- DRAFT export — review before running against any remote D1 database.`);
  lines.push("PRAGMA foreign_keys=OFF;");
  lines.push("BEGIN TRANSACTION;");

  const tables = objects.filter((o) => o.type === "table");
  const indexes = objects.filter((o) => o.type === "index");

  for (const t of tables) {
    lines.push(`\n-- Table: ${t.name}`);
    lines.push(`${t.sql};`);

    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name);
    const rows = db.prepare(`SELECT * FROM "${t.name}"`).all();
    for (const row of rows) {
      const values = cols.map((c) => sqlQuote(row[c]));
      lines.push(
        `INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${values.join(",")});`
      );
    }
    lines.push(`-- ${t.name}: ${rows.length} row(s)`);
  }

  for (const idx of indexes) {
    lines.push(`\n-- Index: ${idx.name}`);
    lines.push(`${idx.sql};`);
  }

  lines.push("\nCOMMIT;");

  fs.writeFileSync(outFile, lines.join("\n"), "utf8");
  db.close();

  console.log(`[d1-export] wrote ${outFile}`);
  console.log(`[d1-export] tables: ${tables.length}, indexes: ${indexes.length}`);
  console.log(
    `[d1-export] NEXT (manual, cloud-5b): review the file, then run` +
      `\n  wrangler d1 execute velocity-db --remote --file="${outFile}"` +
      `\nfrom a machine authenticated against the real Cloudflare account.`
  );
}

main();
