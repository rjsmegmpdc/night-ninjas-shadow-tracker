import 'server-only';
import { eq, isNull, and } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

/**
 * Program-phase derivation.
 *
 * The athlete's relationship to a coached training program goes through
 * distinct stages, each calling for different UX:
 *
 *   pre-program       : program is in the future, ramp surface applies
 *   program-week-N    : in the middle of the block, week-by-week matrix
 *   taper             : final 1-3 weeks before race (engine-defined)
 *   race-week         : 7 days or fewer to race
 *   post-race         : within 4 weeks after the race (recovery)
 *   no-program        : no plan_periods row at all
 *
 * This module produces a single `ProgramPhase` describing the current
 * stage plus countdowns to the relevant milestones. The Patrol header
 * and ramp card both consume it.
 */

export type ProgramPhaseKind =
  | 'no-program'
  | 'pre-program'
  | 'program-week-N'
  | 'taper'
  | 'race-week'
  | 'post-race';

export interface ProgramPhase {
  kind: ProgramPhaseKind;
  /** Days from today to race day. Negative = race is past. Null = no race. */
  daysToRace: number | null;
  /** Weeks until program Week 1 begins. 0 if it starts this week. Null = no program. */
  weeksToProgramStart: number | null;
  /** Current program week number (1-indexed). Null if outside program window. */
  programWeekNumber: number | null;
  /** Total program length in weeks. */
  programWeeks: number | null;
  /** Days elapsed since race day. Null if race not past. */
  daysSinceRace: number | null;
  /** Display label for the phase, e.g. "Pre-program base" or "Week 7 of 18". */
  label: string;
  /** Compact status string for header subline, e.g. "Pre-program base - 8 weeks until Hansons begins". */
  subline: string;
}

const TAPER_WEEKS = 3;        // generic taper window; engines may override later
const POST_RACE_WEEKS = 4;    // recovery window after race day

/**
 * Resolve the current program phase from the active plan_periods row.
 *
 * Reads:
 * - plan_periods row with end_date IS NULL (the active period)
 * - races row marked is_goal = 1 for the race date
 *
 * Computes phase, countdowns, and a display label/subline.
 */
