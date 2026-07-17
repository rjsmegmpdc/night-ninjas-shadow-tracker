-- Athletes table + athlete_id scoping (cloud-1, P0-1 multi-user groundwork).
--
-- Adds the athletes table and an athlete_id column (default 1) to every
-- per-athlete data table, then seeds the single default athlete (id 1) so
-- existing single-user behaviour is unchanged. settings and nz_holidays
-- stay app-global (no athlete_id) — see lib/db/schema.ts. Join/derived
-- tables (activity_shoe_assignments, shoe_price_watches, race_results)
-- also stay unscoped: they inherit athlete scoping transitively through
-- the activity/shoe/race row they reference.
--
-- athlete_id columns are added WITHOUT an inline REFERENCES clause: SQLite's
-- ALTER TABLE ADD COLUMN does not reliably support adding a foreign-key
-- column to a table that may already have rows. The FK relationship is
-- still declared at the Drizzle schema level (schema.ts) for type safety
-- and any future full-table regeneration; enforcement can be added once
-- real multi-tenancy (auth-backed athlete resolution) lands.

CREATE TABLE IF NOT EXISTS athletes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO athletes (id, email, name) VALUES (1, 'default@local', 'Default Athlete');

ALTER TABLE activities ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE journal ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sync_log ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE races ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE recurring_sessions ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE calendar_events ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sync_jobs ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shoes ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plan_periods ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plan_adjustments ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE daily_health_metrics ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vo2max_observations ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE interruptions ADD COLUMN athlete_id INTEGER NOT NULL DEFAULT 1;
