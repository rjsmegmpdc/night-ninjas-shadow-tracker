import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import type { PromptDefaults, WellnessField } from '@/lib/analysis/prompt-context-pure';

/* ----------------------------------------------------------------------------
 * Settings — typed key/value access against the settings table.
 *
 * The schema is loose intentionally: we want to evolve config without
 * migration churn. But each accessor below is typed so application code
 * is still type-safe.
 *
 * Secrets (Strava client_secret, OAuth tokens) DO NOT live here — they
 * go in the OS keychain via `lib/store/secrets.ts`.
 * -------------------------------------------------------------------------- */

const KEY = {
  SETUP_COMPLETE: 'setup.complete',
  STRAVA_CLIENT_ID: 'strava.client_id',
  STRAVA_ATHLETE_ID: 'strava.athlete_id',
  STRAVA_LAST_SYNC_AT: 'strava.last_sync_at',
  USER_TIMEZONE: 'user.timezone',
  STREAK_RUN_EVERYDAY: 'streak.run_everyday',
  FIRST_DAY_OF_WEEK: 'prefs.firstDayOfWeek',
  // Phase 3b plumbing - read by 3b's interpretState/applyAdjustment
  COACH_MODE: 'prefs.coachMode',
  // R1.5 plumbing - club schedule sharing
  CLUB_PARKRUN_ID: 'club.parkrun_id',
  CLUB_TERMS_ACCEPTED_AT: 'club.terms_accepted_at',
  CLUB_WINDOW_DEFAULT: 'club.window_default',
  CLUB_LAST_SHARE_GENERATED_AT: 'club.last_share_generated_at',
  ATHLETE_ID: 'club.athlete_id',
  SCHEDULE_PASSWORD_HASH: 'club.schedule_password_hash',
  // Phase 12 plumbing - Garmin biometric sync
  GARMIN_SYNC_ENABLED: 'garmin.sync_enabled',
  GARMIN_LAST_SYNC_AT: 'garmin.last_sync_at',
  // R2.5 - athlete profile (for VO2 estimates + HR calibration)
  PROFILE_AGE: 'profile.age',
  PROFILE_WEIGHT_KG: 'profile.weight_kg',
  PROFILE_SEX: 'profile.sex',
  PROFILE_MAX_HR: 'profile.max_hr',
  PROFILE_RESTING_HR: 'profile.resting_hr',
  // NS personal HR calibration (seeded from Matt's NS analysis as editable defaults)
  NS_EASY_HR_CAP: 'ns.easy_hr_cap',
  NS_SUBT_HR_CAP: 'ns.subt_hr_cap',
  NS_HR_CONFIDENCE: 'ns.hr_confidence',
  NS_DEFAULTS_SEEDED: 'ns.defaults_seeded',
  // Phase 5 - auxiliary strength-work preference
  STRENGTH_MODALITY: 'profile.strength_modality',
  STRENGTH_TARGET_PER_WEEK: 'profile.strength_target_per_week',
  // Daily-loop Stage 1 plumbing - ambient sync freshness threshold
  AMBIENT_SYNC_THRESHOLD_HOURS: 'sync.ambient_threshold_hours',
  // Daily-loop Stage 3 plumbing - prompt-queue wellness-checkin defaults
  PROMPT_WELLNESS_SLEEP_QUALITY_DEFAULT: 'prompt.wellnessDefault.sleepQuality',
  PROMPT_WELLNESS_SLEEP_HOURS_DEFAULT: 'prompt.wellnessDefault.sleepHours',
  PROMPT_WELLNESS_ENERGY_DEFAULT: 'prompt.wellnessDefault.energy',
  PROMPT_AUTO_SKIP_WELLNESS_CHECKIN: 'prompt.autoSkipWellnessCheckin',
} as const;

async function get(key: string): Promise<string | null> {
  const row = await getDb()
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();
  return row?.value ?? null;
}

async function set(key: string, value: string): Promise<void> {
  await getDb()
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date() },
    });
}

/* ----------------------------------------------------------------------------
 * Public API — typed accessors only.
 * -------------------------------------------------------------------------- */

export async function isSetupComplete(): Promise<boolean> {
  try {
    return (await get(KEY.SETUP_COMPLETE)) === 'true';
  } catch {
    // First boot — DB may not exist yet. Treat as not-complete.
    return false;
  }
}

export async function markSetupComplete(): Promise<void> {
  await set(KEY.SETUP_COMPLETE, 'true');
}

export async function getStravaClientId(): Promise<string | null> {
  return get(KEY.STRAVA_CLIENT_ID);
}