export async function getProgramPhase(now: Date = new Date()): Promise<ProgramPhase> {
  const db = (await getDb());

  // Active plan period
  let period;
  try {
    period = await db
      .select()
      .from(schema.planPeriods)
      .where(isNull(schema.planPeriods.endDate))
      .get();
  } catch {
    period = undefined;
  }

  // Goal race for race date (also used as the program end anchor)
  const goalRace = await db
    .select()
    .from(schema.races)
    .where(eq(schema.races.isGoal, true))
    .get();

  const today = startOfDayUtc(now);
  const dayMs = 86_400_000;

  // No active period at all
  if (!period) {
    if (!goalRace) {
      return {
        kind: 'no-program',
        daysToRace: null,
        weeksToProgramStart: null,
        programWeekNumber: null,
        programWeeks: null,
        daysSinceRace: null,
        label: 'No program',
        subline: 'No coached plan or goal race configured. Set up via the wizard.',
      };
    }
    const daysToRaceLocal = daysBetween(today, goalRace.raceDate);
    return {
      kind: 'no-program',
      daysToRace: daysToRaceLocal,
      weeksToProgramStart: null,
      programWeekNumber: null,
      programWeeks: null,
      daysSinceRace: daysToRaceLocal < 0 ? -daysToRaceLocal : null,
      label: 'No program',
      subline: `No coached plan configured. ${daysToRaceLocal > 0 ? daysToRaceLocal + ' days to race.' : 'Race date passed.'}`,
    };
  }

  const startDate = new Date(period.startDate + 'T00:00:00');
  const programWeeks = period.programWeeks;
  const programEndDate = new Date(startDate.getTime() + programWeeks * 7 * dayMs);
  const raceDateStr = goalRace?.raceDate ?? null;
  const daysToRace = raceDateStr ? daysBetween(today, raceDateStr) : null;

  // Pre-program: today is before program start
  if (today < startDate) {
    const daysToStart = Math.ceil((startDate.getTime() - today.getTime()) / dayMs);
    const weeksToProgramStart = Math.ceil(daysToStart / 7);
    return {
      kind: 'pre-program',
      daysToRace,
      weeksToProgramStart,
      programWeekNumber: null,
      programWeeks,
      daysSinceRace: null,
      label: 'Pre-program base',
      subline: `${weeksToProgramStart} week${weeksToProgramStart === 1 ? '' : 's'} until ${dojoDisplayName(period.dojo)} begins` +
        (daysToRace !== null && daysToRace > 0 ? ` - ${daysToRace} days to race` : ''),
    };
  }

  // Post-race: today is after race date and within recovery window
  if (raceDateStr) {
    const raceDate = new Date(raceDateStr + 'T00:00:00');
    const daysSinceRace = Math.floor((today.getTime() - raceDate.getTime()) / dayMs);
    if (daysSinceRace > 0 && daysSinceRace <= POST_RACE_WEEKS * 7) {
      return {
        kind: 'post-race',
        daysToRace,
        weeksToProgramStart: null,
        programWeekNumber: null,
        programWeeks,
        daysSinceRace,
        label: 'Post-race recovery',
        subline: `Race day was ${daysSinceRace} day${daysSinceRace === 1 ? '' : 's'} ago. Recovery window: ${POST_RACE_WEEKS} weeks.`,
      };
    }
  }

  // Compute current program week
  const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / dayMs);
  const programWeekNumber = Math.floor(daysSinceStart / 7) + 1;

  // Past program end?
  if (programWeekNumber > programWeeks) {
    return {
      kind: 'no-program',
      daysToRace,
      weeksToProgramStart: null,
      programWeekNumber: null,
      programWeeks,
      daysSinceRace: daysToRace !== null && daysToRace < 0 ? -daysToRace : null,
      label: 'Program complete',
      subline: 'Program window ended. Set up a new goal race or rest in maintenance.',
    };
  }

  // Race week (last 7 days before race)
  if (daysToRace !== null && daysToRace >= 0 && daysToRace <= 7) {
    return {
      kind: 'race-week',
      daysToRace,
      weeksToProgramStart: null,
      programWeekNumber,
      programWeeks,
      daysSinceRace: null,
      label: 'Race week',
      subline: daysToRace === 0
        ? 'Race day. Trust the work.'
        : `${daysToRace} day${daysToRace === 1 ? '' : 's'} to race. Sharpen, do not strain.`,
    };
  }

  // Taper (last TAPER_WEEKS weeks of program but more than 7 days out)
  if (programWeekNumber > programWeeks - TAPER_WEEKS) {
    return {
      kind: 'taper',
      daysToRace,
      weeksToProgramStart: null,
      programWeekNumber,
      programWeeks,
      daysSinceRace: null,
      label: `Taper - week ${programWeekNumber} of ${programWeeks}`,
      subline: daysToRace !== null
        ? `Tapering. ${daysToRace} days to race.`
        : `Tapering. Week ${programWeekNumber} of ${programWeeks}.`,
    };
  }

  // Mid-program build
  return {
    kind: 'program-week-N',
    daysToRace,
    weeksToProgramStart: null,
    programWeekNumber,
    programWeeks,
    daysSinceRace: null,
    label: `Week ${programWeekNumber} of ${programWeeks}`,
    subline: daysToRace !== null
      ? `${dojoDisplayName(period.dojo)} - week ${programWeekNumber} of ${programWeeks} - ${daysToRace} days to race`
      : `${dojoDisplayName(period.dojo)} - week ${programWeekNumber} of ${programWeeks}`,
  };
}

function startOfDayUtc(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function daysBetween(a: Date, bIso: string): number {
  const b = new Date(bIso + 'T00:00:00');
  return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
}

function dojoDisplayName(dojo: string): string {
  switch (dojo) {
    case 'hansons': return 'Hansons';
    case 'lydiard': return 'Lydiard';
    case 'daniels': return 'Daniels';
    case 'pfitzinger': return 'Pfitzinger';
    case 'higdon': return 'Higdon';
    case 'polarised': return '80/20';
    case 'ultra': return 'Ultra';
    case 'custom': return 'Custom';
    default: return dojo;
  }
}
