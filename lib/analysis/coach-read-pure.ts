import type { ComplianceFlag } from './compliance';
import type { FormClass } from './athlete-state-pure';

/**
 * Stage 4 (daily loop) - "coach read" of the most recent run, PURE.
 *
 * Deterministic Sensei-voice read of a single activity: what it was, how it
 * measured against the prescribed session (if any), and how that sits inside
 * the athlete's current form. No DB, no I/O, no invented numbers — every
 * figure in the output traces to an input field. This is the "deterministic
 * now" half of PRD 8.5's Coach read; the Haiku narrative layer is future
 * work and will replace/augment this fn's callers, not its contract.
 *
 * Voice rules (PRD §8): encouraging about the athlete, candid about the
 * work, no hollow praise, never demeaning. `describeCompliance` below is the
 * single place that turns a ComplianceFlag into wording — keep any tone
 * adjustments there so the rest of the fn stays about assembling facts.
 *
 * G-005 (UI redesign): `tone` and `evidence` back the verdict-first hero
 * card's colour cue and "Why:" chip row. Both are derived ONLY from fields
 * already on CoachReadInput - no new inputs, no invented numbers. A chip is
 * only emitted when every value it needs is present; partial/missing data
 * just means fewer chips, never a guessed one.
 */

export interface CoachReadActivityInput {
  type: string;
  distanceKm: number | null;
  /** Moving time, minutes. */
  movingTimeMin: number | null;
  /** Local start date, YYYY-MM-DD (already stripped of time). */
  dateIso: string;
  /** Whether this activity was self-reported (P0-7 manual entry) rather than device-recorded. */
  isSelfReported: boolean;
}

export interface CoachReadComplianceInput {
  flag: ComplianceFlag;
  message: string;
  /** Label of the prescribed session this activity was assessed against, if any. */
  sessionLabel: string | null;
  /** Actual distance covered against this session, km — from the matched activity. */
  actualKm?: number;
  /** Actual pace, seconds per km — from the matched activity. */
  actualPaceSpk?: number;
  /** Prescribed distance band, km. */
  targetDistanceKmMin?: number;
  targetDistanceKmMax?: number;
  /** Prescribed pace band, seconds per km. Min = faster/smaller end (matches SessionTarget.paceZone). */
  targetPaceSpkMin?: number;
  targetPaceSpkMax?: number;
}

export interface CoachReadAthleteStateInput {
  ctl: number;
  atl: number;
  tsb: number;
  formClass: FormClass;
}

export interface CoachReadInput {
  activity: CoachReadActivityInput;
  compliance: CoachReadComplianceInput | null;
  athleteState: CoachReadAthleteStateInput | null;
}

/** Colour cue for the verdict-first hero card. 'accent' is the neutral brand tone - used when there's nothing to praise or warn about (miss, no matching session, or no compliance context at all). */
export type CoachReadTone = 'ok' | 'warn' | 'accent';

export interface CoachRead {
  /** One-line summary — leads with the fact, not an adjective. */
  headline: string;
  /** One or two sentences of candid detail. */
  detail: string;
  /** A forward-looking pointer to tomorrow/next session — never invents a prescription. */
  pointer: string;
  /** Colour cue derived from the compliance flag. */
  tone: CoachReadTone;
  /** Short mono "Why:" chip strings, each built from present inputs only. At most MAX_EVIDENCE_CHIPS. */
  evidence: string[];
}

const FORM_CLASS_LABEL: Record<FormClass, string> = {
  fresh: 'fresh',
  'on-form': 'on form',
  maintained: 'holding steady',
  loaded: 'carrying load',
  overreached: 'deep in the hole',
};

function km(n: number | null): string {
  return n == null ? '' : `${n.toFixed(1)}km`;
}

const MAX_EVIDENCE_CHIPS = 4;

function deriveTone(compliance: CoachReadComplianceInput | null): CoachReadTone {
  if (!compliance) return 'accent';
  switch (compliance.flag) {
    case 'ok':
      return 'ok';
    case 'warn':
    case 'fast':
    case 'slow':
    case 'short':
      return 'warn';
    case 'miss':
    case 'none':
    default:
      return 'accent';
  }
}

