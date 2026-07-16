import { describe, expect, it } from 'vitest';
import { buildCoachRead, type CoachReadInput } from './coach-read-pure';

function baseInput(overrides: Partial<CoachReadInput> = {}): CoachReadInput {
  return {
    activity: {
      type: 'Run',
      distanceKm: 10,
      movingTimeMin: 50,
      dateIso: '2026-06-15',
      isSelfReported: false,
    },
    compliance: { flag: 'ok', message: 'On target', sessionLabel: 'Tue easy' },
    athleteState: { ctl: 40, atl: 38, tsb: 2, formClass: 'maintained' },
    ...overrides,
  };
}

describe('buildCoachRead', () => {
  it('every number in the output traces to an input field (no invented figures)', () => {
    const input = baseInput();
    const read = buildCoachRead(input);
    expect(read.headline).toContain('10.0km');
    expect(read.headline).toContain('2026-06-15');
    expect(read.detail).toContain('+2'); // tsb, with sign
  });

  it('renders an ok compliance read with the session label', () => {
    const read = buildCoachRead(baseInput());
    expect(read.detail).toContain('On target for Tue easy');
  });

  it('never claims false praise on a miss', () => {
    const read = buildCoachRead(
      baseInput({ compliance: { flag: 'miss', message: 'No qualifying pace found', sessionLabel: 'Wed tempo' } })
    );
    expect(read.detail.toLowerCase()).not.toContain('amazing');
    expect(read.detail.toLowerCase()).not.toContain('great job');
    expect(read.detail).toContain('Missed the mark');
    expect(read.detail).toContain('No qualifying pace found');
  });

  it('handles no compliance context (unplanned run) without inventing a target', () => {
    const read = buildCoachRead(baseInput({ compliance: null }));
    expect(read.detail).toContain('Nothing prescribed to measure this against.');
  });

  it('handles missing athlete state without inventing CTL/ATL/TSB numbers', () => {
    const read = buildCoachRead(baseInput({ athleteState: null }));
    expect(read.detail).not.toMatch(/TSB/);
    expect(read.pointer).toContain('Not enough recent history');
  });

  it('flags overreached form with a back-off pointer, never a push-through one', () => {
    const read = buildCoachRead(
      baseInput({ athleteState: { ctl: 60, atl: 80, tsb: -30, formClass: 'overreached' } })
    );
    expect(read.pointer.toLowerCase()).toContain('back off');
    expect(read.detail).toContain('-30');
  });

  it('flags fresh form with an encouraging-but-earned pointer', () => {
    const read = buildCoachRead(
      baseInput({ athleteState: { ctl: 50, atl: 30, tsb: 30, formClass: 'fresh' } })
    );
    expect(read.pointer.toLowerCase()).toContain('freshness');
  });

  it('marks self-reported activities in the headline without penalising them', () => {
    const read = buildCoachRead(
      baseInput({ activity: { ...baseInput().activity, isSelfReported: true } })
    );
    expect(read.headline).toContain('(self-reported)');
  });

  // P0-7 acceptance: "the coach narrative acknowledges self-reported data" —
  // must hold regardless of which compliance branch the run lands in, not
  // just the happy-path 'ok' case above.
  it('still acknowledges self-reported data when compliance is a miss (P0-7)', () => {
    const read = buildCoachRead(
      baseInput({
        activity: { ...baseInput().activity, isSelfReported: true },
        compliance: { flag: 'miss', message: 'No qualifying pace found', sessionLabel: 'Wed tempo' },
      })
    );
    expect(read.headline).toContain('(self-reported)');
    expect(read.detail).toContain('Missed the mark');
  });

  it('does not mark a device-recorded activity as self-reported', () => {
    const read = buildCoachRead(baseInput({ activity: { ...baseInput().activity, isSelfReported: false } }));
    expect(read.headline).not.toContain('(self-reported)');
  });

  it('is deterministic for identical inputs', () => {
    const input = baseInput();
    expect(buildCoachRead(input)).toEqual(buildCoachRead(input));
  });

  it('handles a distance-less activity (e.g. strength) without crashing on formatting', () => {
    const read = buildCoachRead(
      baseInput({
        activity: { type: 'WeightTraining', distanceKm: null, movingTimeMin: 45, dateIso: '2026-06-15', isSelfReported: false },
        compliance: { flag: 'ok', message: '45 min', sessionLabel: 'Strength' },
      })
    );
    expect(read.headline).toContain('WeightTraining logged on 2026-06-15');
  });
});

