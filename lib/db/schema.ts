import { sqliteTable, integer, text, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/* ----------------------------------------------------------------------------
 * Athletes (cloud-1 groundwork, P0-1) — one row per authenticated user.
 *
 * `email` is expected to eventually map 1:1 to the Cloudflare Access
 * authenticated identity. Every per-athlete data table below carries an
 * `athlete_id` FK (defaulting to the seeded id-1 row, DEFAULT_ATHLETE_ID)
 * so single-user behaviour is unchanged until real auth lands. This is
 * groundwork only — no auth/session logic, no cross-athlete isolation yet.
 * -------------------------------------------------------------------------- */
export const athletes = sqliteTable('athletes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
});

export type Athlete = typeof athletes.$inferSelect;
export type NewAthlete = typeof athletes.$inferInsert;

/** Seeded single-athlete id — every per-athlete row defaults to this until real auth lands. */
export const DEFAULT_ATHLETE_ID = 1;

/* ----------------------------------------------------------------------------
 * Activities — the canonical table. Strava is the primary source today;
 * future Garmin / Coros / Apple Health imports also land here, distinguished
 * by the `source` column.
 * -------------------------------------------------------------------------- */
export const activities = sqliteTable(
  'activities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
    source: text('source', { enum: ['strava', 'garmin', 'coros', 'apple', 'manual'] }).notNull(),
    sourceId: text('source_id').notNull(), // Strava activity ID, etc.

    name: text('name'),
    type: text('type').notNull(), // Run, VirtualRun, Ride, WeightTraining, ...
    sportType: text('sport_type'),
    startDateUtc: text('start_date_utc').notNull(), // ISO 8601, always UTC
    startDateLocal: text('start_date_local').notNull(), // ISO 8601, no offset

    distanceM: real('distance_m'),         // metres
    movingTimeS: integer('moving_time_s'), // seconds
    elapsedTimeS: integer('elapsed_time_s'),
    elevationGainM: real('elevation_gain_m'),

    avgSpeedMs: real('avg_speed_ms'),     // m/s
    maxSpeedMs: real('max_speed_ms'),
    avgHr: real('avg_hr'),
    maxHr: real('max_hr'),
    avgCadence: real('avg_cadence'),
    sufferScore: integer('suffer_score'),
    kudos: integer('kudos'),

    /** Strava gear_id (e.g. 'g1234567'). Null if no gear assigned in Strava. */
    gearId: text('gear_id'),
    /** Cached gear display name from Strava — saves a re-fetch when listing. */
    gearName: text('gear_name'),

    rawJson: text('raw_json'), // full source payload, in case we need fields we didn't map

    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    sourceIdx: index('activities_source_idx').on(t.source, t.sourceId),
    dateIdx: index('activities_date_idx').on(t.startDateLocal),
    typeIdx: index('activities_type_idx').on(t.type),
    gearIdx: index('activities_gear_idx').on(t.gearId),
  })
);

/* ----------------------------------------------------------------------------
 * Plans — user-selected dojo + parameters. Only one is "active" at a time
 * but we keep history so users can compare phases later.
 * -------------------------------------------------------------------------- */
export const plans = sqliteTable('plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
  dojo: text('dojo', { enum: ['lydiard', 'hansons', 'custom'] }).notNull(),
  goalDistanceKm: real('goal_distance_km').notNull(), // 42.195 for marathon
  goalTimeS: integer('goal_time_s').notNull(),         // 12600 = 3:30:00
  level: text('level', { enum: ['beginner', 'intermediate', 'advanced'] }).notNull(),
  weeklyVolumeCapKm: real('weekly_volume_cap_km'),     // optional, e.g. 80 for Matt
  longRunCapKm: real('long_run_cap_km'),
  paceZonesJson: text('pace_zones_json').notNull(),    // derived from goal+dojo+level
  customWeekJson: text('custom_week_json'),            // only for dojo='custom'
  startDate: text('start_date').notNull(),             // ISO date
  isActive: integer('is_active', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
});

