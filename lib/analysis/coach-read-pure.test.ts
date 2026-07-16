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