describe('buildCoachRead — tone (G-005)', () => {
  it('maps ok -> ok', () => {
    expect(buildCoachRead(baseInput({ compliance: { flag: 'ok', message: '', sessionLabel: null } })).tone).toBe('ok');
  });

  it.each(['warn', 'fast', 'slow', 'short'] as const)('maps %s -> warn', (flag) => {
    expect(buildCoachRead(baseInput({ compliance: { flag, message: '', sessionLabel: null } })).tone).toBe('warn');
  });

  it('maps miss -> accent', () => {
    expect(buildCoachRead(baseInput({ compliance: { flag: 'miss', message: '', sessionLabel: null } })).tone).toBe('accent');
  });

  it('maps none -> accent', () => {
    expect(buildCoachRead(baseInput({ compliance: { flag: 'none', message: '', sessionLabel: null } })).tone).toBe('accent');
  });

  it('maps no compliance context -> accent (neutral brand tone)', () => {
    expect(buildCoachRead(baseInput({ compliance: null })).tone).toBe('accent');
  });
});

describe('buildCoachRead — evidence chips (G-005)', () => {
  it('emits a distance-vs-target chip only when actual + both target bounds are present', () => {
    const withBand = buildCoachRead(
      baseInput({
        athleteState: null,
        compliance: {
          flag: 'ok',
          message: '',
          sessionLabel: null,
          actualKm: 10.2,
          targetDistanceKmMin: 9,
          targetDistanceKmMax: 11,
        },
      })
    );
    expect(withBand.evidence).toContain('10.2 km vs 9–11 target');

    const missingBound = buildCoachRead(
      baseInput({
        athleteState: null,
        compliance: { flag: 'ok', message: '', sessionLabel: null, actualKm: 10.2, targetDistanceKmMin: 9 },
      })
    );
    expect(missingBound.evidence.some((e) => e.includes('km vs'))).toBe(false);
  });

  it('emits a pace-vs-band chip only when actual + both pace bounds are present, formatted mm:ss/km', () => {
    const withBand = buildCoachRead(
      baseInput({
        athleteState: null,
        compliance: {
          flag: 'ok',
          message: '',
          sessionLabel: null,
          actualPaceSpk: 304, // 5:04/km
          targetPaceSpkMin: 295, // 4:55/km
          targetPaceSpkMax: 310, // 5:10/km
        },
      })
    );
    expect(withBand.evidence).toContain('pace 5:04/km vs 4:55–5:10 band');

    const missingBound = buildCoachRead(
      baseInput({
        athleteState: null,
        compliance: { flag: 'ok', message: '', sessionLabel: null, actualPaceSpk: 304, targetPaceSpkMin: 295 },
      })
    );
    expect(missingBound.evidence.some((e) => e.startsWith('pace '))).toBe(false);
  });

  it('emits a TSB+form chip only when athleteState is present', () => {
    const withState = buildCoachRead(baseInput({ athleteState: { ctl: 50, atl: 40, tsb: 3, formClass: 'fresh' } }));
    expect(withState.evidence).toContain('TSB +3 · fresh');

    const withoutState = buildCoachRead(baseInput({ athleteState: null }));
    expect(withoutState.evidence.some((e) => e.startsWith('TSB'))).toBe(false);
  });

  it('emits a self-reported chip only when the activity is self-reported', () => {
    const selfReported = buildCoachRead(baseInput({ activity: { ...baseInput().activity, isSelfReported: true } }));
    expect(selfReported.evidence).toContain('self-reported');

    const deviceRecorded = buildCoachRead(baseInput({ activity: { ...baseInput().activity, isSelfReported: false } }));
    expect(deviceRecorded.evidence).not.toContain('self-reported');
  });

  it('never invents a chip from absent inputs — empty compliance/athleteState/self-reported yields no evidence', () => {
    const read = buildCoachRead(
      baseInput({
        compliance: { flag: 'none', message: '', sessionLabel: null },
        athleteState: null,
        activity: { ...baseInput().activity, isSelfReported: false },
      })
    );
    expect(read.evidence).toEqual([]);
  });

  it('caps at 4 chips when every source is present at once', () => {
    const read = buildCoachRead(
      baseInput({
        activity: { ...baseInput().activity, isSelfReported: true },
        compliance: {
          flag: 'ok',
          message: '',
          sessionLabel: null,
          actualKm: 10.2,
          targetDistanceKmMin: 9,
          targetDistanceKmMax: 11,
          actualPaceSpk: 304,
          targetPaceSpkMin: 295,
          targetPaceSpkMax: 310,
        },
        athleteState: { ctl: 50, atl: 40, tsb: 3, formClass: 'fresh' },
      })
    );
    expect(read.evidence).toHaveLength(4);
  });
});