/* ----------------------------------------------------------------------------
 * Journal — daily wellness/stress/sleep log. Manual entries today, optionally
 * supplemented by Garmin/Coros/Apple Health data later.
 * -------------------------------------------------------------------------- */
export const journal = sqliteTable('journal', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
  date: text('date').notNull().unique(), // YYYY-MM-DD, local

  sleepQuality: integer('sleep_quality'),  // 1-10
  sleepHours: real('sleep_hours'),
  workStress: integer('work_stress'),      // 1-10
  perceivedEffort: integer('perceived_effort'), // 1-10 (today's session)
  energy: integer('energy'),               // 1-10 (morning self-assessment)

  // Reserved for future health-source overlays
  hrvMs: real('hrv_ms'),
  restingHr: integer('resting_hr'),
  bodyBattery: integer('body_battery'),
  trainingReadiness: integer('training_readiness'),
  hrvSource: text('hrv_source'),

  notes: text('notes'),

  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
});

/* ----------------------------------------------------------------------------
 * Settings — single-row key-value store for non-secret app state.
 * Strava client_id is fine here. Strava client_secret + tokens go in OS keychain.
 * -------------------------------------------------------------------------- */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
});

/* ----------------------------------------------------------------------------
 * Sync log — audit trail for syncs. Useful for debugging "why are activities missing".
 * -------------------------------------------------------------------------- */
export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
  source: text('source').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  activitiesAdded: integer('activities_added').default(0),
  activitiesUpdated: integer('activities_updated').default(0),
  status: text('status', { enum: ['running', 'success', 'error'] }).notNull(),
  errorMessage: text('error_message'),
});

/* ----------------------------------------------------------------------------
 * Races — the calendar of races the athlete is targeting.
 *
 * Exactly one race per program has is_goal=true (the A-race). All others
 * are tune-ups: dated reference points the plan engine uses to schedule
 * mini-tapers and confidence-builder workouts.
 * -------------------------------------------------------------------------- */
export const races = sqliteTable(
  'races',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
    name: text('name').notNull(),
    distanceKm: real('distance_km').notNull(),
    raceDate: text('race_date').notNull(), // YYYY-MM-DD
    targetTimeS: integer('target_time_s'), // optional — tune-ups often have no target
    isGoal: integer('is_goal', { mode: 'boolean' }).default(false).notNull(),
    level: text('level', { enum: ['beginner', 'intermediate', 'advanced'] }), // set on goal race only
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    dateIdx: index('races_date_idx').on(t.raceDate),
  })
);

/* ----------------------------------------------------------------------------
 * Recurring sessions — weekly group runs the athlete attends regularly.
 *
 * E.g. "Shoe Science · Tue", "Coaches Run · Thu", or "Ninja Loop · public holidays".
 * The plan engine reads these and slots them into the week template at the
 * appropriate session_type, replacing whatever the dojo would otherwise have
 * scheduled for that day.
 * -------------------------------------------------------------------------- */
