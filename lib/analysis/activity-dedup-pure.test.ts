import { describe, expect, it } from 'vitest';
import { activitiesOverlap, findOverlappingActivity, type OverlapCandidate } from './activity-dedup-pure';

function candidate(overrides: Partial<OverlapCandidate> = {}): OverlapCandidate {
  return {
    localDateIso: '2026-06-14',
    durationS: 3000,
    distanceM: 10000,
    ...overrides,
  };
}

describe('activitiesOverlap', () => {
  it('is false when the local dates differ, even with identical duration/distance', () => {
    const a = candidate({ localDateIso: '2026-06-14' });
    const b = candidate({ localDateIso: '2026-06-15' });
    expect(activitiesOverlap(a, b)).toBe(false);
  });

  it('matches on duration within +/-20%', () => {
    const a = candidate({ durationS: 3000, distanceM: null });
    const b = candidate({ durationS: 3550, distanceM: null }); // +18.3%
    expect(activitiesOverlap(a, b)).toBe(true);
  });

  it('does not match when duration is outside +/-20% and distance is unavailable', () => {
    const a = candidate({ durationS: 3000, distanceM: null });
    const b = candidate({ durationS: 3800, distanceM: null }); // diff 800 > 20% of 3800 (760)
    expect(activitiesOverlap(a, b)).toBe(false);
  });

  it('matches on distance within +/-15%', () => {
    const a = candidate({ durationS: null, distanceM: 10000 });
    const b = candidate({ durationS: null, distanceM: 11400 }); // +14%
    expect(activitiesOverlap(a, b)).toBe(true);
  });

  it('does not match when distance is outside +/-15% and duration is unavailable', () => {
    const a = candidate({ durationS: null, distanceM: 10000 });
    const b = candidate({ durationS: null, distanceM: 11900 }); // diff 1900 > 15% of 11900 (1785)
    expect(activitiesOverlap(a, b)).toBe(false);
  });

  it('is false when neither duration nor distance is within tolerance', () => {
    const a = candidate({ durationS: 3000, distanceM: 10000 });
    const b = candidate({ durationS: 5000, distanceM: 20000 });
    expect(activitiesOverlap(a, b)).toBe(false);
  });

  it('treats a metric as non-matching when null on either side, falling back to the other metric', () => {
    const a = candidate({ durationS: 3000, distanceM: 10000 });
    const b = candidate({ durationS: null, distanceM: 10500 }); // distance within 15%, duration unknown
    expect(activitiesOverlap(a, b)).toBe(true);
  });

  it('is false when both metrics are null on one side', () => {
    const a = candidate({ durationS: 3000, distanceM: 10000 });
    const b = candidate({ durationS: null, distanceM: null });
    expect(activitiesOverlap(a, b)).toBe(false);
  });
});

describe('findOverlappingActivity', () => {
  it('returns the first matching candidate', () => {
    const incoming = candidate();
    const candidates = [
      candidate({ localDateIso: '2026-06-13' }),
      candidate({ durationS: 3000, distanceM: 10000 }),
    ];
    expect(findOverlappingActivity(incoming, candidates)).toBe(candidates[1]);
  });

  it('returns null when nothing matches', () => {
    const incoming = candidate();
    const candidates = [candidate({ localDateIso: '2026-06-01' })];
    expect(findOverlappingActivity(incoming, candidates)).toBeNull();
  });
});
