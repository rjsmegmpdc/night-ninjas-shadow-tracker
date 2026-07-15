import { describe, it, expect } from 'vitest';
import { evaluateSyncStaleness } from './staleness-pure';

const NOW = new Date('2026-07-15T12:00:00.000Z');

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

describe('evaluateSyncStaleness', () => {
  it('fresh: last sync well inside the threshold window', () => {
    const r = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: hoursAgo(2),
      now: NOW,
      thresholdHours: 6,
      syncCurrentlyRunningOrPaused: false,
      lastJobFailed: false,
    });
    expect(r).toEqual({ shouldSync: false, reason: 'fresh' });
  });

  it('stale: last sync well past the threshold window', () => {
    const r = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: hoursAgo(10),
      now: NOW,
      thresholdHours: 6,
      syncCurrentlyRunningOrPaused: false,
      lastJobFailed: false,
    });
    expect(r).toEqual({ shouldSync: true, reason: 'stale' });
  });

  it('at-threshold boundary: age exactly equal to threshold counts as stale', () => {
    const r = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: hoursAgo(6),
      now: NOW,
      thresholdHours: 6,
      syncCurrentlyRunningOrPaused: false,
      lastJobFailed: false,
    });
    expect(r).toEqual({ shouldSync: true, reason: 'stale' });
  });

  it('running-job suppression: never auto-starts on top of an active job', () => {
    const r = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: hoursAgo(10),
      now: NOW,
      thresholdHours: 6,
      syncCurrentlyRunningOrPaused: true,
      lastJobFailed: false,
    });
    expect(r).toEqual({ shouldSync: false, reason: 'sync-already-active' });
  });

  it('paused-job suppression: same suppression as running', () => {
    const r = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: null,
      now: NOW,
      thresholdHours: 6,
      syncCurrentlyRunningOrPaused: true,
      lastJobFailed: false,
    });
    expect(r).toEqual({ shouldSync: false, reason: 'sync-already-active' });
  });

  it('never-synced: no prior successful sync should sync', () => {
    const r = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: null,
      now: NOW,
      thresholdHours: 6,
      syncCurrentlyRunningOrPaused: false,
      lastJobFailed: false,
    });
    expect(r).toEqual({ shouldSync: true, reason: 'never-synced' });
  });

  it('failed-job suppression: a stale-but-errored latest job does not auto-retry', () => {
    const r = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: hoursAgo(10),
      now: NOW,
      thresholdHours: 6,
      syncCurrentlyRunningOrPaused: false,
      lastJobFailed: true,
    });
    expect(r).toEqual({ shouldSync: false, reason: 'last-sync-errored' });
  });

  it('failed-job suppression outranks never-synced', () => {
    const r = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: null,
      now: NOW,
      thresholdHours: 6,
      syncCurrentlyRunningOrPaused: false,
      lastJobFailed: true,
    });
    expect(r).toEqual({ shouldSync: false, reason: 'last-sync-errored' });
  });

  it('active-job suppression outranks failed-job', () => {
    const r = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: hoursAgo(10),
      now: NOW,
      thresholdHours: 6,
      syncCurrentlyRunningOrPaused: true,
      lastJobFailed: true,
    });
    expect(r).toEqual({ shouldSync: false, reason: 'sync-already-active' });
  });

  it('default threshold (omitted) behaves as 6 hours', () => {
    const justUnder = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: hoursAgo(5.9),
      now: NOW,
      syncCurrentlyRunningOrPaused: false,
      lastJobFailed: false,
    });
    expect(justUnder).toEqual({ shouldSync: false, reason: 'fresh' });

    const justOver = evaluateSyncStaleness({
      lastSuccessfulSyncCompletedAt: hoursAgo(6.1),
      now: NOW,
      syncCurrentlyRunningOrPaused: false,
      lastJobFailed: false,
    });
    expect(justOver).toEqual({ shouldSync: true, reason: 'stale' });
  });
});