export const recurringSessions = sqliteTable('recurring_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
  name: text('name').notNull(),
  dow: integer('dow').notNull(), // 0=Mon ... 6=Sun. -1 reserved for is_ninja_loop=true.
  sessionType: text('session_type', {
    enum: ['recovery', 'easy', 'long', 'tempo', 'interval', 'repetition', 'cross', 'strength'],
  }).notNull(),
  typicalDistanceKmMin: real('typical_distance_km_min'),
  typicalDistanceKmMax: real('typical_distance_km_max'),
  paceLabel: text('pace_label'), // free-text like "5:30-6:00/km" — display only
  venue: text('venue'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  /** When true, this session repeats on every NZ public holiday rather than weekly. */
  isNinjaLoop: integer('is_ninja_loop', { mode: 'boolean' }).default(false).notNull(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
});

/* ----------------------------------------------------------------------------
 * Calendar events — one-off dated events that affect training capacity.
 *
 * Two flavours:
 *   - Expected (entered ahead): holiday, work_trip, birthday, ninja_loop_holiday
 *   - Unexpected (logged after): sickness, caregiving, other
 *
 * `impact` tells the plan engine what to do for those days:
 *   - none           → tracking only, no plan adjustment
 *   - reduced        → scale targets to 50% for affected days
 *   - travel_only    → expect short easy runs only
 *   - no_training    → zero-out targets for affected days
 *   - group_run      → add a group run on this day (used by ninja_loop_holiday)
 * -------------------------------------------------------------------------- */
export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
    eventType: text('event_type', {
      enum: [
        'holiday',
        'work_trip',
        'birthday',
        'sickness',
        'caregiving',
        'ninja_loop_holiday',
        'other',
      ],
    }).notNull(),
    title: text('title'),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    endDate: text('end_date'), // YYYY-MM-DD, null for single day
    impact: text('impact', {
      enum: ['none', 'reduced', 'travel_only', 'no_training', 'group_run'],
    }).notNull(),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    startIdx: index('calendar_events_start_idx').on(t.startDate),
    typeIdx: index('calendar_events_type_idx').on(t.eventType),
  })
);

/* ----------------------------------------------------------------------------
 * NZ public holidays — canonical cache from sohnemann iCal (GitHub).
 *
 * Refreshed on user demand and auto-triggered on 1 September each year (when
 * MBIE publishes the next year's dates). Replaces hardcoded holiday data.
 * -------------------------------------------------------------------------- */
export const nzHolidays = sqliteTable(
  'nz_holidays',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(), // YYYY-MM-DD (observed date if applicable)
    name: text('name').notNull(),
    /** Null = national. Otherwise region label e.g. 'Auckland', 'Wellington'. */
    region: text('region'),
    year: integer('year').notNull(),
    source: text('source', { enum: ['github-ical', 'manual'] }).notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    dateIdx: index('nz_holidays_date_idx').on(t.date),
    yearIdx: index('nz_holidays_year_idx').on(t.year),
  })
);

export type NzHolidayRow = typeof nzHolidays.$inferSelect;

/* ----------------------------------------------------------------------------
 * Sync jobs — stateful, resumable sync runs.
 *
 * Three job types:
 *   initial_90d        — automatic, runs once after wizard completes
 *   extended_history   — user-triggered, pulls everything older than 90d
 *   incremental        — manual or scheduled "sync now" run
 *
 * Status lifecycle:
 *   pending → running → (paused | rate_limited | completed | failed)
 *   paused | rate_limited → running (on resume)
 *
 * Resumability: cursor_before holds the unix timestamp for the next
 * Strava /athlete/activities `before` param. On resume, we read this and
 * continue from where we stopped.
 * -------------------------------------------------------------------------- */
export const syncJobs = sqliteTable(
  'sync_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
    source: text('source', { enum: ['strava', 'garmin', 'coros', 'apple'] }).notNull(),
    jobType: text('job_type', {
      enum: ['initial_90d', 'extended_history', 'incremental', 'gear_backfill'],
    }).notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'paused', 'rate_limited', 'completed', 'failed'],
    }).notNull(),

    startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    lastHeartbeatAt: integer('last_heartbeat_at', { mode: 'timestamp' }).notNull(),

    /** Unix seconds — Strava `before` cursor. Pages move backwards in time. */
    cursorBefore: integer('cursor_before'),
    /** Unix seconds — Strava `after` cursor. Used by incremental syncs. */
    cursorAfter: integer('cursor_after'),
    /** ISO date of the oldest activity successfully ingested in this job. */
    oldestFetched: text('oldest_fetched'),
    /** ISO date of the newest activity successfully ingested. */
    newestFetched: text('newest_fetched'),

    pagesFetched: integer('pages_fetched').default(0).notNull(),
    added: integer('added').default(0).notNull(),
    updated: integer('updated').default(0).notNull(),

    /** Total activities the user expects (from API meta if available; null otherwise). */
    estimatedTotal: integer('estimated_total'),

    /** Set when we hit a 429 — the unix seconds at which we can resume. */
    rateLimitResetsAt: integer('rate_limit_resets_at', { mode: 'timestamp' }),
    errorMessage: text('error_message'),

    /** If this job was resumed from a paused/rate_limited job, link back. */
    parentJobId: integer('parent_job_id'),
  },
  (t) => ({
    statusIdx: index('sync_jobs_status_idx').on(t.status),
    sourceTypeIdx: index('sync_jobs_source_type_idx').on(t.source, t.jobType),
  })
);

