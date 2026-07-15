import { describe, expect, it } from 'vitest';
import {
  validateManualActivityInput,
  deriveManualActivityTimestamps,
  type ManualActivityInput,
} from './manual-activity-pure';

function input(overrides: Partial<ManualActivityInput> = {}): ManualActivityInput {
  return {
    distanceKm: 10,
    durationMin: 50,
    dateIso: '2026-06-15',
    timeHm: '06:30',
    avgHr: null,
    rpe: null,
    notes: null,
    ...overrides,
  };
}

const TODAY = '2026-06-15';

describe('validateManualActivityInput', () => {
  it('accepts a typical valid entry', () => {
    const result = validateManualActivityInput(input(), TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.distanceM).toBe(10000);
      expect(result.value.movingTimeS).toBe(3000);
      expect(result.value.avgSpeedMs).toBeCloseTo(10000 / 3000, 6);
      expect(result.value.name).toBe('Manual entry');
    }
  });

  it('rejects zero or negative distance', () => {
    expect(validateManualActivityInput(input({ distanceKm: 0 }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ distanceKm: -5 }), TODAY).ok).toBe(false);
  });

  it('rejects implausible distance', () => {
    expect(validateManualActivityInput(input({ distanceKm: 301 }), TODAY).ok).toBe(false);
  });

  it('rejects zero or negative duration', () => {
    expect(validateManualActivityInput(input({ durationMin: 0 }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ durationMin: -1 }), TODAY).ok).toBe(false);
  });

  it('rejects implausible duration (over 24h)', () => {
    expect(validateManualActivityInput(input({ durationMin: 1441 }), TODAY).ok).toBe(false);
  });

  it('rejects malformed date', () => {
    expect(validateManualActivityInput(input({ dateIso: '15-06-2026' }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ dateIso: '2026/06/15' }), TODAY).ok).toBe(false);
  });

  it('rejects a future date', () => {
    const result = validateManualActivityInput(input({ dateIso: '2026-06-16' }), TODAY);
    expect(result.ok).toBe(false);
  });

  it('accepts a date equal to today (boundary)', () => {
    const result = validateManualActivityInput(input({ dateIso: TODAY }), TODAY);
    expect(result.ok).toBe(true);
  });

  it('rejects malformed time', () => {
    expect(validateManualActivityInput(input({ timeHm: '25:00' }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ timeHm: '6:30' }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ timeHm: '06:60' }), TODAY).ok).toBe(false);
  });

  it('accepts a missing avgHr, rejects out-of-range avgHr, accepts in-range', () => {
    expect(validateManualActivityInput(input({ avgHr: null }), TODAY).ok).toBe(true);
    expect(validateManualActivityInput(input({ avgHr: 29 }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ avgHr: 231 }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ avgHr: 150 }), TODAY).ok).toBe(true);
  });

  it('accepts a missing rpe, rejects out-of-range or non-integer rpe, accepts in-range', () => {
    expect(validateManualActivityInput(input({ rpe: null }), TODAY).ok).toBe(true);
    expect(validateManualActivityInput(input({ rpe: 0 }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ rpe: 11 }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ rpe: 5.5 }), TODAY).ok).toBe(false);
    expect(validateManualActivityInput(input({ rpe: 7 }), TODAY).ok).toBe(true);
  });

  it('falls back to "Manual entry" when notes are blank or whitespace', () => {
    const blank = validateManualActivityInput(input({ notes: '   ' }), TODAY);
    expect(blank.ok && blank.value.name).toBe('Manual entry');
    const missing = validateManualActivityInput(input({ notes: null }), TODAY);
    expect(missing.ok && missing.value.name).toBe('Manual entry');
  });

  it('uses trimmed notes as the name when provided', () => {
    const result = validateManualActivityInput(input({ notes: '  Easy shakeout  ' }), TODAY);
    expect(result.ok && result.value.name).toBe('Easy shakeout');
    expect(result.ok && result.value.notes).toBe('Easy shakeout');
  });
});

describe('deriveManualActivityTimestamps', () => {
  it('builds startDateLocal by plain concatenation, no offset', () => {
    const { startDateLocal } = deriveManualActivityTimestamps('2026-06-15', '06:30', 'Pacific/Auckland');
    expect(startDateLocal).toBe('2026-06-15T06:30:00');
  });

  it('converts NZST (winter, +12h) local time to UTC correctly', () => {
    const { startDateUtc } = deriveManualActivityTimestamps('2026-07-15', '06:30', 'Pacific/Auckland');
    expect(startDateUtc).toBe('2026-07-14T18:30:00.000Z');
  });

  it('converts NZDT (summer, +13h) local time to UTC correctly', () => {
    const { startDateUtc } = deriveManualActivityTimestamps('2026-01-15', '06:30', 'Pacific/Auckland');
    expect(startDateUtc).toBe('2026-01-14T17:30:00.000Z');
  });

  it('honours the passed timezone rather than the process TZ', () => {
    // Los Angeles is UTC-8 (PST, January) - proves the function reads the
    // tz param, not vitest.config.ts's pinned Pacific/Auckland process TZ.
    const { startDateUtc } = deriveManualActivityTimestamps('2026-01-15', '06:30', 'America/Los_Angeles');
    expect(startDateUtc).toBe('2026-01-15T14:30:00.000Z');
  });
});
