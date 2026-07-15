import { fromZonedTime } from 'date-fns-tz';

/**
 * Stage 2 (daily loop) - manual activity entry, PURE.
 *
 * Validates and derives the fields needed to insert a manual `activities`
 * row from a form submission. No DB, no I/O - the server action
 * (lib/actions/manual-activity.ts) owns settings/DB access and calls in here.
 *
 * TZ note: `deriveManualActivityTimestamps` takes the timezone as an explicit
 * parameter rather than reading it from settings, so it stays pure and its
 * tests are deterministic regardless of the process's own TZ. It uses
 * date-fns-tz's `fromZonedTime`, which correctly handles NZDT/NZST DST
 * transitions and does not depend on the machine's local timezone (unlike
 * that library's `toZonedTime`, whose raw Date-getter reads DO depend on the
 * machine TZ - avoided here entirely).
 *
 * `startDateLocal` is built by plain string concatenation, never by
 * round-tripping a date-only string through `new Date()` - see
 * lib/dates/iso.ts for why that round-trip shifts the calendar day on any
 * machine east of Greenwich.
 */

export interface ManualActivityInput {
  distanceKm: number;
  durationMin: number;
  /** YYYY-MM-DD, local */
  dateIso: string;
  /** HH:mm, local, 24h */
  timeHm: string;
  avgHr?: number | null;
  rpe?: number | null;
  notes?: string | null;
}

export interface ValidatedManualActivity {
  distanceM: number;
  movingTimeS: number;
  avgSpeedMs: number;
  avgHr: number | null;
  rpe: number | null;
  notes: string | null;
  name: string;
  dateIso: string;
  timeHm: string;
}

export type ManualActivityValidation =
  | { ok: true; value: ValidatedManualActivity }
  | { ok: false; error: string };

const MAX_DISTANCE_KM = 300; // sanity cap (ultras exist; this just catches fat-fingers)
const MAX_DURATION_MIN = 24 * 60;
const MIN_HR = 30;
const MAX_HR = 230;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateManualActivityInput(
  input: ManualActivityInput,
  todayLocalIso: string
): ManualActivityValidation {
  const { distanceKm, durationMin, dateIso, timeHm, avgHr, rpe, notes } = input;

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return { ok: false, error: 'Distance must be a positive number.' };
  }
  if (distanceKm > MAX_DISTANCE_KM) {
    return { ok: false, error: `Distance looks implausible (over ${MAX_DISTANCE_KM}km).` };
  }
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    return { ok: false, error: 'Duration must be a positive number of minutes.' };
  }
  if (durationMin > MAX_DURATION_MIN) {
    return { ok: false, error: 'Duration looks implausible (over 24 hours).' };
  }
  if (!DATE_RE.test(dateIso)) {
    return { ok: false, error: 'Date must be YYYY-MM-DD.' };
  }
  if (dateIso > todayLocalIso) {
    return { ok: false, error: 'Date cannot be in the future.' };
  }
  if (!TIME_RE.test(timeHm)) {
    return { ok: false, error: 'Time must be HH:mm (24h).' };
  }
  if (avgHr != null) {
    if (!Number.isFinite(avgHr) || avgHr < MIN_HR || avgHr > MAX_HR) {
      return { ok: false, error: `Avg HR must be between ${MIN_HR} and ${MAX_HR}.` };
    }
  }
  if (rpe != null) {
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
      return { ok: false, error: 'RPE must be a whole number from 1 to 10.' };
    }
  }

  const distanceM = distanceKm * 1000;
  const movingTimeS = Math.round(durationMin * 60);
  const avgSpeedMs = distanceM / movingTimeS;
  const trimmedNotes = notes?.trim() || null;
  const name = trimmedNotes || 'Manual entry';

  return {
    ok: true,
    value: {
      distanceM,
      movingTimeS,
      avgSpeedMs,
      avgHr: avgHr ?? null,
      rpe: rpe ?? null,
      notes: trimmedNotes,
      name,
      dateIso,
      timeHm,
    },
  };
}

export interface ManualActivityTimestamps {
  /** ISO 8601, no offset - matches activities.start_date_local's shape. */
  startDateLocal: string;
  /** ISO 8601, always UTC - matches activities.start_date_utc's shape. */
  startDateUtc: string;
}

export function deriveManualActivityTimestamps(
  dateIso: string,
  timeHm: string,
  timezone: string
): ManualActivityTimestamps {
  const startDateLocal = `${dateIso}T${timeHm}:00`;
  const startDateUtc = fromZonedTime(startDateLocal, timezone).toISOString();
  return { startDateLocal, startDateUtc };
}