export type SyncJob = typeof syncJobs.$inferSelect;
export type NewSyncJob = typeof syncJobs.$inferInsert;

/* ----------------------------------------------------------------------------
 * Type exports — used throughout the app for type-safe queries.
 * -------------------------------------------------------------------------- */
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
/* ----------------------------------------------------------------------------
 * Shoes — mirror + enrichment layer over Strava gear inventory.
 *
 * Strava is the source of truth for "what shoes you own" and "how many km
 * on each". We mirror those numbers here for fast queries, and add our
 * own enrichment fields: recommended_km from the bundled CSV, user
 * override targets, retirement nudge state, favourite flag, photos,
 * notes.
 *
 * `strava_gear_id` is unique when present (one row per gear). For shoes
 * the user added manually (off-Strava boutique brands, etc), the column
 * is null and `manual_entry` is true.
 *
 * Stage 1: read-only against Strava — never write back. Stage 2 will add
 * activity:write scope and bulk re-tag operations.
 * -------------------------------------------------------------------------- */
export const shoes = sqliteTable(
  'shoes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),

    /** Strava gear_id ('g1234567') if this shoe came from Strava. Null = manual. */
    stravaGearId: text('strava_gear_id').unique(),
    /** Display name. From Strava if synced, else user-entered. */
    name: text('name').notNull(),
    /** Parsed brand from CSV match — e.g. 'Saucony'. Best-effort. */
    brand: text('brand'),
    /** Parsed model from CSV match — e.g. 'Endorphin Pro 3'. Best-effort. */
    model: text('model'),
    /** Category from CSV match — race-day / super-trainer / uptempo / daily / trail. */
    category: text('category'),
    /** Whether the shoe has a carbon plate. Affects expected lifespan. */
    carbonPlate: integer('carbon_plate', { mode: 'boolean' }).default(false).notNull(),

    /** From Strava: total km tracked by Strava (we re-read every sync). */
    stravaDistanceKm: real('strava_distance_km'),
    /** From CSV match: manufacturer-recommended life. Null if no match. */
    recommendedKm: real('recommended_km'),
    /** User override of recommended_km. Takes precedence in the nudge logic. */
    userTargetKm: real('user_target_km'),

    /** Acquired date (manual entry only — Strava doesn't expose this). */
    purchaseDate: text('purchase_date'),
    /** Retirement date — set when user clicks "Retire shoe". */
    retireDate: text('retire_date'),
    /** active = in rotation, retired = the user explicitly retired it. */
    status: text('status', { enum: ['active', 'retired'] }).default('active').notNull(),

    /** ★ favourite — surfaces retailer search section on the card. */
    isFavourite: integer('is_favourite', { mode: 'boolean' }).default(false).notNull(),

    /** Manual-entry flag — distinguishes shoes the app created from Strava data. */
    manualEntry: integer('manual_entry', { mode: 'boolean' }).default(false).notNull(),

    /** Filename under <dataDir>/shoe-photos/ — null if no photo. */
    photoFilename: text('photo_filename'),

    /** Set when user dismisses the 80% nudge — used to suppress re-nagging. */
    nudgeDismissedAt: integer('nudge_dismissed_at', { mode: 'timestamp' }),

    notes: text('notes'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    stravaGearIdx: index('shoes_strava_gear_idx').on(t.stravaGearId),
    statusIdx: index('shoes_status_idx').on(t.status),
  })
);

