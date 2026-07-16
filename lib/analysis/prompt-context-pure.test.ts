import { describe, expect, it } from 'vitest';
import {
  buildPromptQueue,
  wellnessCheckinPromptId,
  unloggedSessionPromptId,
  integrationErrorPromptId,
  manualOverlapPromptId,
  type PromptContextInput,
  type JournalCompletenessInput,
  type ManualOverlapInput,
} from './prompt-context-pure';
import type { UnloggedSession } from './unlogged-sessions-pure';

const TODAY = '2026-06-15';

function baseInput(overrides: Partial<PromptContextInput> = {}): PromptContextInput {
  return {
    todayLocalIso: TODAY,
    journal: null,
    unloggedSessions: [],
    integrationErrors: [],
    defaults: { wellnessCheckin: {} },
    skippedPromptIds: [],
    ...overrides,
  };
}

function unlogged(dateIso: string, daysAgo: number): UnloggedSession {
  return { dateIso, session: { label: 'Easy run', type: 'easy' }, daysAgo };
}

function overlap(manualActivityId: number, dateIso = '2026-06-14', syncedSourceId = 'strava-1'): ManualOverlapInput {
  return { manualActivityId, dateIso, syncedSourceId };
}

describe('buildPromptQueue', () => {
  it('returns an empty queue when everything is complete', () => {
    const journal: JournalCompletenessInput = { sleepQuality: 7, sleepHours: 7.5, energy: 8 };
    const result = buildPromptQueue(baseInput({ journal }));
    expect(result).toEqual([]);
  });

  it('surfaces a wellness-checkin prompt when the journal row is null', () => {
    const result = buildPromptQueue(baseInput());
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('wellness-checkin');
    expect(result[0].id).toBe(wellnessCheckinPromptId(TODAY));
    if (result[0].kind === 'wellness-checkin') {
      expect(result[0].missingFields).toEqual(['sleepQuality', 'sleepHours', 'energy']);
      expect(result[0].defaultOnSkip).toBeNull();
    }
  });

  it('lists only the fields actually missing on a partial journal row', () => {
    const journal: JournalCompletenessInput = { sleepQuality: 6, sleepHours: null, energy: null };
    const result = buildPromptQueue(baseInput({ journal }));
    expect(result).toHaveLength(1);
    if (result[0].kind === 'wellness-checkin') {
      expect(result[0].missingFields).toEqual(['sleepHours', 'energy']);
    }
  });

  it('applies only the configured defaults that match missing fields', () => {
    const journal: JournalCompletenessInput = { sleepQuality: null, sleepHours: null, energy: 8 };
    const result = buildPromptQueue(
      baseInput({
        journal,
        defaults: { wellnessCheckin: { sleepQuality: 7, energy: 5 } }, // energy default irrelevant — not missing
      })
    );
    expect(result).toHaveLength(1);
    if (result[0].kind === 'wellness-checkin') {
      expect(result[0].defaultOnSkip).toEqual({ sleepQuality: 7 });
    }
  });

  it('suppresses the wellness-checkin prompt entirely when autoSkipWellnessCheckin is set', () => {
    const result = buildPromptQueue(
      baseInput({ defaults: { wellnessCheckin: {}, autoSkipWellnessCheckin: true } })
    );
    expect(result).toEqual([]);
  });

  it('orders unlogged sessions oldest-first and assigns ascending priority', () => {
    const sessions = [unlogged('2026-06-14', 1), unlogged('2026-06-12', 3)];
    const result = buildPromptQueue(
      baseInput({
        journal: { sleepQuality: 7, sleepHours: 7, energy: 7 },
        unloggedSessions: sessions,
      })
    );
    expect(result.map((r) => r.id)).toEqual([
      unloggedSessionPromptId('2026-06-12'),
      unloggedSessionPromptId('2026-06-14'),
    ]);
    expect(result[0].priority).toBeLessThan(result[1].priority);
  });

  it('places integration errors after wellness and unlogged sessions', () => {
    const result = buildPromptQueue(
      baseInput({
        unloggedSessions: [unlogged('2026-06-14', 1)],
        integrationErrors: [{ adapterId: 'strava', message: 'Rate limited' }],
      })
    );
    expect(result.map((r) => r.kind)).toEqual([
      'wellness-checkin',
      'unlogged-session',
      'integration-error',
    ]);
    expect(result[2].id).toBe(integrationErrorPromptId('strava'));
  });

  it('places manual-overlap prompts between unlogged sessions and integration errors', () => {
    const result = buildPromptQueue(
      baseInput({
        journal: { sleepQuality: 7, sleepHours: 7, energy: 7 },
        unloggedSessions: [unlogged('2026-06-14', 1)],
        supersededOverlaps: [overlap(42)],
        integrationErrors: [{ adapterId: 'strava', message: 'Rate limited' }],
      })
    );
    expect(result.map((r) => r.kind)).toEqual([
      'unlogged-session',
      'manual-overlap',
      'integration-error',
    ]);
    const middle = result[1];
    expect(middle.priority).toBeGreaterThan(result[0].priority);
    expect(middle.priority).toBeLessThan(result[2].priority);
  });

  it('builds a manual-overlap prompt item with the expected id and defaultOnSkip', () => {
    const result = buildPromptQueue(
      baseInput({
        journal: { sleepQuality: 7, sleepHours: 7, energy: 7 },
        supersededOverlaps: [overlap(42, '2026-06-13', 'strava-99')],
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(manualOverlapPromptId(42));
    if (result[0].kind === 'manual-overlap') {
      expect(result[0].manualActivityId).toBe(42);
      expect(result[0].dateIso).toBe('2026-06-13');
      expect(result[0].syncedSourceId).toBe('strava-99');
      expect(result[0].defaultOnSkip).toBe('keep-synced');
      expect(result[0].skippable).toBe(true);
    }
  });

  it('excludes a skipped manual-overlap prompt', () => {
    const result = buildPromptQueue(
      baseInput({
        journal: { sleepQuality: 7, sleepHours: 7, energy: 7 },
        supersededOverlaps: [overlap(42)],
        skippedPromptIds: [manualOverlapPromptId(42)],
      })
    );
    expect(result).toEqual([]);
  });

  it('is backward-compatible when supersededOverlaps is omitted entirely', () => {
    const journal: JournalCompletenessInput = { sleepQuality: 7, sleepHours: 7, energy: 7 };
    const input: PromptContextInput = {
      todayLocalIso: TODAY,
      journal,
      unloggedSessions: [],
      integrationErrors: [],
      defaults: { wellnessCheckin: {} },
      skippedPromptIds: [],
      // supersededOverlaps intentionally omitted
    };
    expect(buildPromptQueue(input)).toEqual([]);
  });

  it('excludes prompts already skipped today', () => {
    const journal: JournalCompletenessInput = { sleepQuality: null, sleepHours: null, energy: null };
    const result = buildPromptQueue(
      baseInput({
        journal,
        unloggedSessions: [unlogged('2026-06-14', 1)],
        integrationErrors: [{ adapterId: 'garmin', message: 'Not syncing' }],
        skippedPromptIds: [
          wellnessCheckinPromptId(TODAY),
          unloggedSessionPromptId('2026-06-14'),
        ],
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('integration-error');
  });

  it('is deterministic — identical inputs produce identical output', () => {
    const input = baseInput({
      unloggedSessions: [unlogged('2026-06-14', 1), unlogged('2026-06-13', 2)],
      integrationErrors: [{ adapterId: 'strava', message: 'x' }, { adapterId: 'garmin', message: 'y' }],
    });
    expect(buildPromptQueue(input)).toEqual(buildPromptQueue(input));
  });

  it('assigns each integration error an increasing priority in supplied order', () => {
    const result = buildPromptQueue(
      baseInput({
        journal: { sleepQuality: 7, sleepHours: 7, energy: 7 },
        integrationErrors: [
          { adapterId: 'strava', message: 'a' },
          { adapterId: 'garmin', message: 'b' },
        ],
      })
    );
    expect(result[0].priority).toBeLessThan(result[1].priority);
  });
});
