'use server';

/**
 * Phase 6 part 2 - log the post-race debrief for the goal race.
 *
 * Upserts a single race_results row for the current goal race: achieved finish
 * time, conditions, RPE, and lessons. The races row itself is never mutated.
 */

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { parseHmsToSeconds } from '@/lib/race/debrief-pure';

export interface DebriefResult {
  ok: boolean;
  error?: string;
}

export async function logRaceDebrief(formData: FormData): Promise<DebriefResult> {
  const db = (await getDb());
  const goal = await db.select().from(schema.races).where(eq(schema.races.isGoal, true)).get();
  if (!goal) return { ok: false, error: 'No goal race to log a result against.' };

  const finishRaw = String(formData.get('finishTime') ?? '').trim();
  const finishTimeS = finishRaw ? parseHmsToSeconds(finishRaw) : null;
  if (finishRaw && finishTimeS === null) {
    return { ok: false, error: 'Finish time should look like H:MM:SS or MM:SS.' };
  }

  const rpeRaw = String(formData.get('rpe') ?? '').trim();
  const rpe = rpeRaw ? Number(rpeRaw) : null;
  if (rpe !== null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10)) {
    return { ok: false, error: 'RPE should be a whole number from 1 to 10.' };
  }

  const conditions = String(formData.get('conditions') ?? '').trim() || null;
  const lessons = String(formData.get('lessons') ?? '').trim() || null;

  try {
    const existing = await db
      .select()
      .from(schema.raceResults)
      .where(eq(schema.raceResults.raceId, goal.id))
      .get();
    if (existing) {
      await db
        .update(schema.raceResults)
        .set({ finishTimeS, conditions, rpe, lessons, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(schema.raceResults.id, existing.id));
    } else {
      await db.insert(schema.raceResults).values({ raceId: goal.id, finishTimeS, conditions, rpe, lessons });
    }
  } catch {
    return { ok: false, error: 'Could not save the debrief. Has the database been migrated?' };
  }

  revalidatePath('/race');
  return { ok: true };
}
