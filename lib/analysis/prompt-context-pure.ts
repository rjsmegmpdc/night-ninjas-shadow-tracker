import type { UnloggedSession } from './unlogged-sessions-pure';

/**
 * Stage 3 (daily loop) - prompt-queue context completeness, PURE.
 *
 * Assembles the ordered stack of "what's the coach missing today" prompts
 * described in PRD 8.5: wellness check-in, unlogged prescribed sessions
 * (P0-7), integration errors — in that priority order. No DB, no I/O; the
 * server wrapper (a later stage's concern) reads journal/unlogged-sessions/
 * sync-log/settings and calls in here.
 *
 * Determinism: `todayLocalIso` is passed in rather than read from Date.now()
 * so the same inputs always produce the same queue. Prompt ids are stable
 * per (date, subject) so `recordPromptSkip` can key off them and this
 * function can filter out anything already skipped today.
 *
 * "Skippable" is true for every prompt kind today — the PRD's design rule is
 * that ALL missing-data prompts follow the same ask-once-or-default pattern.
 * The field still exists (rather than being hardcoded true at the call site)
 * because a future prompt kind (e.g. a hard integration failure requiring
 * reconnection) may need to be non-skippable.
 */

export type PromptKind = 'wellness-checkin' | 'unlogged-session' | 'integration-error' | 'manual-overlap';

export type WellnessField = 'sleepQuality' | 'sleepHours' | 'energy';

/** The subset of today's journal row the completeness check reads. */
export interface JournalCompletenessInput {
  sleepQuality: number | null;
  sleepHours: number | null;
  energy: number | null;
}

export interface IntegrationErrorInput {
  adapterId: 'strava' | 'garmin' | 'coros' | 'polar';
  /** Human-readable error detail (e.g. "Rate limited, resumes 14:32"). */
  message: string;
}

/**
 * A manual activity row superseded by an overlapping synced activity
 * (D-004: synced wins by default - see lib/analysis/activity-dedup-pure.ts).
 * The supersede itself already happened at sync time; this prompt just tells
 * the athlete and offers a restore path.
 */
export interface ManualOverlapInput {
  manualActivityId: number;
  /** YYYY-MM-DD, local - the date of the (now-superseded) manual entry. */
  dateIso: string;
  /** sourceId of the synced activity that superseded it. */
  syncedSourceId: string;
}

/** Default values applied to a wellness-checkin field when the athlete skips it. */
export type WellnessCheckinDefaults = Partial<Record<WellnessField, number>>;

export interface PromptDefaults {
  wellnessCheckin: WellnessCheckinDefaults;
  /**
   * When true, the wellness-checkin prompt never surfaces even if fields are
   * missing — the athlete has opted to always silently accept the default.
   */
  autoSkipWellnessCheckin?: boolean;
}

export interface PromptContextInput {
  /** YYYY-MM-DD, local. */
  todayLocalIso: string;
  /** Today's journal row, or null if none exists yet. */
  journal: JournalCompletenessInput | null;
  /** Prescribed sessions with no matching activity (from findUnloggedSessions). */
  unloggedSessions: UnloggedSession[];
  /** Current sync/integration error state, one entry per adapter with a problem. */
  integrationErrors: IntegrationErrorInput[];
  /**
   * Manual activity rows superseded by a synced overlap, not yet dismissed.
   * Optional for backward compatibility - omit or pass [] when there are
   * none (existing callers/tests that predate Stage 6 don't need to change).
   */
  supersededOverlaps?: ManualOverlapInput[];
  /** The athlete's configured prompt defaults. */
  defaults: PromptDefaults;
  /** Prompt ids already skipped today (from recordPromptSkip) — excluded from output. */
  skippedPromptIds: string[];
}

interface BasePromptItem {
  id: string;
  priority: number;
  skippable: boolean;
}

export interface WellnessCheckinPromptItem extends BasePromptItem {
  kind: 'wellness-checkin';
  /** Which fields on today's journal row are still empty. */
  missingFields: WellnessField[];
  /** Values to write for the missing fields if the athlete skips. Null = no configured default. */
  defaultOnSkip: WellnessCheckinDefaults | null;
}

export interface UnloggedSessionPromptItem extends BasePromptItem {
  kind: 'unlogged-session';
  session: UnloggedSession;
  /** No engine-applied default exists for a skipped manual-result prompt — compliance already reads it as 'none'. */
  defaultOnSkip: null;
}

export interface IntegrationErrorPromptItem extends BasePromptItem {
  kind: 'integration-error';
  adapterId: IntegrationErrorInput['adapterId'];
  message: string;
  /** No default to apply — skipping just dismisses today's notice. */
  defaultOnSkip: null;
}

