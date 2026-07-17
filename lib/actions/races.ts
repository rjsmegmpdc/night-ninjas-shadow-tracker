'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { logEvent } from '@/lib/store/usage-log';

/* ----------------------------------------------------------------------------
 * Race CRUD — used by:
 *   - Wizard step 5 (/setup/races)
 *   - Calendar page (/calendar) — Race Calendar section
 * -------------------------------------------------------------------------- */

function parseTimeToSeconds(input: string | null): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Accept H:MM:SS or M:SS
  const parts = trimmed.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function revalidateRaces() {
  revalidatePath('/setup/races');
  revalidatePath('/calendar');
  revalidatePath('/patrol');
}

/** Add a goal race or tune-up race. `is_goal=true` means upsert (only one goal allowed). */
export async function createRace(formData: FormData) {
  const isGoal = formData.get('isGoal') === 'true';
  const name = formData.get('name')?.toString().trim() || 'Untitled race';
  const distanceKm = parseFloat(formData.get('distanceKm')?.toString() || '0');
  const raceDate = formData.get('raceDate')?.toString().trim();
  const targetTime = formData.get('targetTime')?.toString().trim() || null;
  const level = formData.get('level')?.toString() as
    | 'beginner'
    | 'intermediate'
    | 'advanced'
    | undefined;
  const notes = formData.get('notes')?.toString().trim() || null;

  if (!raceDate || !distanceKm) {
    throw new Error('Race date and distance are required.');
  }

  // Goal race must have a target time — pace zones are derived from it.
  // Tune-ups don't need one (informational only).
  if (isGoal && (!targetTime || parseTimeToSeconds(targetTime) === null)) {
    throw new Error('Goal races require a target time (e.g. 3:30:00).');
  }

  const db = (await getDb());

  if (isGoal) {
    // Demote any existing goal race first — only one A-race at a time.
    await db.update(schema.races).set({ isGoal: false }).where(eq(schema.races.isGoal, true));
  }

  await db.insert(schema.races).values({
    name,
    distanceKm,
    raceDate,
    targetTimeS: parseTimeToSeconds(targetTime),
    isGoal,
    level: isGoal ? level ?? 'intermediate' : null,
    notes,
  });

  logEvent({
    type: 'action',
    name: 'createRace',
    outcome: 'ok',
    meta: { isGoal, distanceKm },
  });

  revalidateRaces();
}

export async function deleteRace(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) return;
  await (await getDb()).delete(schema.races).where(eq(schema.races.id, id));
  logEvent({ type: 'action', name: 'deleteRace', outcome: 'ok' });
  revalidateRaces();
}

/**
 * Edit any field on any race. Same field set and validation rules as
 * createRace, but operates on an existing row by id.
 *
 * Goal-race rules still apply:
 *  - target time required (pace zones derive from it)
 *  - changing isGoal=true here demotes any other goal race
 */
export async function updateRace(formData: FormData) {
  const id = parseInt(formData.get('id')?.toString() || '0', 10);
  if (!id) throw new Error('Race id missing.');

  const name = formData.get('name')?.toString().trim() || 'Untitled race';
  const distanceKm = parseFloat(formData.get('distanceKm')?.toString() || '0');
  const raceDate = formData.get('raceDate')?.toString().trim();
  const targetTime = formData.get('targetTime')?.toString().trim() || null;
  const level = formData.get('level')?.toString() as
    | 'beginner'
    | 'intermediate'
    | 'advanced'
    | undefined;
  const notes = formData.get('notes')?.toString().trim() || null;
  // isGoal is read-only on edit (use a separate "promote to goal" flow if needed)
  const isGoal = formData.get('isGoal') === 'true';

  if (!raceDate || !distanceKm) {
    throw new Error('Race date and distance are required.');
  }

  if (isGoal && (!targetTime || parseTimeToSeconds(targetTime) === null)) {
    throw new Error('Goal races require a target time (e.g. 3:30:00).');
  }

  const db = (await getDb());

  if (isGoal) {
    // Demote any other goal race — only one A-race
    await db
      .update(schema.races)
      .set({ isGoal: false })
      .where(eq(schema.races.isGoal, true));
  }

  await db
    .update(schema.races)
    .set({
      name,
      distanceKm,
      raceDate,
      targetTimeS: targetTime ? parseTimeToSeconds(targetTime) : null,
      isGoal,
      level: isGoal ? level ?? 'intermediate' : null,
      notes,
    })
    .where(eq(schema.races.id, id));

  logEvent({
    type: 'action',
    name: 'updateRace',
    outcome: 'ok',
    meta: { id, isGoal, distanceKm },
  });

  revalidateRaces();
}