export async function setStravaClientId(id: string): Promise<void> {
  await set(KEY.STRAVA_CLIENT_ID, id);
}

export async function getStravaAthleteId(): Promise<string | null> {
  return get(KEY.STRAVA_ATHLETE_ID);
}

export async function setStravaAthleteId(id: string): Promise<void> {
  await set(KEY.STRAVA_ATHLETE_ID, id);
}

export async function getLastSyncAt(): Promise<Date | null> {
  const v = await get(KEY.STRAVA_LAST_SYNC_AT);
  return v ? new Date(v) : null;
}

export async function setLastSyncAt(d: Date): Promise<void> {
  await set(KEY.STRAVA_LAST_SYNC_AT, d.toISOString());
}

export async function getUserTimezone(): Promise<string> {
  return (await get(KEY.USER_TIMEZONE)) ?? 'Pacific/Auckland';
}

export async function setUserTimezone(tz: string): Promise<void> {
  await set(KEY.USER_TIMEZONE, tz);
}

/**
 * Streak mode setting.
 *
 * When false (default): any sport_type counts toward the streak — runs,
 * cycling, gym sessions, walks, all qualify.
 *
 * When true: only Run / TrailRun / VirtualRun count. Stricter, opt-in.
 */
export async function getStreakRunEverydayMode(): Promise<boolean> {
  const v = await get(KEY.STREAK_RUN_EVERYDAY);
  return v === 'true';
}

export async function setStreakRunEverydayMode(value: boolean): Promise<void> {
  await set(KEY.STREAK_RUN_EVERYDAY, value ? 'true' : 'false');
}

/**
 * First-day-of-week display preference.
 *
 * Controls how the matrix and other week-based surfaces present days:
 * - 'monday' (default): columns Mon Tue Wed Thu Fri Sat Sun
 * - 'sunday' (US convention): columns Sun Mon Tue Wed Thu Fri Sat
 *
 * IMPORTANT: this is a DISPLAY-ONLY setting. The internal day-of-week
 * model is always Monday=0..Sunday=6. The matrix presentation layer
 * translates between user-facing column order and internal dow indexing.
 *
 * Reasoning: making the underlying model Monday-anchored everywhere
 * (engines, load calcs, tests, persisted plans) avoids invariant drift
 * across the codebase. We pay a small translation cost only at the
 * presentation boundary.
 */
export type FirstDayOfWeek = 'monday' | 'sunday';

export async function getFirstDayOfWeek(): Promise<FirstDayOfWeek> {
  const v = await get(KEY.FIRST_DAY_OF_WEEK);
  return v === 'sunday' ? 'sunday' : 'monday';
}

export async function setFirstDayOfWeek(value: FirstDayOfWeek): Promise<void> {
  await set(KEY.FIRST_DAY_OF_WEEK, value);
}

/* ============================================================================
 * Coach mode (Phase 3b plumbing - data only, no behaviour yet)
 *
 * Three positions:
 *   - 'manual'    - engine surfaces insights only; user manually edits
 *   - 'assisted'  - engine proposes adjustments; user accepts or dismisses
 *   - 'automatic' - engine applies adjustments and notifies the user
 *
 * Default 'assisted'. Setting persisted but not yet read by any engine -
 * Phase 3b commences using this when interpretState/applyAdjustment land.
 * ========================================================================== */

export type CoachMode = 'manual' | 'assisted' | 'automatic';

export async function getCoachMode(): Promise<CoachMode> {
  const v = await get(KEY.COACH_MODE);
  if (v === 'manual' || v === 'automatic') return v;
  return 'assisted';
}

export async function setCoachMode(value: CoachMode): Promise<void> {
  await set(KEY.COACH_MODE, value);
}

/* ============================================================================
 * Club schedule sharing (R1.5 plumbing - data only)
 *
 * Settings persisted now so R1.5's UI lands without a schema migration.
 * The actual generator + Settings card commence in R1.5.
 * ========================================================================== */

export async function getClubParkrunId(): Promise<string | null> {
  return await get(KEY.CLUB_PARKRUN_ID);
}

export async function setClubParkrunId(value: string | null): Promise<void> {
  if (value === null) await set(KEY.CLUB_PARKRUN_ID, '');
  else await set(KEY.CLUB_PARKRUN_ID, value);
}

export async function getClubTermsAcceptedAt(): Promise<string | null> {
  const v = await get(KEY.CLUB_TERMS_ACCEPTED_AT);
  return v === '' ? null : v;
}

export async function setClubTermsAcceptedAt(iso: string): Promise<void> {
  await set(KEY.CLUB_TERMS_ACCEPTED_AT, iso);
}

