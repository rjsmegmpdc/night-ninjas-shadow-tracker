'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Loader2, Pause, AlertTriangle } from 'lucide-react';
import { Chip, type ChipTone } from '@/components/ui/ambient-chips';
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card';
import { startIncrementalSync, resumeJob, cancelJob } from '@/lib/actions/sync';
import { evaluateSyncStaleness } from '@/lib/sync/staleness-pure';

/**
 * SyncChip — redesign spec §2.3/§3.1: the ambient row's single home for
 * sync state. Consolidates three previously-separate surfaces:
 *   - SyncStatusBanner (components/sync/sync-status-banner.tsx) — running/
 *     paused/rate-limited banners with Resume/Cancel actions. Kept alive
 *     for the pre-data empty state (out of this component's scope — see
 *     app/(app)/patrol/page.tsx), but no longer rendered once the athlete
 *     has data, since this chip fully covers that case.
 *   - AmbientSync (components/patrol/ambient-sync.tsx) — auto-triggers an
 *     incremental sync on open when data is stale. That trigger logic is
 *     reproduced here verbatim (same evaluateSyncStaleness call); a
 *     syncing state is just another value this chip can show, not a
 *     separate "auto-syncing…" line.
 *   - SyncButton (components/patrol/sync-button.tsx) — manual "Sync now".
 *     The chip itself is the click target for a manual trigger when idle.
 *
 * Resume/Cancel/Try-resume live inside the hover-card as real buttons
 * (pointer-events-auto override), the same pattern StreakCounter already
 * uses for an interactive link inside a HoverCard.
 */

interface JobStatus {
  id: number;
  jobType: string;
  status: string;
  added: number;
  updated: number;
  pagesFetched: number;
  oldestFetched: string | null;
  completedAt: string | null;
  rateLimitResetsAt: string | null;
  errorMessage: string | null;
}

async function fetchStatus(): Promise<JobStatus | null> {
  try {
    const r = await fetch('/api/strava/sync/status');
    const data = await r.json();
    return data.job ?? null;
  } catch {
    return null;
  }
}

function jobLabel(jobType: string): string {
  switch (jobType) {
    case 'initial_90d':
      return 'last 90 days';
    case 'extended_history':
      return 'full history';
    case 'incremental':
      return 'recent activities';
    default:
      return jobType;
  }
}

function relativeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}M AGO`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.round(hours / 24);
  return `${days}D AGO`;
}

export function SyncChip() {
  const router = useRouter();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const firedAmbientRef = useRef(false);
  const pollRef = useRef<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function startPolling() {
    if (pollRef.current !== null) return;
    pollRef.current = window.setInterval(async () => {
      const j = await fetchStatus();
      setJob(j);
      if (j?.status !== 'running') {
        if (pollRef.current !== null) window.clearInterval(pollRef.current);
        pollRef.current = null;
        if (j?.status === 'complete') router.refresh();
      }
    }, 1000);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const j = await fetchStatus();
      if (cancelled) return;
      setJob(j);
      setLoaded(true);

      if (j?.status === 'running') {
        startPolling();
        return;
      }

      if (firedAmbientRef.current) return;
      firedAmbientRef.current = true;

      const decision = evaluateSyncStaleness({
        lastSuccessfulSyncCompletedAt:
          j?.status === 'complete' && j.completedAt ? new Date(j.completedAt) : null,
        now: new Date(),
        syncCurrentlyRunningOrPaused: j?.status === 'running' || j?.status === 'paused',
        lastJobFailed: j?.status === 'error' || j?.status === 'rate_limited',
      });
      if (!cancelled && decision.shouldSync) {
        await startIncrementalSync();
        if (cancelled) return;
        const j2 = await fetchStatus();
        setJob(j2);
        startPolling();
      }
    })();

    return () => {
      cancelled = true;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualSync = () => {
    if (job?.status === 'running' || isPending) return;
    startTransition(async () => {
      await startIncrementalSync();
      const j = await fetchStatus();
      setJob(j);
      startPolling();
    });
  };

  const handleResume = () => {
    if (!job) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('jobId', String(job.id));
      await resumeJob(fd);
      startPolling();
    });
  };

  const handleCancel = () => {
    if (!job) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('jobId', String(job.id));
      await cancelJob(fd);
      const j = await fetchStatus();
      setJob(j);
    });
  };

  if (!loaded) return null;

  const status = job?.status;

  if (status === 'running') {
    return (
      <HoverCardTrigger>
        <Chip tone="accent">
          <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
          SYNCING · STRAVA
        </Chip>
        <HoverCard>
          <div className="space-y-1">
            <div className="font-display tracking-wide-display uppercase text-[10px] text-accent">syncing</div>
            <div>
              {(job!.added + job!.updated)} synced so far · {job!.pagesFetched} pages · {jobLabel(job!.jobType)}
            </div>
          </div>
        </HoverCard>
      </HoverCardTrigger>
    );
  }

  if (status === 'paused') {
    return (
      <HoverCardTrigger>
        <Chip tone="warn">
          <Pause size={11} strokeWidth={1.5} />
          SYNC PAUSED
        </Chip>
        <HoverCard width="w-72">
          <div className="space-y-2">
            <div className="font-display tracking-wide-display uppercase text-[10px] text-signal-warn">
              sync paused
            </div>
            <div>
              {jobLabel(job!.jobType)} · {job!.added + job!.updated} synced
              {job!.oldestFetched ? ` · oldest ${job!.oldestFetched}` : ''}
            </div>
            <div className="flex items-center gap-3 pt-1 border-t border-ink-line pointer-events-auto">
              <button type="button" disabled={isPending} onClick={handleResume} className="text-accent hover:underline">
                Resume
              </button>
              <button type="button" disabled={isPending} onClick={handleCancel} className="text-bone-mute hover:text-signal-miss">
                Cancel
              </button>
            </div>
          </div>
        </HoverCard>
      </HoverCardTrigger>
    );
  }

  if (status === 'rate_limited') {
    const resumesAt = job!.rateLimitResetsAt ? new Date(job!.rateLimitResetsAt).toLocaleTimeString() : 'soon';
    return (
      <HoverCardTrigger>
        <Chip tone="warn">
          <AlertTriangle size={11} strokeWidth={1.5} />
          RATE LIMITED
        </Chip>
        <HoverCard width="w-72">
          <div className="space-y-2">
            <div className="font-display tracking-wide-display uppercase text-[10px] text-signal-warn">
              strava rate limit
            </div>
            <div>
              Resumes at {resumesAt} · {job!.added + job!.updated} synced so far
            </div>
            <div className="pt-1 border-t border-ink-line pointer-events-auto">
              <button type="button" disabled={isPending} onClick={handleResume} className="text-accent hover:underline">
                Try resume
              </button>
            </div>
          </div>
        </HoverCard>
      </HoverCardTrigger>
    );
  }

  if (status === 'error' || status === 'failed') {
    return (
      <HoverCardTrigger>
        <button type="button" onClick={handleManualSync} disabled={isPending} className="contents">
          <Chip tone="miss" className="cursor-pointer hover:border-accent transition-colors">
            <AlertTriangle size={11} strokeWidth={1.5} />
            SYNC ERROR
          </Chip>
        </button>
        <HoverCard width="w-72">
          <div className="space-y-1">
            <div className="font-display tracking-wide-display uppercase text-[10px] text-signal-miss">
              sync error
            </div>
            <div>{job!.errorMessage ?? 'Last attempt failed.'} Click the chip to retry.</div>
          </div>
        </HoverCard>
      </HoverCardTrigger>
    );
  }

  const tone: ChipTone = status === 'complete' ? 'ok' : 'neutral';
  const label =
    status === 'complete' && job!.completedAt
      ? `SYNCED · STRAVA · ${relativeAgo(job!.completedAt)}`
      : 'NOT SYNCED · STRAVA';

  return (
    <HoverCardTrigger>
      <button type="button" onClick={handleManualSync} disabled={isPending} className="contents">
        <Chip tone={tone} className="cursor-pointer hover:border-accent transition-colors">
          <RefreshCw size={11} strokeWidth={1.5} />
          {label}
        </Chip>
      </button>
      <HoverCard>
        <div className="space-y-1">
          <div className="font-display tracking-wide-display uppercase text-[10px] text-bone-dim">strava sync</div>
          <div>Click to pull the latest activities now.</div>
        </div>
      </HoverCard>
    </HoverCardTrigger>
  );
}
