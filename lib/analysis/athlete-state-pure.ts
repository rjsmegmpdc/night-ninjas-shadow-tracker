/**
 * Pure helpers used by athlete-state.ts. Extracted into a separate file
 * (without `import 'server-only'`) so vitest can import them under
 * Node test environment.
 *
 * No DB access, no Drizzle, no Strava — just math.
 */

export type FormClass = 'fresh' | 'on-form' | 'maintained' | 'loaded' | 'overreached';

export const CTL_TIME_CONSTANT = 42; // days
export const ATL_TIME_CONSTANT = 7;
export const WINDOW_DAYS = 56; // 8 weeks

/**
 * Exponentially-weighted moving average over a daily load series.
 *
 *   value_today = value_yesterday × (1 - 1/τ) + load_today × (1/τ)
 *
 * Walks forward from `windowStart` to `asOf`, accumulating. Days with no
 * recorded activity contribute zero load.
 */
export function computeEwma(
  dailyLoad: Map<string, number>,
  asOfIso: string,
  windowDays: number,
  tau: number
): number {
  const decay = 1 - 1 / tau;
  const gain = 1 / tau;

  let value = 0;
  // UTC-anchored day walk: dailyLoad is keyed by plain 'YYYY-MM-DD' strings
  // (sliced from startDateLocal), so a local-construct + toISOString() readback
  // would shift the day keys back one in NZ (UTC+12) — mis-attributing load and
  // dropping the window-edge day, skewing CTL/ATL/TSB and the form badge.
  const start = new Date(asOfIso + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - windowDays);

  for (let d = 0; d <= windowDays; d++) {
    const dayDate = new Date(start);
    dayDate.setUTCDate(dayDate.getUTCDate() + d);
    const dayIso = dayDate.toISOString().slice(0, 10);
    const load = dailyLoad.get(dayIso) ?? 0;
    value = value * decay + load * gain;
  }

  return value;
}

/**
 * TSB-based form classification using standard PMC convention.
 *
 *   TSB > +25  →  fresh        (under-loaded; freshness peak)
 *   +10 to +25 →  on-form      (recovery on top of training)
 *   -10 to +10 →  maintained   (steady state)
 *   -25 to -10 →  loaded       (productive overload)
 *   TSB < -25  →  overreached  (injury/illness risk)
 *
 * Boundaries are inclusive of the lower bound. So TSB = 25 falls into
 * 'on-form' (not 'fresh'). This biases conservatively toward the
 * lower-form label at boundaries.
 */
export function classifyForm(tsb: number): FormClass {
  if (tsb > 25) return 'fresh';
  if (tsb > 10) return 'on-form';
  if (tsb >= -10) return 'maintained';
  if (tsb >= -25) return 'loaded';
  return 'overreached';
}

/**
 * Roll up per-activity confidence labels into a single window-level
 * confidence label. Used to tell consumers how trustworthy the CTL/ATL/TSB
 * numbers are overall:
 *
 *   - 'calibrated' if ≥ 50% of activities had calibrated load
 *   - 'pace-only'  if ≥ 50% had pace classification (and not majority calibrated)
 *   - 'estimated'  otherwise
 */
export function rollupConfidence(
  counts: { calibrated: number; 'pace-only': number; estimated: number },
  total: number
): 'calibrated' | 'pace-only' | 'estimated' {
  if (total === 0) return 'estimated';
  if (counts.calibrated / total >= 0.5) return 'calibrated';
  if (counts['pace-only'] / total >= 0.5) return 'pace-only';
  return 'estimated';
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Stage 2 (daily loop) - per-activity data fidelity, additive.
 *
 * Provenance only: 'manual' entries are typed by the athlete (self-reported),
 * every synced source (Strava, Garmin, Coros, Apple) is device-recorded.
 * Not wired into any existing consumer yet - re-exported from
 * athlete-state.ts (the read layer for this domain) for Wave 2 to use.
 */
export type DataFidelity = 'device' | 'self-reported';

export function deriveDataFidelity(source: string): DataFidelity {
  return source === 'manual' ? 'self-reported' : 'device';
}
