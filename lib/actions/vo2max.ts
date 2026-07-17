'use server';

import { revalidatePath } from 'next/cache';
import { getDb, schema } from '@/lib/db';
import { cooperVo2, rockportVo2 } from '@/lib/analysis/vo2max-pure';
import { setAthleteProfile, type AthleteProfile } from '@/lib/store/settings';

/**
 * R2.5 server actions - add a VO2 observation (from a test) and save the
 * athlete profile used by the estimators.
 */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface AddVo2Result {
  ok: boolean;
  value?: number;
  error?: string;
}

/** Manual lab entry: athlete types the measured number directly. */
export async function addLabVo2(formData: FormData): Promise<AddVo2Result> {
  try {
    const value = Number(formData.get('value'));
    if (!Number.isFinite(value) || value < 20 || value > 90) {
      return { ok: false, error: 'Enter a plausible VO2 max (20-90 ml/kg/min).' };
    }
    const date = (formData.get('date')?.toString() || todayIso()).slice(0, 10);
    const note = formData.get('note')?.toString() || null;
    await (await getDb()).insert(schema.vo2maxObservations).values({
      date, source: 'manual-lab', value, note,
      inputs: JSON.stringify({ entered: value }),
    });
    revalidatePath('/vo2max');
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Cooper 12-minute test: athlete enters distance covered. */
export async function addCooperVo2(formData: FormData): Promise<AddVo2Result> {
  try {
    const distanceM = Number(formData.get('distance_m'));
    if (!Number.isFinite(distanceM) || distanceM < 1000 || distanceM > 6000) {
      return { ok: false, error: 'Enter a plausible 12-minute distance (1000-6000 m).' };
    }
    const value = cooperVo2(distanceM);
    const date = (formData.get('date')?.toString() || todayIso()).slice(0, 10);
    await (await getDb()).insert(schema.vo2maxObservations).values({
      date, source: 'cooper', value,
      inputs: JSON.stringify({ distanceM }),
    });
    revalidatePath('/vo2max');
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Rockport walk test: weight/age/sex/time/HR. */
export async function addRockportVo2(formData: FormData): Promise<AddVo2Result> {
  try {
    const weightKg = Number(formData.get('weight_kg'));
    const age = Number(formData.get('age'));
    const sex = formData.get('sex')?.toString();
    const timeMin = Number(formData.get('time_min'));
    const endHr = Number(formData.get('end_hr'));
    if (![weightKg, age, timeMin, endHr].every(Number.isFinite) || (sex !== 'male' && sex !== 'female')) {
      return { ok: false, error: 'Fill in weight, age, sex, walk time and finishing HR.' };
    }
    const value = rockportVo2({ weightKg, age, sex, timeMin, endHr });
    const date = (formData.get('date')?.toString() || todayIso()).slice(0, 10);
    await (await getDb()).insert(schema.vo2maxObservations).values({
      date, source: 'rockport', value,
      inputs: JSON.stringify({ weightKg, age, sex, timeMin, endHr }),
    });
    revalidatePath('/vo2max');
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveProfile(formData: FormData): Promise<void> {
  const num = (k: string): number | null => {
    const v = formData.get(k);
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const sexRaw = formData.get('sex')?.toString();
  const profile: Partial<AthleteProfile> = {
    age: num('age'),
    weightKg: num('weight_kg'),
    sex: sexRaw === 'male' || sexRaw === 'female' ? sexRaw : null,
    maxHr: num('max_hr'),
    restingHr: num('resting_hr'),
  };
  await setAthleteProfile(profile);
  revalidatePath('/vo2max');
  revalidatePath('/settings');
}

/**
 * Save NS HR calibration (easy cap, sub-threshold cap). Setting a measured
 * max HR elsewhere flips confidence to 'measured'; here we just persist the
 * caps the athlete confirms or edits.
 */
export async function saveNsCalibration(formData: FormData): Promise<void> {
  const num = (k: string): number | null => {
    const v = formData.get(k);
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const { setNsHrCalibration } = await import('@/lib/store/settings');
  const confidence = formData.get('confidence')?.toString();
  await setNsHrCalibration({
    easyHrCap: num('easy_hr_cap'),
    subThresholdHrCap: num('subt_hr_cap'),
    confidence: confidence === 'measured' ? 'measured' : 'estimated',
  });
  revalidatePath('/vo2max');
  revalidatePath('/patrol');
}
