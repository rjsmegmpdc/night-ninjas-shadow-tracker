import { describe, expect, it } from 'vitest';
import { findUnloggedSessions, type PrescribedSessionOnDate } from './unlogged-sessions-pure';
import type { SessionTarget } from '@/lib/plans/types';
import type { Activity } from '@/lib/db/schema';

const TODAY = '2026-06-15'; // Monday

function session(dateIso: string, type: SessionTarget['type'] = 'easy'): PrescribedSessionOnDate {
  return { dateIso, session: { label: `${type} run`, type } };
}

function activity(overrides: Partial<Activity> = {}): Pick<Activity, 'type' | 'startDateLocal'> {
  return {
    type: 'Run',
    startDateLocal: '2026-06-14T06:30:00',
    ...overrides,
  };
}

describe('findUnloggedSessions', () => {
  it('excludes a prescribed session with a matching Run-type activity that day', () => {
    const prescribed = [session('2026-06-14')];
    const activities = [activity({ startDateLocal: '2026-06-14T06:30:00' })];
    expect(findUnloggedSessions(prescribed, activities, TODAY)).toEqual([]);
  });

  it('includes a past prescribed session with no activity that day', () => {
    const prescribed = [session('2026-06-14')];
    const result = findUnloggedSessions(prescribed, [], TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].dateIso).toBe('2026-06-14');
    expect(result[0].daysAgo).toBe(1);
  });

  it('skips rest-day sessions even when uncovered', () => {
    const prescribed = [session('2026-06-14', 'rest')];
    expect(findUnloggedSessions(prescribed, [], TODAY)).toEqual([]);
  });

  it('excludes today, even when uncovered', () => {
    const prescribed = [session(TODAY)];
    expect(findUnloggedSessions(prescribed, [], TODAY)).toEqual([]);
  });

  it('respects the lookback boundary (inclusive at lookbackDays, exclusive beyond)', () => {
    // default lookbackDays = 3 -> earliest included date is TODAY-3 = 2026-06-12
    const withinBoundary = session('2026-06-12');
    const beyondBoundary = session('2026-06-11');
    const result = findUnloggedSessions([withinBoundary, beyondBoundary], [], TODAY);
    expect(result.map((r) => r.dateIso)).toEqual(['2026-06-12']);
  });

  it('honours a custom lookbackDays', () => {
    const prescribed = [session('2026-06-10')]; // 5 days ago
    expect(findUnloggedSessions(prescribed, [], TODAY, 3)).toEqual([]);
    const result = findUnloggedSessions(prescribed, [], TODAY, 5);
    expect(result).toHaveLength(1);
  });

  it('does not count a non-Run activity as covering a prescribed run', () => {
    const prescribed = [session('2026-06-14')];
    const activities = [activity({ type: 'WeightTraining', startDateLocal: '2026-06-14T18:00:00' })];
    const result = findUnloggedSessions(prescribed, activities, TODAY);
    expect(result).toHaveLength(1);
  });

  it('counts a VirtualRun as covering', () => {
    const prescribed = [session('2026-06-14')];
    const activities = [activity({ type: 'VirtualRun', startDateLocal: '2026-06-14T06:30:00' })];
    expect(findUnloggedSessions(prescribed, activities, TODAY)).toEqual([]);
  });
});