export interface ManualOverlapPromptItem extends BasePromptItem {
  kind: 'manual-overlap';
  manualActivityId: number;
  dateIso: string;
  syncedSourceId: string;
  /** D-004: the supersede already happened - skipping just confirms/keeps the synced version. */
  defaultOnSkip: 'keep-synced';
}

export type PromptItem =
  | WellnessCheckinPromptItem
  | UnloggedSessionPromptItem
  | ManualOverlapPromptItem
  | IntegrationErrorPromptItem;

const WELLNESS_PRIORITY = 0;
const UNLOGGED_SESSION_PRIORITY_BASE = 10;
const MANUAL_OVERLAP_PRIORITY_BASE = 50;
const INTEGRATION_ERROR_PRIORITY_BASE = 100;

function missingWellnessFields(journal: JournalCompletenessInput | null): WellnessField[] {
  const missing: WellnessField[] = [];
  if (journal?.sleepQuality == null) missing.push('sleepQuality');
  if (journal?.sleepHours == null) missing.push('sleepHours');
  if (journal?.energy == null) missing.push('energy');
  return missing;
}

function wellnessDefaultOnSkip(
  missing: WellnessField[],
  configured: WellnessCheckinDefaults
): WellnessCheckinDefaults | null {
  const applied: WellnessCheckinDefaults = {};
  for (const field of missing) {
    const value = configured[field];
    if (value != null) applied[field] = value;
  }
  return Object.keys(applied).length > 0 ? applied : null;
}

export function wellnessCheckinPromptId(todayLocalIso: string): string {
  return `wellness-checkin:${todayLocalIso}`;
}

export function unloggedSessionPromptId(dateIso: string): string {
  return `unlogged-session:${dateIso}`;
}

export function integrationErrorPromptId(adapterId: IntegrationErrorInput['adapterId']): string {
  return `integration-error:${adapterId}`;
}

export function manualOverlapPromptId(activityId: number): string {
  return `manual-overlap:${activityId}`;
}

/**
 * Build the ordered, deduplicated prompt queue for a single day. Prompt ids
 * present in `skippedPromptIds` are dropped entirely — a skipped prompt does
 * not reappear the same day.
 */
export function buildPromptQueue(input: PromptContextInput): PromptItem[] {
  const skipped = new Set(input.skippedPromptIds);
  const items: PromptItem[] = [];

  // 1. Wellness check-in — one prompt, listing whichever fields are empty.
  if (!input.defaults.autoSkipWellnessCheckin) {
    const missingFields = missingWellnessFields(input.journal);
    if (missingFields.length > 0) {
      const id = wellnessCheckinPromptId(input.todayLocalIso);
      if (!skipped.has(id)) {
        items.push({
          id,
          kind: 'wellness-checkin',
          priority: WELLNESS_PRIORITY,
          skippable: true,
          missingFields,
          defaultOnSkip: wellnessDefaultOnSkip(missingFields, input.defaults.wellnessCheckin),
        });
      }
    }
  }

  // 2. Unlogged prescribed sessions — oldest first (most overdue is most urgent).
  const orderedSessions = [...input.unloggedSessions].sort((a, b) =>
    a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0
  );
  orderedSessions.forEach((session, index) => {
    const id = unloggedSessionPromptId(session.dateIso);
    if (skipped.has(id)) return;
    items.push({
      id,
      kind: 'unlogged-session',
      priority: UNLOGGED_SESSION_PRIORITY_BASE + index,
      skippable: true,
      session,
      defaultOnSkip: null,
    });
  });

  // 3. Manual/synced overlaps — the supersede already happened at sync time
  // (D-004); this just tells the athlete and offers a restore path.
  const overlaps = input.supersededOverlaps ?? [];
  overlaps.forEach((overlap, index) => {
    const id = manualOverlapPromptId(overlap.manualActivityId);
    if (skipped.has(id)) return;
    items.push({
      id,
      kind: 'manual-overlap',
      priority: MANUAL_OVERLAP_PRIORITY_BASE + index,
      skippable: true,
      manualActivityId: overlap.manualActivityId,
      dateIso: overlap.dateIso,
      syncedSourceId: overlap.syncedSourceId,
      defaultOnSkip: 'keep-synced',
    });
  });

  // 4. Integration errors — in the order supplied.
  input.integrationErrors.forEach((err, index) => {
    const id = integrationErrorPromptId(err.adapterId);
    if (skipped.has(id)) return;
    items.push({
      id,
      kind: 'integration-error',
      priority: INTEGRATION_ERROR_PRIORITY_BASE + index,
      skippable: true,
      adapterId: err.adapterId,
      message: err.message,
      defaultOnSkip: null,
    });
  });

  return items;
}
