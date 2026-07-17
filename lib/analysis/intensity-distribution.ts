/**
 * Intensity distribution — the 80/20 (Seiler polarised training) check.
 *
 * Computes what fraction of running time was spent at easy intensity vs
 * threshold/V̇O2/repetition. The polarised model says elite endurance
 * athletes spend ~80% of training time at easy intensity, 20% at hard
 * (threshold or above), with very little time in the moderate "grey zone"
 * between.
 *
 * Critically: this is a **running-only** metric. Strength, mobility,
 * cycling cross-training etc. do NOT enter the denominator. The 80/20
 * rule is specifically about the intensity distribution of running.
 *
 * Single number returned per week:
 *   - easyPct: % of running time at easy intensity
 *   - hardPct: % at threshold or above
 *   - greyPct: % at marathon zone (between easy and threshold)
 *
 * easyPct + hardPct + greyPct = 100. The grey zone is named separately
 * because it's where most amateur athletes accidentally live — too hard
 * to be recovery, too easy to drive adaptation.
 */

import 'server-only';
import { gte, lte, and } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { computeActivityLoad, type AthleteCalibration } from './load';
import { classifySport, isRunning } from './sport-classifier';

export interface IntensityDistribution {
  /** Total running minutes evaluated. 0 if no runs in the window. */
  totalRunMin: number;
  /** Percent of running time at easy intensity (0-100). */
  easyPct: number;
  /** Percent at marathon zone — the "grey zone". */
  greyPct: number;
  /** Percent at threshold or above. */
  hardPct: number;
  /**
   * True when easyPct >= 80 (Seiler's polarised target). False otherwise
   * — the runner is spending too much time in moderate zones.
   */
  isPolarised: boolean;
}

/**
 * Compute the intensity distribution for a given date range. Typically
 * called per-week (Mon-Sun) but accepts any range.
 *
 * Returns null when no running activities fall in the range.
 */
export async function getIntensityDistribution(
  fromIso: string,
  toIso: string,
  calibration: AthleteCalibration = {}
): Promise<IntensityDistribution | null> {
  const db = (await getDb());
  const activities = await db
    .select()
    .from(schema.activities)
    .where(
      and(
        gte(schema.activities.startDateLocal, fromIso),
        lte(schema.activities.startDateLocal, toIso + 'T23:59:59')
      )
    )
    .all();

  let easyMin = 0;
  let greyMin = 0;
  let hardMin = 0;

  for (const a of activities) {
    const cat = classifySport(a.sportType ?? a.type, a.name);
    if (!isRunning(cat)) continue;
    if (!a.movingTimeS || a.movingTimeS <= 0) continue;

    const load = computeActivityLoad(a, calibration);
    if (!load) continue;

    const minutes = a.movingTimeS / 60;
    switch (load.zone) {
      case 'easy':
        easyMin += minutes;
        break;
      case 'marathon':
        greyMin += minutes;
        break;
      case 'threshold':
      case 'interval':
      case 'repetition':
        hardMin += minutes;
        break;
    }
  }

  const total = easyMin + greyMin + hardMin;
  if (total === 0) return null;

  const easyPct = Math.round((easyMin / total) * 100);
  const hardPct = Math.round((hardMin / total) * 100);
  // Compute greyPct as remainder so the three add to exactly 100
  // (avoids rounding artefacts where they sum to 99 or 101)
  const greyPct = 100 - easyPct - hardPct;

  return {
    totalRunMin: Math.round(total),
    easyPct,
    greyPct,
    hardPct,
    isPolarised: easyPct >= 80,
  };
}
