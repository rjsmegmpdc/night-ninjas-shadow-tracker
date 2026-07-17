import 'server-only';

/**
 * Phase 6 part 2 - macrocycle context read layer.
 *
 * Assembles the multi-block / year-over-year context for the goal race from
 * plan-period history + activity history. Pure math lives in
 * macrocycle-pure.ts. Degrades to null when there is no goal race, and to
 * absent year-over-year when last year has no matching week.
 */

import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { currentWeekRange } from '@/lib/plans/active-plan';
import { getActivitiesInRange, aggregateWeekStats } from '@/lib/analysis/week-queries';
import { getPlanPeriodsInRange } from '@/lib/plans/plan-periods';
import {
  blockNumberForYear,
  compareWeeks,
  sameWeekLastYearMonday,
  distanceLabel,
  type WeekCompare,
} from './macrocycle-pure';

export interface MacrocycleContext {
  /** Which number this block is, of this distance, this calendar year. */
  blockNumber: number;
  distanceKm: number;
  distanceLabel: string;
  /** Same training week one year ago vs now; null when no comparison exists. */
  yearOverYear: WeekCompare | null;
}

function weekEndIso(mondayIso: string): string {
  const d = new Date(mondayIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export async function getMacrocycleContext(): Promise<MacrocycleContext | null> {
  const db = (await getDb());
  const goal = await db.select().from(schema.races).where(eq(schema.races.isGoal, true)).get();
  if (!goal) return null;

  const distanceKm = goal.distanceKm;
  const year = Number(goal.raceDate.slice(0, 4));

  // How many blocks of this distance started this calendar year.
  let blockNumber = 0;
  try {
    const periods = await getPlanPeriodsInRange(`${year}-01-01`, `${year}-12-31`);
    blockNumber = blockNumberForYear(
      periods.map((p) => ({ startDate: p.startDate, goalDistanceKm: p.goalDistanceKm })),
      year,
      distanceKm
    );
  } catch {
    blockNumber = 0;
  }

  // Year-over-year for the current training week.
  let yearOverYear: WeekCompare | null = null;
  try {
    const { startIso } = currentWeekRange();
    const lastYearMon = sameWeekLastYearMonday(startIso);
    const [thisWeek, lastWeek] = await Promise.all([
      getActivitiesInRange(startIso, weekEndIso(startIso)),
      getActivitiesInRange(lastYearMon, weekEndIso(lastYearMon)),
    ]);
    if (lastWeek.length > 0) {
      const t = aggregateWeekStats(thisWeek);
      const l = aggregateWeekStats(lastWeek);
      yearOverYear = compareWeeks(
        { totalKm: t.totalKm, avgPaceSpk: t.avgPaceSpk },
        { totalKm: l.totalKm, avgPaceSpk: l.avgPaceSpk }
      );
    }
  } catch {
    yearOverYear = null;
  }

  return { blockNumber, distanceKm, distanceLabel: distanceLabel(distanceKm), yearOverYear };
}
