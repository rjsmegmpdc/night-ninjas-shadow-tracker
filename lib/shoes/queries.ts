import 'server-only';
import { eq, and, or, sql, desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import type { Shoe } from '@/lib/db/schema';

/**
 * Shoe queries — aggregate stats per shoe for the /shoes page.
 *
 * Strava is the source of truth for total km — we use shoes.strava_distance_km
 * as the canonical "lifetime km" rather than re-summing activities. Strava
 * counts manual edits the user makes there too. For manual-entry shoes
 * we sum from the activity_shoe_assignments table.
 */

export interface ShoeWithStats extends Shoe {
  totalKm: number;
  sessionCount: number;
  lastUsedDate: string | null;
  /** First activity date — labelled "First run" in the UI. */
  firstUsedDate: string | null;
  /** Effective recommended km (user override if set, else CSV recommendation). */
  effectiveTargetKm: number;
  /** % of life used. 0 if no target. */
  pctUsed: number;
  /** Whether the 80% nudge should fire (active + over 80% + not dismissed). */
  shouldNudge: boolean;
  /**
   * Projected ISO date (YYYY-MM-DD) when the shoe will hit its recommended
   * km, based on recent km/week pace. Null if insufficient data, or 'overdue'
   * if already past 100%.
   */
  projectedExpiry: string | 'overdue' | null;
  /** km/week averaged across recent activities — input to projectedExpiry. */
  recentKmPerWeek: number | null;
  bestRaces: { distanceKm: number; activityName: string; date: string; timeS: number }[];
}

const DEFAULT_TARGET_KM = 800;
const NUDGE_THRESHOLD_PCT = 80;
const RACE_DISTANCES_KM = [5, 10, 21.0975, 42.195];

export async function getAllShoesWithStats(): Promise<ShoeWithStats[]> {
  const db = (await getDb());
  const all = await db
    .select()
    .from(schema.shoes)
    .orderBy(desc(schema.shoes.status), desc(schema.shoes.isFavourite))
    .all();

  const enriched = await Promise.all(all.map(enrichShoe));
  return enriched;
}

export async function getShoeWithStats(id: number): Promise<ShoeWithStats | null> {
  const db = (await getDb());
  const shoe = await db.select().from(schema.shoes).where(eq(schema.shoes.id, id)).get();
  if (!shoe) return null;
  return enrichShoe(shoe);
}

async function enrichShoe(shoe: Shoe): Promise<ShoeWithStats> {
  const db = (await getDb());

  // Collect activity rows once — we need date+distance for first/last/recent
  // pace in addition to count.
  let activityRows: { distanceM: number | null; startDateLocal: string }[] = [];
  let totalKm: number;

  if (shoe.manualEntry) {
    activityRows = await db
      .select({
        distanceM: schema.activities.distanceM,
        startDateLocal: schema.activities.startDateLocal,
      })
      .from(schema.activityShoeAssignments)
      .innerJoin(
        schema.activities,
        eq(schema.activityShoeAssignments.activityId, schema.activities.id)
      )
      .where(eq(schema.activityShoeAssignments.shoeId, shoe.id))
      .all();
    // For manual shoes, sum from activities (Strava doesn't track them)
    totalKm = activityRows.reduce((sum, r) => sum + (r.distanceM ?? 0) / 1000, 0);
  } else if (shoe.stravaGearId) {
    activityRows = await db
      .select({
        distanceM: schema.activities.distanceM,
        startDateLocal: schema.activities.startDateLocal,
      })
      .from(schema.activities)
      .where(eq(schema.activities.gearId, shoe.stravaGearId))
      .all();
    // Strava-tracked: trust Strava's distance figure (it includes manual edits)
    totalKm = shoe.stravaDistanceKm ?? 0;
  } else {
    // Edge case — non-manual shoe with no Strava gear ID
    totalKm = 0;
  }

  const sessionCount = activityRows.length;
  const sortedDates = activityRows.map((r) => r.startDateLocal.slice(0, 10)).sort();
  const firstUsedDate = sortedDates[0] ?? null;
  const lastUsedDate = sortedDates[sortedDates.length - 1] ?? null;

  const effectiveTargetKm = shoe.userTargetKm ?? shoe.recommendedKm ?? DEFAULT_TARGET_KM;
  const pctUsed = effectiveTargetKm > 0 ? (totalKm / effectiveTargetKm) * 100 : 0;

  const shouldNudge =
    shoe.status === 'active' &&
    pctUsed >= NUDGE_THRESHOLD_PCT &&
    shoe.nudgeDismissedAt == null;

  // Recent km/week — last 8 weeks of activities tagged to this shoe
  const recentKmPerWeek = computeRecentKmPerWeek(activityRows);
  const projectedExpiry = projectExpiryDate({
    pctUsed,
    remainingKm: Math.max(0, effectiveTargetKm - totalKm),
    recentKmPerWeek,
    isActive: shoe.status === 'active',
  });

  const bestRaces = await getBestRacesForShoe(shoe);

  return {
    ...shoe,
    totalKm,
    sessionCount,
    lastUsedDate,
    firstUsedDate,
    effectiveTargetKm,
    pctUsed,
    shouldNudge,
    projectedExpiry,
    recentKmPerWeek,
    bestRaces,
  };
}

/**
 * Average km/week across activities in the last 8 weeks. Returns null if
 * fewer than 2 activities in that window — too little data to project from.
 */
function computeRecentKmPerWeek(
  rows: { distanceM: number | null; startDateLocal: string }[]
): number | null {
  if (rows.length < 2) return null;

  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  const cutoff = eightWeeksAgo.toISOString().slice(0, 10);

  const recent = rows.filter((r) => r.startDateLocal.slice(0, 10) >= cutoff);
  if (recent.length < 2) return null;

  const totalKm = recent.reduce((sum, r) => sum + (r.distanceM ?? 0) / 1000, 0);
  return totalKm / 8;
}

/**
 * Project the date this shoe will hit recommended km. Linear extrapolation
 * from recent km/week pace.
 *
 * Rules:
 *   - Already over 100%: 'overdue'
 *   - No recent pace data: null
 *   - Retired: null (no projection makes sense)
 *   - Pace is zero (rotated out of use): null
 */
function projectExpiryDate({
  pctUsed,
  remainingKm,
  recentKmPerWeek,
  isActive,
}: {
  pctUsed: number;
  remainingKm: number;
  recentKmPerWeek: number | null;
  isActive: boolean;
}): string | 'overdue' | null {
  if (!isActive) return null;
  if (pctUsed >= 100) return 'overdue';
  if (recentKmPerWeek === null || recentKmPerWeek <= 0) return null;

  const weeksRemaining = remainingKm / recentKmPerWeek;
  // Cap projection horizon at 5 years — beyond that the prediction is noise
  if (weeksRemaining > 260) return null;

  const projected = new Date();
  projected.setDate(projected.getDate() + Math.round(weeksRemaining * 7));
  return projected.toISOString().slice(0, 10);
}

async function getBestRacesForShoe(shoe: Shoe): Promise<ShoeWithStats['bestRaces']> {
  const db = (await getDb());

  let activities: {
    name: string | null;
    distanceM: number | null;
    movingTimeS: number | null;
    startDateLocal: string;
  }[];

  if (shoe.manualEntry) {
    activities = await db
      .select({
        name: schema.activities.name,
        distanceM: schema.activities.distanceM,
        movingTimeS: schema.activities.movingTimeS,
        startDateLocal: schema.activities.startDateLocal,
      })
      .from(schema.activityShoeAssignments)
      .innerJoin(
        schema.activities,
        eq(schema.activityShoeAssignments.activityId, schema.activities.id)
      )
      .where(eq(schema.activityShoeAssignments.shoeId, shoe.id))
      .all();
  } else if (shoe.stravaGearId) {
    activities = await db
      .select({
        name: schema.activities.name,
        distanceM: schema.activities.distanceM,
        movingTimeS: schema.activities.movingTimeS,
        startDateLocal: schema.activities.startDateLocal,
      })
      .from(schema.activities)
      .where(eq(schema.activities.gearId, shoe.stravaGearId))
      .all();
  } else {
    activities = [];
  }

  const out: ShoeWithStats['bestRaces'] = [];

  for (const distanceKm of RACE_DISTANCES_KM) {
    // Find activities that are within ±200m of this race distance and have a time
    const candidates = activities.filter((a) => {
      if (!a.distanceM || !a.movingTimeS) return false;
      const km = a.distanceM / 1000;
      const tolerance = 0.2; // 200m either way
      return Math.abs(km - distanceKm) <= tolerance;
    });

    if (candidates.length === 0) continue;

    // Pick the fastest
    candidates.sort((a, b) => (a.movingTimeS ?? Infinity) - (b.movingTimeS ?? Infinity));
    const best = candidates[0];

    out.push({
      distanceKm,
      activityName: best.name ?? '',
      date: best.startDateLocal.slice(0, 10),
      timeS: best.movingTimeS!,
    });
  }

  return out;
}

/**
 * Aggregate insights across all shoes — used in the /shoes Insights section.
 */
export async function getShoeInsights(): Promise<{
  lifetimeKm: number;
  activeShoeCount: number;
  retiredShoeCount: number;
  longestServingShoe: { name: string; km: number; days: number } | null;
  highestMileageShoe: { name: string; km: number } | null;
}> {
  const db = (await getDb());
  const all = await db.select().from(schema.shoes).all();

  const lifetimeKm = all.reduce((sum, s) => sum + (s.stravaDistanceKm ?? 0), 0);
  const activeShoeCount = all.filter((s) => s.status === 'active').length;
  const retiredShoeCount = all.filter((s) => s.status === 'retired').length;

  let longestServingShoe: { name: string; km: number; days: number } | null = null;
  for (const s of all) {
    if (!s.purchaseDate) continue;
    const days = Math.floor(
      (Date.now() - new Date(s.purchaseDate).getTime()) / 86400000
    );
    if (!longestServingShoe || days > longestServingShoe.days) {
      longestServingShoe = { name: s.name, km: s.stravaDistanceKm ?? 0, days };
    }
  }

  let highestMileageShoe: { name: string; km: number } | null = null;
  for (const s of all) {
    const km = s.stravaDistanceKm ?? 0;
    if (!highestMileageShoe || km > highestMileageShoe.km) {
      highestMileageShoe = { name: s.name, km };
    }
  }

  return {
    lifetimeKm,
    activeShoeCount,
    retiredShoeCount,
    longestServingShoe,
    highestMileageShoe,
  };
}

/** Get the shoe most needing attention (highest pctUsed among active+nudgeable). */
export async function getMostUrgentNudge(): Promise<ShoeWithStats | null> {
  const all = await getAllShoesWithStats();
  const candidates = all.filter((s) => s.shouldNudge);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.pctUsed - a.pctUsed);
  return candidates[0];
}

export async function listPriceWatchesForShoe(shoeId: number) {
  const db = (await getDb());
  return db
    .select()
    .from(schema.shoePriceWatches)
    .where(eq(schema.shoePriceWatches.shoeId, shoeId))
    .orderBy(desc(schema.shoePriceWatches.observedAt))
    .all();
}
