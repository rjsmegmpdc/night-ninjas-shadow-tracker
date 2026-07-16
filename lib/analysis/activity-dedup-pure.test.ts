import { describe, expect, it } from 'vitest';
import {
  activitiesOverlap,
  findOverlappingActivity,
  buildSupersededUpdate,
  buildRestoreUpdate,
  safeParseJson,
  SUPERSEDED_TYPE,
  type OverlapCandidate,
} from './activity-dedup-pure';

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

describe('buildSupersededUpdate / buildRestoreUpdate (Stage 6 supersede mechanics)', () => {
  const NOW = '2026-07-16T10:00:00.000Z';
  const LATER = '2026-07-16T11:00:00.000Z';

  it('buildSupersededUpdate sets the sentinel type and embeds the marker', () => {
    const update = buildSupersededUpdate('Run', 'strava-123', NOW);
    expect(update.type).toBe(SUPERSEDED_TYPE);
    const parsed = safeParseJson(update.rawJson);
    expect(parsed.supersede).toEqual({
      originalType: 'Run',
      supersededBySync: 'strava-123',
      supersededAt: NOW,
    });
  });

  it('is deterministic for identical inputs', () => {
    expect(buildSupersededUpdate('Run', 'strava-123', NOW)).toEqual(
      buildSupersededUpdate('Run', 'strava-123', NOW)
    );
  });

  it('round-trips: restore recovers the exact original type', () => {
    const superseded = buildSupersededUpdate('Run', 'strava-123', NOW);
    const restored = buildRestoreUpdate(superseded.rawJson, LATER);
    expect(restored?.type).toBe('Run');
  });

  it('restore preserves the supersede history and adds restoredAt', () => {
    const superseded = buildSupersededUpdate('Run', 'strava-123', NOW);
    const restored = buildRestoreUpdate(superseded.rawJson, LATER);
    const parsed = safeParseJson(restored!.rawJson);
    expect(parsed.supersede).toEqual({
      originalType: 'Run',
      supersededBySync: 'strava-123',
      supersededAt: NOW,
      restoredAt: LATER,
    });
  });

  it('restore preserves unrelated keys already merged into rawJson (e.g. the dedup marker)', () => {
    const supersede = buildSupersededUpdate('VirtualRun', 'strava-456', NOW);
    const mergedRawJson = JSON.stringify({
      dedup: { overlapsSyncedSourceId: 'strava-456', overlapsSyncedType: 'VirtualRun', detectedAt: NOW },
      ...safeParseJson(supersede.rawJson),
    });

    const restored = buildRestoreUpdate(mergedRawJson, LATER);
    expect(restored?.type).toBe('VirtualRun');
    const parsed = safeParseJson(restored!.rawJson);
    expect(parsed.dedup).toEqual({
      overlapsSyncedSourceId: 'strava-456',
      overlapsSyncedType: 'VirtualRun',
      detectedAt: NOW,
    });
  });

  it('returns null when rawJson has no supersede marker', () => {
    expect(buildRestoreUpdate(null, NOW)).toBeNull();
    expect(buildRestoreUpdate('{}', NOW)).toBeNull();
    expect(buildRestoreUpdate(JSON.stringify({ dedup: {} }), NOW)).toBeNull();
  });

  it('returns null on malformed JSON rather than throwing', () => {
    expect(buildRestoreUpdate('{not json', NOW)).toBeNull();
  });

  it('safeParseJson tolerates null, malformed, and non-object JSON', () => {
    expect(safeParseJson(null)).toEqual({});
    expect(safeParseJson('not json')).toEqual({});
    expect(safeParseJson('"just a string"')).toEqual({});
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
  });
});
