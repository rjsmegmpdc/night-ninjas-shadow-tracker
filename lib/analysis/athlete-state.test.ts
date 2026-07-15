import { describe, expect, it } from 'vitest';
import {
  computeEwma,
  classifyForm,
  rollupConfidence,
  deriveDataFidelity,
  CTL_TIME_CONSTANT,
  ATL_TIME_CONSTANT,
} from './athlete-state-pure';

// UTC-anchored day key, matching computeEwma's internal walk. Building keys
// with local midnight + toISOString() would shift them a day in NZ (UTC+12).
function dayKey(startIso: string, offset: number): string {
  const d = new Date(startIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe('computeEwma', () => {
  it('returns 0 when no load anywhere in the window', () => {
    const empty = new Map<string, number>();
    expect(computeEwma(empty, '2026-05-02', 56, CTL_TIME_CONSTANT)).toBe(0);
  });

  it('counts the asOf day and is timezone-independent (regression)', () => {
    // A local-built key + UTC readback shifts the key back a day in NZ
    // (UTC+12), which dropped the asOf day's load entirely. With a literal
    // key the UTC-anchored walk must still attribute it.
    const dailyLoad = new Map<string, number>([['2026-06-15', 100]]);
    const result = computeEwma(dailyLoad, '2026-06-15', 1, ATL_TIME_CONSTANT);
    expect(result).toBeCloseTo(100 / ATL_TIME_CONSTANT, 5);
  });

  it('settles to a steady-state value after enough days of constant load', () => {
    // After ~5 time constants, EWMA approaches the input value
    const dailyLoad = new Map<string, number>();
    for (let d = 0; d < 365; d++) {
      dailyLoad.set(dayKey('2026-01-01', d), 10);
    }
    // Compute EWMA at end of year — should be very close to 10 (the input)
    const result = computeEwma(dailyLoad, '2026-12-31', 365, CTL_TIME_CONSTANT);
    expect(result).toBeGreaterThan(9.9);
    expect(result).toBeLessThan(10.1);
  });

  it('ATL responds faster than CTL to a load spike', () => {
    // Sudden load arriving on day 50 of a 56-day window — ATL (τ=7) should
    // be much higher than CTL (τ=42) at the end
    const dailyLoad = new Map<string, number>();
    for (let d = 50; d <= 56; d++) {
      dailyLoad.set(dayKey('2026-03-08', d), 50); // 56 days before May 2
    }
    const atl = computeEwma(dailyLoad, '2026-05-02', 56, ATL_TIME_CONSTANT);
    const ctl = computeEwma(dailyLoad, '2026-05-02', 56, CTL_TIME_CONSTANT);
    expect(atl).toBeGreaterThan(ctl);
  });

  it('rest days dilute the EWMA proportionally', () => {
    // Two scenarios:
    //   A) every day = 20 load
    //   B) every other day = 40 load (same weekly total)
    // Both should converge to the same long-term average. Verifying basic
    // EWMA sanity — averaging accumulates correctly across patterns.
    const daily = new Map<string, number>();
    const everyOther = new Map<string, number>();
    for (let d = 0; d < 200; d++) {
      const iso = dayKey('2026-01-01', d);
      daily.set(iso, 20);
      if (d % 2 === 0) everyOther.set(iso, 40);
    }
    const a = computeEwma(daily, '2026-07-19', 200, CTL_TIME_CONSTANT);
    const b = computeEwma(everyOther, '2026-07-19', 200, CTL_TIME_CONSTANT);
    expect(Math.abs(a - b)).toBeLessThan(2); // within 10% — alternating-day pattern
  });
});

describe('classifyForm', () => {
  it('TSB > 25 → fresh', () => {
    expect(classifyForm(30)).toBe('fresh');
    expect(classifyForm(26)).toBe('fresh');
  });

  it('TSB +10 to +25 → on-form', () => {
    expect(classifyForm(15)).toBe('on-form');
    expect(classifyForm(11)).toBe('on-form');
    expect(classifyForm(25)).toBe('on-form'); // boundary case — 25 inclusive
  });

  it('TSB -10 to +10 → maintained', () => {
    expect(classifyForm(0)).toBe('maintained');
    expect(classifyForm(10)).toBe('maintained');
    expect(classifyForm(-10)).toBe('maintained');
  });

  it('TSB -25 to -10 → loaded', () => {
    expect(classifyForm(-15)).toBe('loaded');
    expect(classifyForm(-25)).toBe('loaded');
  });

  it('TSB < -25 → overreached', () => {
    expect(classifyForm(-30)).toBe('overreached');
    expect(classifyForm(-50)).toBe('overreached');
  });
});

describe('rollupConfidence', () => {
  it('returns "estimated" when no activities', () => {
    expect(rollupConfidence({ calibrated: 0, 'pace-only': 0, estimated: 0 }, 0)).toBe(
      'estimated'
    );
  });

  it('returns "calibrated" when ≥50% are calibrated', () => {
    expect(
      rollupConfidence({ calibrated: 5, 'pace-only': 2, estimated: 3 }, 10)
    ).toBe('calibrated');
  });

  it('returns "pace-only" when ≥50% are pace-classified and not majority calibrated', () => {
    expect(
      rollupConfidence({ calibrated: 1, 'pace-only': 6, estimated: 3 }, 10)
    ).toBe('pace-only');
  });

  it('returns "estimated" when neither tier dominates', () => {
    expect(
      rollupConfidence({ calibrated: 2, 'pace-only': 3, estimated: 5 }, 10)
    ).toBe('estimated');
  });
});

describe('deriveDataFidelity', () => {
  it('returns "self-reported" for manual entries', () => {
    expect(deriveDataFidelity('manual')).toBe('self-reported');
  });

  it('returns "device" for every synced source', () => {
    expect(deriveDataFidelity('strava')).toBe('device');
    expect(deriveDataFidelity('garmin')).toBe('device');
    expect(deriveDataFidelity('coros')).toBe('device');
    expect(deriveDataFidelity('apple')).toBe('device');
  });
});
