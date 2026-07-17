import 'server-only';
import { and, eq, lte, gte, or } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import type {
  WeekContext,
  WeekEvent,
  RecurringSessionBinding,
  Dow,
} from '@/lib/plans/types';

/**
 * Calendar context resolver.
 *
 * Given a week (Monday → Sunday in the user's local time) and the goal
 * race info, query all the calendar tables and build a WeekContext that
 * the plan engine can use to adapt its raw template.
 *
 * One query per concern. Indexed columns (start_date, dow, race_date)
 * keep this cheap.
 */
export async function resolveWeekContext(opts: {
  weekStartIso: string;
  weekEndIso: string;
}): Promise<WeekContext> {
  const db = (await getDb());
  const { weekStartIso, weekEndIso } = opts;

  // Goal race — single row
  const goalRaceRow = await db
    .select()
    .from(schema.races)
    .where(eq(schema.races.isGoal, true))
    .get();
  const goalRace = goalRaceRow && goalRaceRow.targetTimeS
    ? {
        date: goalRaceRow.raceDate,
        distanceKm: goalRaceRow.distanceKm,
        targetTimeS: goalRaceRow.targetTimeS,
      }
    : null;

  // Tune-up races overlapping this week (any non-goal race in week range)
  const tuneupRows = await db
    .select()
    .from(schema.races)
    .where(
      and(
        eq(schema.races.isGoal, false),
        gte(schema.races.raceDate, weekStartIso),
        lte(schema.races.raceDate, weekEndIso)
      )
    )
    .all();
  const tuneupRaces = tuneupRows.map((r) => ({
    date: r.raceDate,
    distanceKm: r.distanceKm,
    name: r.name ?? 'tune-up',
  }));

  // Recurring sessions — all of them (no date filter, they're weekly)
  const recurringRows = await db
    .select()
    .from(schema.recurringSessions)
    .where(eq(schema.recurringSessions.isActive, true))
    .all();
  const recurringSessions: RecurringSessionBinding[] = recurringRows
    .filter((r) => r.dow >= 0 && r.dow <= 6) // exclude is_ninja_loop=true rows that use dow=-1
    .map((r) => ({
      dow: r.dow as Dow,
      intent: mapSessionTypeToIntent(r.sessionType),
      label: r.name,
      distanceKm:
        r.typicalDistanceKmMin && r.typicalDistanceKmMax
          ? Math.round(((r.typicalDistanceKmMin + r.typicalDistanceKmMax) / 2) * 10) / 10
          : undefined,
    }));

  // Calendar events overlapping this week
  // An event overlaps if start <= weekEnd AND (end is null or end >= weekStart)
  const eventRows = await db
    .select()
    .from(schema.calendarEvents)
    .where(
      and(
        lte(schema.calendarEvents.startDate, weekEndIso),
        or(
          gte(schema.calendarEvents.endDate, weekStartIso),
          eq(schema.calendarEvents.startDate, weekStartIso) // single-day event with null endDate
        )
      )
    )
    .all();

  const events: WeekEvent[] = eventRows
    .filter((e) => e.eventType !== 'ninja_loop_holiday') // these go to ninjaLoopDays separately
    .map((e) => ({
      startDate: e.startDate,
      endDate: e.endDate ?? e.startDate,
      type: mapEventType(e.eventType),
      impact: mapImpact(e.impact),
      notes: e.notes ?? undefined,
    }));

  // Ninja Loop days — events of type 'ninja_loop_holiday' falling in this week
  const ninjaLoopDays: Dow[] = [];
  const ninjaLoopRows = eventRows.filter((e) => e.eventType === 'ninja_loop_holiday');
  for (const row of ninjaLoopRows) {
    const date = new Date(row.startDate);
    const weekStartDate = new Date(weekStartIso);
    const daysFromMonday = Math.floor((date.getTime() - weekStartDate.getTime()) / 86400000);
    if (daysFromMonday >= 0 && daysFromMonday <= 6) {
      ninjaLoopDays.push(daysFromMonday as Dow);
    }
  }

  return {
    weekStartIso,
    weekEndIso,
    goalRace,
    tuneupRaces,
    recurringSessions,
    events,
    ninjaLoopDays,
  };
}

/* ---------- Mappers ---------- */

function mapSessionTypeToIntent(
  sessionType: string
): 'easy' | 'long' | 'tempo' | 'interval' | 'group-easy' {
  switch (sessionType) {
    case 'tempo':
      return 'tempo';
    case 'interval':
    case 'repetition':
      return 'interval';
    case 'long':
      return 'long';
    case 'easy':
    case 'recovery':
    default:
      return 'group-easy';
  }
}

function mapEventType(t: string): WeekEvent['type'] {
  switch (t) {
    case 'sickness':
      return 'sickness';
    case 'holiday':
      return 'holiday';
    case 'work_trip':
      return 'work-trip';
    default:
      return 'other';
  }
}

function mapImpact(i: string): WeekEvent['impact'] {
  switch (i) {
    case 'no_training':
      return 'no-training';
    case 'reduced':
      return 'reduced';
    case 'travel_only':
      return 'travel-only';
    case 'group_run':
    case 'none':
    default:
      return 'normal';
  }
}