/** mm:ss, rounded to the nearest second - no unit suffix (used for band bounds, where the /km reads once for the whole chip). */
function paceMinSec(spk: number): string {
  const totalSec = Math.round(spk);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/** mm:ss/km, rounded to the nearest second. */
function paceLabel(spk: number): string {
  return `${paceMinSec(spk)}/km`;
}

/** Whole numbers print bare ("9"), fractional ones get one decimal ("9.5") - matches how these targets are usually authored. */
function formatKmBound(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function buildEvidence(input: CoachReadInput): string[] {
  const { activity, compliance, athleteState } = input;
  const chips: string[] = [];

  if (
    compliance?.actualKm != null &&
    compliance.targetDistanceKmMin != null &&
    compliance.targetDistanceKmMax != null
  ) {
    chips.push(
      `${compliance.actualKm.toFixed(1)} km vs ${formatKmBound(compliance.targetDistanceKmMin)}–${formatKmBound(compliance.targetDistanceKmMax)} target`
    );
  }

  if (
    compliance?.actualPaceSpk != null &&
    compliance.targetPaceSpkMin != null &&
    compliance.targetPaceSpkMax != null
  ) {
    chips.push(
      `pace ${paceLabel(compliance.actualPaceSpk)} vs ${paceMinSec(compliance.targetPaceSpkMin)}–${paceMinSec(compliance.targetPaceSpkMax)} band`
    );
  }

  if (athleteState) {
    const sign = athleteState.tsb >= 0 ? '+' : '';
    chips.push(`TSB ${sign}${athleteState.tsb} · ${FORM_CLASS_LABEL[athleteState.formClass]}`);
  }

  if (activity.isSelfReported) {
    chips.push('self-reported');
  }

  return chips.slice(0, MAX_EVIDENCE_CHIPS);
}

function describeCompliance(c: CoachReadComplianceInput): string {
  switch (c.flag) {
    case 'ok':
      return c.sessionLabel ? `On target for ${c.sessionLabel}.` : 'On target.';
    case 'warn':
      return `Close to the mark, but worth a look: ${c.message}`;
    case 'fast':
      return `Ran faster than the prescribed band. ${c.message}`;
    case 'slow':
      return `Ran slower than the prescribed band. ${c.message}`;
    case 'short':
      return `Came up short of the target. ${c.message}`;
    case 'miss':
      return `Missed the mark. ${c.message}`;
    case 'none':
      return 'No session was prescribed for this slot — logged as extra.';
    default:
      return c.message;
  }
}

/**
 * Build a structured coach read for the most recent activity. Returns a
 * plain "logged, nothing to assess against" read when no compliance context
 * exists (e.g. an unplanned or off-program run), and omits form commentary
 * when athlete state isn't available yet (early days, no load history).
 */
export function buildCoachRead(input: CoachReadInput): CoachRead {
  const { activity, compliance, athleteState } = input;

  const distance = km(activity.distanceKm);
  const provenance = activity.isSelfReported ? ' (self-reported)' : '';
  const headline = distance
    ? `${distance} ${activity.type.toLowerCase()}${provenance} on ${activity.dateIso}.`
    : `${activity.type} logged on ${activity.dateIso}${provenance}.`;

  const detailParts: string[] = [];
  if (compliance) {
    detailParts.push(describeCompliance(compliance));
  } else {
    detailParts.push('Nothing prescribed to measure this against.');
  }

  let pointer: string;
  if (athleteState) {
    const formLabel = FORM_CLASS_LABEL[athleteState.formClass];
    detailParts.push(
      `Form is ${formLabel} (TSB ${athleteState.tsb >= 0 ? '+' : ''}${athleteState.tsb}).`
    );
    if (athleteState.formClass === 'overreached') {
      pointer = 'Fatigue is stacking up — the next session should back off, not push through.';
    } else if (athleteState.formClass === 'loaded') {
      pointer = 'Load is building. Keep the next easy day genuinely easy.';
    } else if (athleteState.formClass === 'fresh') {
      pointer = "There's freshness in the tank — a good window to hit the next quality session hard.";
    } else {
      pointer = 'Form is steady — carry the same effort into the next session.';
    }
  } else {
    pointer = 'Not enough recent history yet to read form — keep logging and this will sharpen up.';
  }

  return {
    headline,
    detail: detailParts.join(' '),
    pointer,
    tone: deriveTone(compliance),
    evidence: buildEvidence(input),
  };
}