/* ----------------------------------------------------------------------------
 * Activity ↔ Shoe assignments — for MANUAL-ENTRY shoes only.
 *
 * For Strava-sourced shoes we use `activities.gear_id` directly. But for
 * shoes the user added manually (off-Strava), we need an explicit join
 * table since Strava doesn't know about those shoes.
 *
 * One activity = at most one manual shoe.
 * -------------------------------------------------------------------------- */
export const activityShoeAssignments = sqliteTable(
  'activity_shoe_assignments',
  {
    activityId: integer('activity_id').notNull().primaryKey(),
    shoeId: integer('shoe_id').notNull(),
    assignedAt: integer('assigned_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    shoeIdx: index('activity_shoe_assignments_shoe_idx').on(t.shoeId),
  })
);

/* ----------------------------------------------------------------------------
 * Shoe price watches — manual price-tracking entries the user logs when
 * they spot a price at a retailer. Builds a small price history per
 * shoe per retailer.
 *
 * Manual logging only. We never scrape retailer sites.
 * -------------------------------------------------------------------------- */
export const shoePriceWatches = sqliteTable(
  'shoe_price_watches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    shoeId: integer('shoe_id').notNull(),
    retailer: text('retailer').notNull(),
    price: real('price').notNull(),
    currency: text('currency').notNull(),
    /** Optional URL the user noted. */
    url: text('url'),
    notes: text('notes'),
    observedAt: integer('observed_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => ({
    shoeIdx: index('shoe_price_watches_shoe_idx').on(t.shoeId),
  })
);

export type Shoe = typeof shoes.$inferSelect;
export type NewShoe = typeof shoes.$inferInsert;
export type ActivityShoeAssignment = typeof activityShoeAssignments.$inferSelect;
export type NewActivityShoeAssignment = typeof activityShoeAssignments.$inferInsert;
export type ShoePriceWatch = typeof shoePriceWatches.$inferSelect;
export type NewShoePriceWatch = typeof shoePriceWatches.$inferInsert;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type JournalEntry = typeof journal.$inferSelect;
export type NewJournalEntry = typeof journal.$inferInsert;
export type Race = typeof races.$inferSelect;
export type NewRace = typeof races.$inferInsert;
export type RecurringSession = typeof recurringSessions.$inferSelect;
export type NewRecurringSession = typeof recurringSessions.$inferInsert;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;

/* ----------------------------------------------------------------------------
 * plan_periods — historical record of plans the athlete has been on.
 *
 * The current "active plan" is denormalised into the settings table for
 * fast read paths. plan_periods preserves history so that compliance
 * evaluation for any past week uses the dojo and goal that were active
 * at that time, not the currently-selected one.
 *
 * Closing a period:
 *   - end_date = day before the new period starts
 *   - closed_reason = why ('reselect_dojo' | 'goal_changed' | 'completed')
 *
 * Active period: end_date IS NULL
 * -------------------------------------------------------------------------- */
export const planPeriods = sqliteTable(
  'plan_periods',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
    dojo: text('dojo').notNull(),

    startDate: text('start_date').notNull(),
    endDate: text('end_date'),

    goalRaceId: integer('goal_race_id'),
    goalDistanceKm: real('goal_distance_km'),
    goalTargetTimeS: integer('goal_target_time_s'),
    programWeeks: integer('program_weeks').notNull().default(18),
    level: text('level'),

    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    closedReason: text('closed_reason'),
  },
  (t) => ({
    startIdx: index('idx_plan_periods_start').on(t.startDate),
  })
);

export type PlanPeriod = typeof planPeriods.$inferSelect;
export type NewPlanPeriod = typeof planPeriods.$inferInsert;

