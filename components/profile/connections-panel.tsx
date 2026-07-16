'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, MinusCircle, AlertTriangle } from 'lucide-react';
import { updatePromptDefaults, type PromptDefaultsResult } from '@/lib/actions/prompt-defaults';
import type { AdapterId, AdapterStatusValue } from '@/lib/actions/adapter-status';
import type { PromptDefaults } from '@/lib/analysis/prompt-context-pure';

/**
 * Stage 5 - Connections panel (PHASES Phase 11, PRD 8.5's "RARE (Profile)"
 * row). One surface listing every adapter with status/last-sync, plus the
 * prompt-queue defaults applied when the athlete skips a wellness check-in.
 * No nutrition card - that importer is parked at P2 (research only).
 *
 * `adapters` arrives pre-formatted from the Profile page: `lastSyncLocal` is
 * already rendered in the athlete's timezone (formatInTimeZone against
 * getUserTimezone(), same pattern as the Journal-page refine) since this
 * component is a client component and getUserTimezone() is server-only.
 */

export interface AdapterDisplayRow {
  id: AdapterId;
  status: AdapterStatusValue;
  /** Pre-formatted in the athlete's local timezone; null when never synced. */
  lastSyncLocal: string | null;
  detail: string;
}

const ADAPTER_LABEL: Record<AdapterId, string> = {
  strava: 'Strava',
  garmin: 'Garmin',
  coros: 'COROS',
  polar: 'Polar',
};

const STATUS_LABEL: Record<AdapterStatusValue, string> = {
  connected: 'Connected',
  wired: 'Wired',
  placeholder: 'Not built',
  error: 'Attention',
};

// connected=ok signal, wired=neutral, placeholder=muted, error=warn (per PHASES Phase 11 brief)
const STATUS_TONE: Record<AdapterStatusValue, string> = {
  connected: 'text-signal-ok border-signal-ok/40 bg-signal-ok/5',
  wired: 'text-bone-dim border-ink-line bg-ink-shadow',
  placeholder: 'text-bone-mute border-ink-line bg-ink-shadow',
  error: 'text-signal-warn border-signal-warn/40 bg-signal-warn/5',
};

const STATUS_ICON: Record<AdapterStatusValue, typeof CheckCircle2> = {
  connected: CheckCircle2,
  wired: Circle,
  placeholder: MinusCircle,
  error: AlertTriangle,
};

const inputClass =
  'w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none';

export function ConnectionsPanel({
  adapters,
  defaults,
}: {
  adapters: AdapterDisplayRow[];
  defaults: PromptDefaults;
}) {
  return (
    <div className="space-y-6">
      <div className="border border-ink-line rounded-xl divide-y divide-ink-line overflow-hidden">
        {adapters.map((a) => (
          <AdapterRow key={a.id} adapter={a} />
        ))}
      </div>

      <PromptDefaultsForm defaults={defaults} />
    </div>
  );
}

function AdapterRow({ adapter }: { adapter: AdapterDisplayRow }) {
  const Icon = STATUS_ICON[adapter.status];

  return (
    <div className="p-5 flex flex-wrap items-start gap-4">
      <div className="flex-1 min-w-[12rem] space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display tracking-wide-display uppercase text-sm text-bone">
            {ADAPTER_LABEL[adapter.id]}
          </span>
          <span
            className={
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-mono text-[10px] uppercase tracking-widest ' +
              STATUS_TONE[adapter.status]
            }
          >
            <Icon size={12} strokeWidth={1.5} />
            {STATUS_LABEL[adapter.status]}
          </span>
        </div>
        <div className="font-mono text-xs text-bone-dim">{adapter.detail}</div>
        <div className="font-mono text-[10px] text-bone-mute">
          last sync: {adapter.lastSyncLocal ?? 'never'}
        </div>
      </div>

      {adapter.id === 'strava' && (
        <Link
          href="/settings"
          className="shrink-0 font-mono text-xs text-bone-dim hover:text-accent transition-colors"
        >
          Sync controls →
        </Link>
      )}
      {adapter.id === 'garmin' && (
        <Link
          href="/settings#garmin"
          className="shrink-0 font-mono text-xs text-bone-dim hover:text-accent transition-colors"
        >
          Manage →
        </Link>
      )}
    </div>
  );
}

function PromptDefaultsForm({ defaults }: { defaults: PromptDefaults }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PromptDefaultsResult | null>(null);
  const [autoSkip, setAutoSkip] = useState(defaults.autoSkipWellnessCheckin ?? false);

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set('autoSkipWellnessCheckin', autoSkip ? 'true' : 'false');
    setResult(null);
    startTransition(async () => {
      setResult(await updatePromptDefaults(fd));
    });
  };

  return (
    <div className="border border-ink-line rounded-xl p-6 space-y-4">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
        wellness prompt defaults
      </div>
      <p className="font-mono text-xs text-bone-mute leading-relaxed">
        Applied when you tap Skip on Patrol's wellness check-in prompt instead
        of leaving today blank. Leave a field empty to clear its default -
        skipping will still prompt for that field next time.
      </p>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">
              sleep quality
            </span>
            <input
              name="sleepQualityDefault"
              type="number"
              min={1}
              max={10}
              step={1}
              className={inputClass}
              placeholder="none"
              defaultValue={defaults.wellnessCheckin.sleepQuality ?? ''}
            />
          </label>
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">
              sleep hours
            </span>
            <input
              name="sleepHoursDefault"
              type="number"
              min={0}
              max={16}
              step={0.5}
              className={inputClass}
              placeholder="none"
              defaultValue={defaults.wellnessCheckin.sleepHours ?? ''}
            />
          </label>
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">
              energy
            </span>
            <input
              name="energyDefault"
              type="number"
              min={1}
              max={10}
              step={1}
              className={inputClass}
              placeholder="none"
              defaultValue={defaults.wellnessCheckin.energy ?? ''}
            />
          </label>
        </div>

        <label className="flex items-start gap-2 font-mono text-xs text-bone-dim">
          <input
            type="checkbox"
            checked={autoSkip}
            onChange={(e) => setAutoSkip(e.target.checked)}
            className="accent-accent mt-0.5"
          />
          <span>
            Never show the wellness check-in prompt at all - the defaults
            above won't be written automatically; today's journal stays
            blank unless you log it yourself.
          </span>
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save defaults'}
        </button>
      </form>

      {result && (
        <div
          className={
            'rounded-lg p-3 text-sm ' +
            (result.ok
              ? 'bg-signal-ok/10 border border-signal-ok/40 text-signal-ok'
              : 'bg-signal-miss/10 border border-signal-miss/40 text-signal-miss')
          }
        >
          {result.ok ? 'Saved.' : result.error}
        </div>
      )}
    </div>
  );
}