export type ClubWindowDefault = '1w' | '2w' | '4w' | 'next-race' | 'program-end';

export async function getClubWindowDefault(): Promise<ClubWindowDefault> {
  const v = await get(KEY.CLUB_WINDOW_DEFAULT);
  if (v === '1w' || v === '4w' || v === 'next-race' || v === 'program-end') return v;
  return '2w';
}

export async function setClubWindowDefault(value: ClubWindowDefault): Promise<void> {
  await set(KEY.CLUB_WINDOW_DEFAULT, value);
}

export async function getClubLastShareGeneratedAt(): Promise<string | null> {
  const v = await get(KEY.CLUB_LAST_SHARE_GENERATED_AT);
  return v === '' ? null : v;
}

export async function setClubLastShareGeneratedAt(iso: string): Promise<void> {
  await set(KEY.CLUB_LAST_SHARE_GENERATED_AT, iso);
}

export async function getAthleteId(): Promise<string | null> {
  const v = await get(KEY.ATHLETE_ID);
  return v === '' ? null : v;
}

export async function setAthleteId(id: string): Promise<void> {
  await set(KEY.ATHLETE_ID, id);
}

export async function getSchedulePasswordHash(): Promise<string | null> {
  const v = await get(KEY.SCHEDULE_PASSWORD_HASH);
  return v === '' ? null : v;
}

export async function setSchedulePasswordHash(hash: string): Promise<void> {
  await set(KEY.SCHEDULE_PASSWORD_HASH, hash);
}


/* ============================================================================
 * Garmin biometric sync (Phase 12 plumbing - data only)
 *
 * Credentials are NOT stored in the settings table - they go in the OS
 * keystore via keytar, same pattern as Strava tokens. These settings
 * track enablement and sync watermark only.
 * ========================================================================== */

export async function getGarminSyncEnabled(): Promise<boolean> {
  const v = await get(KEY.GARMIN_SYNC_ENABLED);
  return v === 'true';
}

export async function setGarminSyncEnabled(value: boolean): Promise<void> {
  await set(KEY.GARMIN_SYNC_ENABLED, value ? 'true' : 'false');
}

export async function getGarminLastSyncAt(): Promise<string | null> {
  const v = await get(KEY.GARMIN_LAST_SYNC_AT);
  return v === '' ? null : v;
}

export async function setGarminLastSyncAt(iso: string): Promise<void> {
  await set(KEY.GARMIN_LAST_SYNC_AT, iso);
}


/* ============================================================================
 * Athlete profile (R2.5) - physical attributes for VO2 estimation and HR
 * calibration. All optional; consumers degrade when absent.
 * ========================================================================== */

export interface AthleteProfile {
  age: number | null;
  weightKg: number | null;
  sex: 'male' | 'female' | null;
  maxHr: number | null;
  restingHr: number | null;
}