/* ============================================================================
 * Plan adjustments (Phase 3b plumbing - empty until 3b commences)
 *
 * Audit trail of every engine-suggested adjustment to a week's prescription.
 * Each row captures:
 *   - When the proposal was made
 *   - Whether it was applied or dismissed (and when)
 *   - What triggered it (TSB-low, ACWR-high, ...)
 *   - Human-readable rationale
 *   - JSON snapshots of before/after state
 *   - The coach mode active at proposal time
 *
 * Logged regardless of mode:
 *   - manual mode: row with applied_at=NULL, dismissed_at=NULL until user acts
 *   - assisted mode: same, awaiting user accept/dismiss
 *   - automatic mode: row with applied_at set immediately
 *
 * Override-frequency analysis (deferred to v2) consumes this table.
 * ========================================================================== */

export const planAdjustments = sqliteTable(
  'plan_adjustments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),

    proposedAt: text('proposed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    appliedAt: text('applied_at'),       // null until applied
    dismissedAt: text('dismissed_at'),   // null until dismissed

    // Trigger codes (stable strings):
    //   tsb-low | acwr-high | monotony-high | sickness-window |
    //   travel-window | injury-logged | manual-request
    trigger: text('trigger').notNull(),

    rationale: text('rationale').notNull(),

    // JSON snapshots of athlete state + week template before/after.
    // Stored as text so we don't have to design a full schema yet -
    // 3b sets the structure when it commences.
    beforeState: text('before_state'),
    afterState: text('after_state'),

    // The coach mode in effect when this row was created.
    // Useful for analysis (which mode produces more dismissals).
    mode: text('mode').notNull(),

    // Optional: which week this affected, anchored to its Monday.
    weekStartIso: text('week_start_iso'),
  },
  (t) => ({
    proposedAtIdx: index('idx_plan_adjustments_proposed_at').on(t.proposedAt),
    triggerIdx: index('idx_plan_adjustments_trigger').on(t.trigger),
  })
);

export type PlanAdjustment = typeof planAdjustments.$inferSelect;
export type NewPlanAdjustment = typeof planAdjustments.$inferInsert;

/* ============================================================================
 * Daily health metrics (Phase 12 - external biometric data sources)
 *
 * One row per (date, source). Source-agnostic: Garmin, Apple Health,
 * Whoop, Coros, manual entry all write the same shape. Columns are
 * nullable because no source provides everything.
 *
 * Source priority for downstream consumers (highest trust first):
 *   manual-lab > garmin > whoop > apple-health > coros > manual
 *
 * Units:
 *   rhr_bpm           - resting heart rate, beats/min
 *   hrv_ms            - overnight HRV (rMSSD), milliseconds
 *   sleep_duration_s  - total sleep, seconds
 *   sleep_score       - vendor 0-100 score (vendor-specific semantics)
 *   stress_score      - vendor 0-100 (Garmin: avg daily stress)
 *   body_battery      - Garmin 0-100 (null for other sources)
 *   vo2max_device     - device-estimated VO2 max, ml/kg/min
 *   weight_kg         - body mass
 * ========================================================================== */

export const dailyHealthMetrics = sqliteTable(
  'daily_health_metrics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
    /** ISO date 'YYYY-MM-DD' the metrics describe (local) */
    date: text('date').notNull(),
    /** garmin | apple-health | whoop | coros | manual | manual-lab */
    source: text('source').notNull(),

    rhrBpm: integer('rhr_bpm'),
    hrvMs: real('hrv_ms'),
    sleepDurationS: integer('sleep_duration_s'),
    sleepScore: integer('sleep_score'),
    stressScore: integer('stress_score'),
    bodyBattery: integer('body_battery'),
    vo2maxDevice: real('vo2max_device'),
    weightKg: real('weight_kg'),

    /** Raw vendor payload (JSON) for fields we don't model yet */
    raw: text('raw'),

    syncedAt: text('synced_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    dateSourceIdx: uniqueIndex('idx_health_date_source').on(t.date, t.source),
    dateIdx: index('idx_health_date').on(t.date),
  })
);

