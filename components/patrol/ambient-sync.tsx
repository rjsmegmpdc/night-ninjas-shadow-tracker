'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startIncrementalSync } from '@/lib/actions/sync';
import { evaluateSyncStaleness } from '@/lib/sync/staleness-pure';

/**
 * AmbientSync — Stage 1 of the daily loop. Opening Patrol with stale data
 * auto-starts the existing incremental Strava sync; the trigger moves from
 * click (SyncButton) to open.
 *
 * On mount only (guarded against React StrictMode's dev double-invoke via
 * `firedRef`, so this fires once per page load, not per re-render):
 *   1. GET /api/strava/sync/status — the same endpoint SyncButton polls.
 *   2. Derive staleness inputs from the most recent job:
 *      - syncCurrentlyRunningOrPaused: status is 'running' or 'paused'
 *      - lastJobFailed: status is 'error' or 'rate_limited' (never
 *        auto-retries a failed attempt — that's a manual SyncButton action)
 *      - lastSuccessfulSyncCompletedAt: the job's completedAt, but only
 *        when its status is 'complete' — otherwise null/no known success
 *   3. Run the pure evaluateSyncStaleness() decision.
 *   4. If shouldSync, call startIncrementalSync() and poll to completion
 *      (same shape as SyncButton's poll loop), then router.refresh().
 *
 * Renders nothing in the common case — SyncStatusBanner owns the visible
 * progress UI. While an ambient sync is in flight this renders a minimal
 * inline hint so the page doesn't look inert before the banner picks up
 * the newly-created job on its own polling/render cycle.
 *
 * Threshold is currently the pure function's built-in default (6h) rather
 * than the configurable setting — see getAmbientSyncThresholdHours() in
 * lib/store/settings.ts, which is server-only plumbing for a later wave.
 *
 * Errors are non-blocking: caught and logged, never surfaced to the user.
 * SyncStatusBanner/SyncButton remain the source of truth for visible state.
 */
export function AmbientSync() {
  const router = useRouter();
  const firedRef = useRef(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    let cancelled = false;

    async function checkAndMaybeSync() {
      try {
        const r = await fetch('/api/strava/sync/status');
        const data = await r.json();
        const status: string | undefined = data.job?.status;

        const decision = evaluateSyncStaleness({
          lastSuccessfulSyncCompletedAt:
            status === 'complete' && data.job?.completedAt ? new Date(data.job.completedAt) : null,
          now: new Date(),
          syncCurrentlyRunningOrPaused: status === 'running' || status === 'paused',
          lastJobFailed: status === 'error' || status === 'rate_limited',
        });

        if (cancelled || !decision.shouldSync) return;

        setIsAutoSyncing(true);
        await startIncrementalSync();
        pollUntilDone();
      } catch (e) {
        console.error('Ambient sync check failed', e);
      }
    }

    function pollUntilDone() {
      const intervalId = window.setInterval(async () => {
        try {
          const r = await fetch('/api/strava/sync/status');
          const data = await r.json();
          const status = data.job?.status;
          if (status !== 'running') {
            window.clearInterval(intervalId);
            setIsAutoSyncing(false);
            if (status === 'complete') {
              router.refresh();
            }
          }
        } catch {
          // Network error — keep polling, transient
        }
      }, 1000);
    }

    checkAndMaybeSync();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAutoSyncing) return null;

  return (
    <div className="font-mono text-[10px] text-bone-mute uppercase tracking-widest mb-2">
      auto-syncing latest activities…
    </div>
  );
}
