import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { fetchGear } from '@/lib/sources/strava-api';
import { matchShoeName } from './database';

/**
 * Shoe ingestion — given a set of gear_ids seen in newly-synced activities,
 * ensure each one has a row in the `shoes` table with up-to-date metadata.
 *
 * Strategy:
 *   1. For each gear_id, check if we already have a row
 *   2. If not, fetch from Strava /gear/{id}, match against shoes-database
 *      CSV for category/recommended_km, insert
 *   3. If yes, refresh the strava_distance_km field (one Strava call)
 *
 * Called from the sync runner after each successful page of activities.
 *
 * Strava is the source of truth — we never invent shoe data, we only
 * mirror what Strava returns and decorate with our CSV match.
 */

export async function ensureShoesForGearIds(gearIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(gearIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const db = (await getDb());

  // Look up existing rows in one query
  const existing = await db
    .select({ stravaGearId: schema.shoes.stravaGearId })
    .from(schema.shoes)
    .all();
  const existingSet = new Set(existing.map((r) => r.stravaGearId).filter((s): s is string => s != null));

  for (const gearId of uniqueIds) {
    try {
      if (existingSet.has(gearId)) {
        // Existing — refresh distance only if we don't have a recent value
        await refreshStravaDistance(gearId);
      } else {
        // New — fetch full details and create
        await createFromStravaGear(gearId);
      }
    } catch (err) {
      // Don't fail the whole sync because of a single gear-fetch failure.
      // Log and continue. The gear can be back-filled later.
      console.error(`[shoes] failed to ingest gear ${gearId}:`, err);
    }
  }
}

async function createFromStravaGear(gearId: string): Promise<void> {
  const gear = await fetchGear(gearId);
  const db = (await getDb());

  // Match against the local CSV
  const match = matchShoeName(gear.name);

  // Strava returns distance in metres
  const distanceKm = gear.distance != null ? gear.distance / 1000 : null;

  await db.insert(schema.shoes).values({
    stravaGearId: gear.id,
    name: gear.name,
    brand: match?.brand ?? gear.brand_name ?? null,
    model: match?.model ?? gear.model_name ?? null,
    category: match?.category ?? null,
    carbonPlate: match?.carbonPlate ?? false,
    stravaDistanceKm: distanceKm,
    recommendedKm: match?.recommendedKm ?? null,
    status: gear.retired ? 'retired' : 'active',
    retireDate: gear.retired ? new Date().toISOString().slice(0, 10) : null,
    manualEntry: false,
    isFavourite: false,
    notes: match?.notes ?? null,
  });

  // Update activities table cached gear_name for any rows tied to this gear
  await db
    .update(schema.activities)
    .set({ gearName: gear.name })
    .where(eq(schema.activities.gearId, gear.id));
}

async function refreshStravaDistance(gearId: string): Promise<void> {
  // Lightweight refresh — re-fetch gear and update distance + retired flag
  // We don't refresh CSV match (user might have set custom values)
  const gear = await fetchGear(gearId);
  const db = (await getDb());
  const distanceKm = gear.distance != null ? gear.distance / 1000 : null;

  await db
    .update(schema.shoes)
    .set({
      stravaDistanceKm: distanceKm,
      // If Strava marks retired and we still show active, sync the status
      ...(gear.retired ? { status: 'retired' as const } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.shoes.stravaGearId, gearId));
}
