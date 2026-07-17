'use server';

import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { saveShoePhoto, deleteShoePhoto } from '@/lib/storage/shoe-photos';
import { logEvent } from '@/lib/store/usage-log';
import {
  createGearBackfillJob,
  runGearBackfillJob,
} from '@/lib/shoes/backfill';
import { matchShoeName } from '@/lib/shoes/database';

function revalidateShoes() {
  revalidatePath('/shoes');
  revalidatePath('/patrol');
  revalidatePath('/settings');
}

/* ----------------------------------------------------------------------------
 * Retire / Un-retire / Dismiss
 * -------------------------------------------------------------------------- */

export async function retireShoe(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;

  await (await getDb())
    .update(schema.shoes)
    .set({
      status: 'retired',
      retireDate: new Date().toISOString().slice(0, 10),
      nudgeDismissedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.shoes.id, id));

  logEvent({ type: 'action', name: 'retireShoe', outcome: 'ok' });
  revalidateShoes();
}

export async function unretireShoe(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;

  await (await getDb())
    .update(schema.shoes)
    .set({
      status: 'active',
      retireDate: null,
      nudgeDismissedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.shoes.id, id));

  logEvent({ type: 'action', name: 'unretireShoe', outcome: 'ok' });
  revalidateShoes();
}

export async function dismissNudge(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;

  await (await getDb())
    .update(schema.shoes)
    .set({ nudgeDismissedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.shoes.id, id));

  logEvent({ type: 'action', name: 'dismissShoeNudge', outcome: 'ok' });
  revalidateShoes();
}

/* ----------------------------------------------------------------------------
 * Favourite + edit limits + notes
 * -------------------------------------------------------------------------- */

export async function toggleFavourite(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;

  const db = (await getDb());
  const current = await db
    .select({ isFavourite: schema.shoes.isFavourite })
    .from(schema.shoes)
    .where(eq(schema.shoes.id, id))
    .get();
  if (!current) return;

  await db
    .update(schema.shoes)
    .set({ isFavourite: !current.isFavourite, updatedAt: new Date() })
    .where(eq(schema.shoes.id, id));

  logEvent({ type: 'action', name: 'toggleShoeFavourite', outcome: 'ok' });
  revalidateShoes();
}

export async function setUserTargetKm(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  const targetStr = formData.get('targetKm')?.toString();
  if (!id) return;

  const target = targetStr ? parseFloat(targetStr) : null;
  if (target != null && (!isFinite(target) || target <= 0)) return;

  await (await getDb())
    .update(schema.shoes)
    .set({
      userTargetKm: target,
      // If user sets a new target above the current dismissal point,
      // re-arm the nudge so they get warned again at 80% of the new value
      nudgeDismissedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.shoes.id, id));

  logEvent({ type: 'action', name: 'setUserTargetKm', outcome: 'ok' });
  revalidateShoes();
}

export async function updateShoeNotes(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  const notes = formData.get('notes')?.toString().trim() || null;
  if (!id) return;

  await (await getDb())
    .update(schema.shoes)
    .set({ notes, updatedAt: new Date() })
    .where(eq(schema.shoes.id, id));

  revalidateShoes();
}

/* ----------------------------------------------------------------------------
 * Manual entry
 * -------------------------------------------------------------------------- */

export async function createManualShoe(formData: FormData) {
  const name = formData.get('name')?.toString().trim();
  const brandInput = formData.get('brand')?.toString().trim() || null;
  const modelInput = formData.get('model')?.toString().trim() || null;
  const purchaseDate = formData.get('purchaseDate')?.toString().trim() || null;
  const userTargetStr = formData.get('userTargetKm')?.toString();
  const notes = formData.get('notes')?.toString().trim() || null;

  if (!name) {
    throw new Error('Name is required');
  }

  // Try matching against the CSV using the supplied brand/model or the name
  const lookupString = [brandInput, modelInput].filter(Boolean).join(' ') || name;
  const match = matchShoeName(lookupString);

  const userTargetKm = userTargetStr ? parseFloat(userTargetStr) : null;

  await (await getDb()).insert(schema.shoes).values({
    stravaGearId: null,
    name,
    brand: brandInput ?? match?.brand ?? null,
    model: modelInput ?? match?.model ?? null,
    category: match?.category ?? null,
    carbonPlate: match?.carbonPlate ?? false,
    stravaDistanceKm: null,
    recommendedKm: match?.recommendedKm ?? null,
    userTargetKm: userTargetKm && isFinite(userTargetKm) && userTargetKm > 0 ? userTargetKm : null,
    purchaseDate,
    status: 'active',
    isFavourite: false,
    manualEntry: true,
    notes,
  });

  logEvent({ type: 'action', name: 'createManualShoe', outcome: 'ok' });
  revalidateShoes();
}