async function getNum(key: string): Promise<number | null> {
  const v = await get(key);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getAthleteProfile(): Promise<AthleteProfile> {
  const [age, weightKg, sexRaw, maxHr, restingHr] = await Promise.all([
    getNum(KEY.PROFILE_AGE),
    getNum(KEY.PROFILE_WEIGHT_KG),
    get(KEY.PROFILE_SEX),
    getNum(KEY.PROFILE_MAX_HR),
    getNum(KEY.PROFILE_RESTING_HR),
  ]);
  const sex = sexRaw === 'male' || sexRaw === 'female' ? sexRaw : null;
  return { age, weightKg, sex, maxHr, restingHr };
}

export async function setAthleteProfile(p: Partial<AthleteProfile>): Promise<void> {
  const writes: Promise<void>[] = [];
  if (p.age !== undefined) writes.push(set(KEY.PROFILE_AGE, p.age === null ? '' : String(p.age)));
  if (p.weightKg !== undefined) writes.push(set(KEY.PROFILE_WEIGHT_KG, p.weightKg === null ? '' : String(p.weightKg)));
  if (p.sex !== undefined) writes.push(set(KEY.PROFILE_SEX, p.sex ?? ''));
  if (p.maxHr !== undefined) writes.push(set(KEY.PROFILE_MAX_HR, p.maxHr === null ? '' : String(p.maxHr)));
  if (p.restingHr !== undefined) writes.push(set(KEY.PROFILE_RESTING_HR, p.restingHr === null ? '' : String(p.restingHr)));
  await Promise.all(writes);
}


/* ============================================================================
 * Norwegian Singles HR calibration.
 *
 * NS lives on absolute HR caps, not generic zone fractions. These seed from
 * the athlete's own worked-out values (max HR 166, easy <= 128, sub-T <= 141)
 * as EDITABLE defaults the first time NS becomes active. Confidence starts
 * 'estimated' so the UI keeps prompting for a hill-sprint max test; once the
 * athlete sets a measured max it flips to 'measured'.
 *
 * Defaults are seeded once (guarded by NS_DEFAULTS_SEEDED) so they never
 * clobber later edits. Absolute caps, when present, override the reserve-based
 * guardrail math in ns-guardrails.
 * ========================================================================== */

export type HrConfidence = 'estimated' | 'measured';

export interface NsHrCalibration {
  easyHrCap: number | null;
  subThresholdHrCap: number | null;
  confidence: HrConfidence;
}

// Matt's personal NS calibration (from the Norwegian Singles analysis).
// Max HR 166 (medium confidence, re-test via hill sprints), easy ceiling 128,
// sub-threshold cap 141 (~0.85 x 166).
const NS_DEFAULT_MAX_HR = 166;
const NS_DEFAULT_EASY_CAP = 128;
const NS_DEFAULT_SUBT_CAP = 141;

export async function getNsHrCalibration(): Promise<NsHrCalibration> {
  const [easy, subt, conf] = await Promise.all([
    getNum(KEY.NS_EASY_HR_CAP),
    getNum(KEY.NS_SUBT_HR_CAP),
    get(KEY.NS_HR_CONFIDENCE),
  ]);
  return {
    easyHrCap: easy,
    subThresholdHrCap: subt,
    confidence: conf === 'measured' ? 'measured' : 'estimated',
  };
}

export async function setNsHrCalibration(c: Partial<NsHrCalibration>): Promise<void> {
  const writes: Promise<void>[] = [];
  if (c.easyHrCap !== undefined) writes.push(set(KEY.NS_EASY_HR_CAP, c.easyHrCap === null ? '' : String(c.easyHrCap)));
  if (c.subThresholdHrCap !== undefined) writes.push(set(KEY.NS_SUBT_HR_CAP, c.subThresholdHrCap === null ? '' : String(c.subThresholdHrCap)));
  if (c.confidence !== undefined) writes.push(set(KEY.NS_HR_CONFIDENCE, c.confidence));
  await Promise.all(writes);
}

/* ============================================================================
 * Strength / auxiliary-work preference (Phase 5).
 *
 * The athlete's preferred non-running strength modality + how often they want
 * it. The plan engine can label and structure 'Strength' days accordingly.
 * Defaults: none, 0/week.
 * ========================================================================== */

export type StrengthModality = 'weights' | 'pilates' | 'yoga' | 'mixed' | 'none';

export interface StrengthPreferences {
  modality: StrengthModality;
  /** Target sessions per week, 0-3. */
  targetPerWeek: number;
}

const STRENGTH_MODALITIES: StrengthModality[] = ['weights', 'pilates', 'yoga', 'mixed', 'none'];

export async function getStrengthPreferences(): Promise<StrengthPreferences> {
  const [modalityRaw, targetRaw] = await Promise.all([
    get(KEY.STRENGTH_MODALITY),
    getNum(KEY.STRENGTH_TARGET_PER_WEEK),
  ]);
  const modality = (STRENGTH_MODALITIES as string[]).includes(modalityRaw ?? '')
    ? (modalityRaw as StrengthModality)
    : 'none';
  const targetPerWeek = targetRaw === null ? 0 : Math.max(0, Math.min(3, Math.round(targetRaw)));
  return { modality, targetPerWeek };
}

export async function setStrengthPreferences(p: Partial<StrengthPreferences>): Promise<void> {
  const writes: Promise<void>[] = [];
  if (p.modality !== undefined) writes.push(set(KEY.STRENGTH_MODALITY, p.modality));
  if (p.targetPerWeek !== undefined) {
    writes.push(set(KEY.STRENGTH_TARGET_PER_WEEK, String(Math.max(0, Math.min(3, Math.round(p.targetPerWeek))))));
  }
  await Promise.all(writes);
}

/* ============================================================================
 * Ambient sync threshold (Daily-loop Stage 1 plumbing).
 *
 * Freshness window, in hours, before opening Patrol auto-starts an
 * incremental Strava sync. Persisted but not yet read by AmbientSync -
 * that component currently relies on the pure staleness function's
 * built-in 6h default. Wired up when a Settings UI control lands.
 * ========================================================================== */

export async function getAmbientSyncThresholdHours(): Promise<number> {
  const v = await getNum(KEY.AMBIENT_SYNC_THRESHOLD_HOURS);
  return v === null ? 6 : Math.max(1, Math.round(v));
}

export async function setAmbientSyncThresholdHours(hours: number): Promise<void> {
  await set(KEY.AMBIENT_SYNC_THRESHOLD_HOURS, String(Math.max(1, Math.round(hours))));
}

/**
 * Seed NS defaults the first time NS is active, without clobbering any value
 * the athlete already set. Idempotent: a NS_DEFAULTS_SEEDED flag means this
 * is a no-op on subsequent calls. Only fills fields that are currently empty,
 * so a user who set their own max HR keeps it.
 */
export async function seedNsDefaultsOnce(): Promise<void> {
  const seeded = await get(KEY.NS_DEFAULTS_SEEDED);
  if (seeded === 'true') return;

  const profile = await getAthleteProfile();
  const cal = await getNsHrCalibration();

  const writes: Promise<void>[] = [];
  // Max HR: only seed if the athlete hasn't set one.
  if (profile.maxHr === null) {
    writes.push(set(KEY.PROFILE_MAX_HR, String(NS_DEFAULT_MAX_HR)));
  }
  if (cal.easyHrCap === null) {
    writes.push(set(KEY.NS_EASY_HR_CAP, String(NS_DEFAULT_EASY_CAP)));
  }
  if (cal.subThresholdHrCap === null) {
    writes.push(set(KEY.NS_SUBT_HR_CAP, String(NS_DEFAULT_SUBT_CAP)));
  }
  // Confidence stays 'estimated' until a measured max is recorded.
  const confNow = await get(KEY.NS_HR_CONFIDENCE);
  if (!confNow) writes.push(set(KEY.NS_HR_CONFIDENCE, 'estimated'));

  writes.push(set(KEY.NS_DEFAULTS_SEEDED, 'true'));
  await Promise.all(writes);
}

/* ============================================================================
 * Prompt-queue defaults (Daily-loop Stage 3 plumbing).
 *
 * Configures what the wellness-checkin prompt (lib/analysis/prompt-context-pure.ts)
 * applies when the athlete skips it, and whether the prompt should surface at
 * all. `PromptDefaults`/`WellnessField` are imported (type-only) from that
 * pure module so the settings layer and the prompt-queue logic never drift
 * out of sync on shape.
 * ========================================================================== */

/** Setter input allows explicit `null` to clear a single field's default, vs `undefined` to leave it unchanged. */
export interface PromptDefaultsUpdate {
  wellnessCheckin?: Partial<Record<WellnessField, number | null>>;
  autoSkipWellnessCheckin?: boolean;
}

const WELLNESS_FIELD_KEY: Record<WellnessField, string> = {
  sleepQuality: KEY.PROMPT_WELLNESS_SLEEP_QUALITY_DEFAULT,
  sleepHours: KEY.PROMPT_WELLNESS_SLEEP_HOURS_DEFAULT,
  energy: KEY.PROMPT_WELLNESS_ENERGY_DEFAULT,
};

export async function getPromptDefaults(): Promise<PromptDefaults> {
  const [sleepQuality, sleepHours, energy, autoSkipRaw] = await Promise.all([
    getNum(KEY.PROMPT_WELLNESS_SLEEP_QUALITY_DEFAULT),
    getNum(KEY.PROMPT_WELLNESS_SLEEP_HOURS_DEFAULT),
    getNum(KEY.PROMPT_WELLNESS_ENERGY_DEFAULT),
    get(KEY.PROMPT_AUTO_SKIP_WELLNESS_CHECKIN),
  ]);

  const wellnessCheckin: PromptDefaults['wellnessCheckin'] = {};
  if (sleepQuality !== null) wellnessCheckin.sleepQuality = sleepQuality;
  if (sleepHours !== null) wellnessCheckin.sleepHours = sleepHours;
  if (energy !== null) wellnessCheckin.energy = energy;

  return {
    wellnessCheckin,
    autoSkipWellnessCheckin: autoSkipRaw === 'true',
  };
}

export async function setPromptDefaults(p: PromptDefaultsUpdate): Promise<void> {
  const writes: Promise<void>[] = [];
  if (p.wellnessCheckin) {
    for (const field of Object.keys(p.wellnessCheckin) as WellnessField[]) {
      const value = p.wellnessCheckin[field];
      if (value === undefined) continue;
      writes.push(set(WELLNESS_FIELD_KEY[field], value === null ? '' : String(value)));
    }
  }
  if (p.autoSkipWellnessCheckin !== undefined) {
    writes.push(set(KEY.PROMPT_AUTO_SKIP_WELLNESS_CHECKIN, p.autoSkipWellnessCheckin ? 'true' : 'false'));
  }
  await Promise.all(writes);
}