export type DailyHealthMetric = typeof dailyHealthMetrics.$inferSelect;
export type NewDailyHealthMetric = typeof dailyHealthMetrics.$inferInsert;

/* ============================================================================
 * VO2 max observations (R2.5)
 *
 * User-entered or test-derived VO2 max readings. Device estimates live in
 * daily_health_metrics (vo2max_device); this table holds the other three
 * sources: manual-lab, cooper, rockport. One row per observation - a full
 * history is kept so the trend chart can show progression.
 *
 * `inputs` stores the raw test inputs as JSON (e.g. Cooper distance, or
 * Rockport weight/age/time/HR) for transparency and recomputation.
 * ========================================================================== */

export const vo2maxObservations = sqliteTable(
  'vo2max_observations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
    /** ISO date 'YYYY-MM-DD' the test was taken */
    date: text('date').notNull(),
    /** manual-lab | cooper | rockport (device is in daily_health_metrics) */
    source: text('source').notNull(),
    /** ml/kg/min */
    value: real('value').notNull(),
    /** Raw test inputs as JSON, for transparency / recompute */
    inputs: text('inputs'),
    note: text('note'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    dateIdx: index('idx_vo2max_date').on(t.date),
    sourceIdx: index('idx_vo2max_source').on(t.source),
  })
);

export type Vo2maxObservation = typeof vo2maxObservations.$inferSelect;
export type NewVo2maxObservation = typeof vo2maxObservations.$inferInsert;

/* ============================================================================
 * Interruptions (Phase 4)
 *
 * Athlete-logged breaks in training: injury, illness, travel, other. The pure
 * logic lives in lib/analysis/interruptions-pure.ts; this is just storage.
 * Locked decision: logged injuries NEVER auto-adjust the plan - Phase 4
 * informs, the athlete drives recovery. end_date NULL = still active.
 * ========================================================================== */

export const interruptions = sqliteTable(
  'interruptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    athleteId: integer('athlete_id').notNull().default(1).references(() => athletes.id),
    type: text('type', { enum: ['injury', 'illness', 'travel', 'other'] }).notNull(),
    /** Body region for injuries (e.g. 'calf', 'knee'); null otherwise */
    bodyRegion: text('body_region'),
    severity: text('severity', { enum: ['niggle', 'moderate', 'severe'] }).notNull(),
    /** ISO date 'YYYY-MM-DD' the interruption started */
    startDate: text('start_date').notNull(),
    /** ISO date it resolved, or null if ongoing */
    endDate: text('end_date'),
    note: text('note'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    startIdx: index('idx_interruptions_start').on(t.startDate),
    endIdx: index('idx_interruptions_end').on(t.endDate),
  })
);

export type InterruptionRow = typeof interruptions.$inferSelect;
export type NewInterruptionRow = typeof interruptions.$inferInsert;

/* ----------------------------------------------------------------------------
 * Race results — post-race debrief for the goal race (Phase 6 part 2).
 *
 * One row per race. Keeps the races row immutable: the plan is set before the
 * race; the result is logged after. Holds achieved finish time, conditions,
 * perceived effort (RPE 1-10), and lessons to carry into the next block.
 * -------------------------------------------------------------------------- */
export const raceResults = sqliteTable(
  'race_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    raceId: integer('race_id').notNull(),
    finishTimeS: integer('finish_time_s'), // achieved finish time, seconds
    conditions: text('conditions'),        // weather / course / how it felt
    rpe: integer('rpe'),                    // 1-10 perceived effort
    lessons: text('lessons'),              // what to carry into the next block
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    raceIdx: index('idx_race_results_race').on(t.raceId),
  })
);

export type RaceResultRow = typeof raceResults.$inferSelect;
export type NewRaceResultRow = typeof raceResults.$inferInsert;