export async function deleteManualShoe(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;

  const db = (await getDb());
  // Only allow deletion of manual-entry shoes — Strava-sourced shoes can't
  // be deleted (they'd just come back on next sync)
  const shoe = await db.select().from(schema.shoes).where(eq(schema.shoes.id, id)).get();
  if (!shoe || !shoe.manualEntry) {
    throw new Error('Only manual-entry shoes can be deleted. Use Retire for Strava-sourced shoes.');
  }

  // Clean up dependent rows first
  await db.delete(schema.activityShoeAssignments).where(eq(schema.activityShoeAssignments.shoeId, id));
  await db.delete(schema.shoePriceWatches).where(eq(schema.shoePriceWatches.shoeId, id));
  await db.delete(schema.shoes).where(eq(schema.shoes.id, id));

  logEvent({ type: 'action', name: 'deleteManualShoe', outcome: 'ok' });
  revalidateShoes();
}

/* ----------------------------------------------------------------------------
 * Activity ↔ manual shoe linking
 * -------------------------------------------------------------------------- */

export async function assignActivityToManualShoe(formData: FormData) {
  const activityId = parseInt(formData.get('activityId')?.toString() || '0', 10);
  const shoeId = parseInt(formData.get('shoeId')?.toString() || '0', 10);
  if (!activityId || !shoeId) return;

  await (await getDb())
    .insert(schema.activityShoeAssignments)
    .values({ activityId, shoeId })
    .onConflictDoUpdate({
      target: schema.activityShoeAssignments.activityId,
      set: { shoeId, assignedAt: new Date() },
    });

  revalidateShoes();
}

export async function unassignActivityFromManualShoe(formData: FormData) {
  const activityId = parseInt(formData.get('activityId')?.toString() || '0', 10);
  if (!activityId) return;

  await (await getDb())
    .delete(schema.activityShoeAssignments)
    .where(eq(schema.activityShoeAssignments.activityId, activityId));

  revalidateShoes();
}

/* ----------------------------------------------------------------------------
 * Price watch logging
 * -------------------------------------------------------------------------- */

export async function logPriceWatch(formData: FormData) {
  const shoeId = parseInt(formData.get('shoeId')?.toString() || '0', 10);
  const retailer = formData.get('retailer')?.toString().trim();
  const priceStr = formData.get('price')?.toString();
  const currency = (formData.get('currency')?.toString().trim() || 'NZD').toUpperCase();
  const url = formData.get('url')?.toString().trim() || null;
  const notes = formData.get('notes')?.toString().trim() || null;

  if (!shoeId || !retailer || !priceStr) return;
  const price = parseFloat(priceStr);
  if (!isFinite(price) || price <= 0) return;

  await (await getDb()).insert(schema.shoePriceWatches).values({
    shoeId,
    retailer,
    price,
    currency,
    url,
    notes,
  });

  revalidateShoes();
}

export async function deletePriceWatch(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;
  await (await getDb()).delete(schema.shoePriceWatches).where(eq(schema.shoePriceWatches.id, id));
  revalidateShoes();
}

/* ----------------------------------------------------------------------------
 * Photo upload
 *
 * Files are saved to <dataDir>/shoe-photos/. Filenames are content-hashed
 * to avoid collisions and to allow caching.
 * -------------------------------------------------------------------------- */

export async function uploadShoePhoto(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  const file = formData.get('photo') as File | null;
  if (!id || !file || file.size === 0) return;

  // Determine extension from mime type
  const ext = (() => {
    if (file.type === 'image/jpeg') return 'jpg';
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/webp') return 'webp';
    return 'bin';
  })();
  const filename = `shoe-${id}-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await saveShoePhoto(filename, buffer);

  // Update shoe row
  await (await getDb())
    .update(schema.shoes)
    .set({ photoFilename: filename, updatedAt: new Date() })
    .where(eq(schema.shoes.id, id));

  revalidateShoes();
}

export async function removeShoePhoto(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;

  const db = (await getDb());
  const shoe = await db.select().from(schema.shoes).where(eq(schema.shoes.id, id)).get();
  if (!shoe?.photoFilename) return;

  await deleteShoePhoto(shoe.photoFilename);

  await db
    .update(schema.shoes)
    .set({ photoFilename: null, updatedAt: new Date() })
    .where(eq(schema.shoes.id, id));

  revalidateShoes();
}

/* ----------------------------------------------------------------------------
 * Backfill — fire-and-forget so the UI stays responsive
 * -------------------------------------------------------------------------- */

export async function startGearBackfill(): Promise<{ jobId: number }> {
  const job = await createGearBackfillJob();
  runGearBackfillJob(job.id).catch(() => {});
  revalidatePath('/settings');
  revalidatePath('/shoes');
  return { jobId: job.id };
}
