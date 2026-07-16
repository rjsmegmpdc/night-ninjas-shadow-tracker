'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HeartPulse, ClipboardEdit, AlertTriangle, RefreshCw, X } from 'lucide-react';
import type {
  PromptItem,
  WellnessCheckinPromptItem,
  UnloggedSessionPromptItem,
  IntegrationErrorPromptItem,
  ManualOverlapPromptItem,
  WellnessField,
} from '@/lib/analysis/prompt-context-pure';
import { logJournalEntry, recordPromptSkip } from '@/lib/actions/journal';
import { restoreManualActivity } from '@/lib/actions/manual-activity';
import { ManualResultForm } from '@/components/journal/manual-result-form';
import { formatBand } from '@/lib/plans/derive';
import type { SessionTarget } from '@/lib/plans/types';

/**
 * Stage 3 (daily loop) - PRD 8.5's skippable prompt stack. Top of the Patrol
 * dashboard, directly under the ambient-sync slot. Renders nothing when the
 * queue is empty - no empty-state card, this is a silent-when-satisfied
 * surface by design.
 *
 * Each card owns its own kind-specific body but shares one shell (icon,
 * label, tone) and a Skip control that calls `recordPromptSkip`. Skipping the
 * wellness-checkin prompt writes `defaultOnSkip` (when configured) via
 * `logJournalEntry` before recording the skip, so a default-on-skip actually
 * lands in the journal rather than just silencing the prompt.
 *
 * `todayLocalIso` is threaded down from the server page (via
 * getPromptQueue's own athlete-timezone resolution) rather than computed
 * client-side - `recordPromptSkip`'s `date` argument must match the date
 * `getSkippedPromptIds` reads back on the next render, and a browser-local
 * `new Date()` can disagree with the athlete's configured timezone.
 */
export function PromptQueue({ items, todayLocalIso }: { items: PromptItem[]; todayLocalIso: string }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((item) => {
        switch (item.kind) {
          case 'wellness-checkin':
            return <WellnessCheckinCard key={item.id} item={item} todayLocalIso={todayLocalIso} />;
          case 'unlogged-session':
            return <UnloggedSessionCard key={item.id} item={item} todayLocalIso={todayLocalIso} />;
          case 'manual-overlap':
            return <ManualOverlapCard key={item.id} item={item} todayLocalIso={todayLocalIso} />;
          case 'integration-error':
            return <IntegrationErrorCard key={item.id} item={item} todayLocalIso={todayLocalIso} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

/* ---------- Shared shell ---------- */

function PromptShell({
  tone,
  icon,
  label,
  title,
  children,
  footer,
}: {
  tone: 'neutral' | 'warn' | 'miss';
  icon: React.ReactNode;
  label: string;
  title: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  const toneClass = {
    neutral: 'border-ink-line bg-ink-shadow',
    warn: 'border-signal-warn/50 bg-signal-warn/5',
    miss: 'border-signal-miss/50 bg-signal-miss/5',
  }[tone];

  return (
    <div className={`rounded-xl border shadow-card p-5 space-y-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        {icon}
        <div className="flex-1 space-y-1">
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">{label}</div>
          <div className="font-display tracking-wide-display uppercase text-lg text-bone">{title}</div>
        </div>
      </div>
      {children}
      {footer}
    </div>
  );
}

function SkipButton({
  disabled,
  onSkip,
  label = 'Skip',
}: {
  disabled: boolean;
  onSkip: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSkip}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-bone-dim hover:text-bone border border-ink-line hover:border-ink-line-bold disabled:opacity-50"
    >
      <X size={14} strokeWidth={1.5} />
      {label}
    </button>
  );
}

/* ---------- Wellness check-in ---------- */

const WELLNESS_FIELD_LABEL: Record<WellnessField, string> = {
  sleepQuality: 'sleep quality',
  sleepHours: 'sleep (hours)',
  energy: 'energy',
};

function WellnessCheckinCard({
  item,
  todayLocalIso,
}: {
  item: WellnessCheckinPromptItem;
  todayLocalIso: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sleepQuality, setSleepQuality] = useState(7);
  const [energy, setEnergy] = useState(7);
  const [sleepHours, setSleepHours] = useState('');

  const showsSlider = (f: WellnessField) => item.missingFields.includes(f);

  const submit = () => {
    setError(null);
    const fd = new FormData();
    fd.set('date', todayLocalIso);
    if (showsSlider('sleepQuality')) fd.set('sleepQuality', String(sleepQuality));
    if (showsSlider('energy')) fd.set('energy', String(energy));
    if (showsSlider('sleepHours') && sleepHours.trim() !== '') fd.set('sleepHours', sleepHours);

    startTransition(async () => {
      const result = await logJournalEntry(fd);
      if (!result.ok) {
        setError(result.error ?? 'Could not save.');
        return;
      }
      router.refresh();
    });
  };

  const skip = () => {
    setError(null);
    startTransition(async () => {
      if (item.defaultOnSkip) {
        const fd = new FormData();
        fd.set('date', todayLocalIso);
        for (const [field, value] of Object.entries(item.defaultOnSkip)) {
          fd.set(field, String(value));
        }
        await logJournalEntry(fd);
      }
      await recordPromptSkip(todayLocalIso, item.id);
      router.refresh();
    });
  };

  return (
    <PromptShell
      tone="neutral"
      icon={<HeartPulse size={20} strokeWidth={1.5} className="text-bone-mute shrink-0 mt-0.5" />}
      label="prompt - wellness check-in"
      title="How's today shaping up?"
      footer={
        <div className="flex items-center justify-between gap-2 pt-1">
          {error && <span className="text-xs text-signal-miss">{error}</span>}
          <div className="flex items-center gap-2 ml-auto">
            <SkipButton
              disabled={isPending}
              onSkip={skip}
              label={item.defaultOnSkip ? 'Use default' : 'Skip'}
            />
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-ink font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Log it'}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {showsSlider('sleepHours') && (
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">
              {WELLNESS_FIELD_LABEL.sleepHours}
            </span>
            <input
              type="number"
              step="0.5"
              min={0}
              max={16}
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              placeholder="7.5"
              className="w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none"
            />
          </label>
        )}
        {showsSlider('sleepQuality') && (
          <Range
            label={WELLNESS_FIELD_LABEL.sleepQuality}
            value={sleepQuality}
            onChange={setSleepQuality}
          />
        )}
        {showsSlider('energy') && (
          <Range label={WELLNESS_FIELD_LABEL.energy} value={energy} onChange={setEnergy} />
        )}
      </div>
    </PromptShell>
  );
}

function Range({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute flex items-center justify-between">
        <span>{label}</span>
        <span className="text-accent tabular-nums">{value}/10</span>
      </span>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
  );
}

/* ---------- Unlogged session ---------- */

function sessionPrescription(t: SessionTarget): string {
  if (t.paceZone && t.distanceKmMin && t.distanceKmMax) {
    const distRange = t.distanceKmMin === t.distanceKmMax
      ? `${t.distanceKmMin.toFixed(1)} km`
      : `${t.distanceKmMin.toFixed(1)}–${t.distanceKmMax.toFixed(1)} km`;
    return `${distRange} @ ${formatBand(t.paceZone)}`;
  }
  if (t.durationMinMin && t.durationMinMax) {
    return `${t.durationMinMin}–${t.durationMinMax} min`;
  }
  if (t.paceZone) return `pace ${formatBand(t.paceZone)}`;
  return 'see plan';
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dowLabel(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00Z');
  return DOW_LABELS[(d.getUTCDay() + 6) % 7];
}

function UnloggedSessionCard({
  item,
  todayLocalIso,
}: {
  item: UnloggedSessionPromptItem;
  todayLocalIso: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const skip = () => {
    startTransition(async () => {
      await recordPromptSkip(todayLocalIso, item.id);
      router.refresh();
    });
  };

  return (
    <PromptShell
      tone="warn"
      icon={<ClipboardEdit size={20} strokeWidth={1.5} className="text-signal-warn shrink-0 mt-0.5" />}
      label="prompt - unlogged session"
      title={`${dowLabel(item.session.dateIso)}'s ${item.session.session.label}`}
      footer={
        <div className="flex items-center justify-end pt-1">
          <SkipButton disabled={isPending} onSkip={skip} />
        </div>
      }
    >
      <div className="font-mono text-xs text-bone-dim">
        {sessionPrescription(item.session.session)} · {item.session.daysAgo} day
        {item.session.daysAgo === 1 ? '' : 's'} ago, no matching activity
      </div>
      <ManualResultForm defaultDate={item.session.dateIso} />
    </PromptShell>
  );
}

/* ---------- Manual/synced overlap ---------- */

function formatDateNZ(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' });
}

function ManualOverlapCard({
  item,
  todayLocalIso,
}: {
  item: ManualOverlapPromptItem;
  todayLocalIso: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const keepSynced = () => {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      await recordPromptSkip(todayLocalIso, item.id);
      router.refresh();
    });
  };

  const restoreManual = () => {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await restoreManualActivity(item.manualActivityId);
      if (!result.ok) {
        setError(result.error ?? 'Could not restore.');
        return;
      }
      // A warning still means success — restoreManualActivity already recorded
      // the skip and revalidated, so surface the note and refresh same as a
      // clean success.
      if (result.warning) setWarning(result.warning);
      router.refresh();
    });
  };

  return (
    <PromptShell
      tone="neutral"
      icon={<RefreshCw size={20} strokeWidth={1.5} className="text-bone-mute shrink-0 mt-0.5" />}
      label="prompt - manual entry superseded"
      title="Synced run replaced your manual entry"
      footer={
        <div className="flex items-center justify-between gap-2 pt-1">
          {error && <span className="text-xs text-signal-miss">{error}</span>}
          {!error && warning && <span className="text-xs text-signal-warn">{warning}</span>}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={isPending}
              onClick={restoreManual}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-bone-dim hover:text-bone border border-ink-line hover:border-ink-line-bold disabled:opacity-50"
            >
              Restore manual
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={keepSynced}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-ink font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
            >
              Keep synced
            </button>
          </div>
        </div>
      }
    >
      <div className="font-mono text-xs text-bone-dim leading-relaxed">
        Your manual entry for {formatDateNZ(item.dateIso)} was superseded by a synced activity, so it
        isn't double-counted.
      </div>
    </PromptShell>
  );
}

/* ---------- Integration error ---------- */

const ADAPTER_LABEL: Record<IntegrationErrorPromptItem['adapterId'], string> = {
  strava: 'Strava',
  garmin: 'Garmin',
  coros: 'COROS',
  polar: 'Polar',
};

function IntegrationErrorCard({
  item,
  todayLocalIso,
}: {
  item: IntegrationErrorPromptItem;
  todayLocalIso: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const skip = () => {
    startTransition(async () => {
      await recordPromptSkip(todayLocalIso, item.id);
      router.refresh();
    });
  };

  return (
    <PromptShell
      tone="miss"
      icon={<AlertTriangle size={20} strokeWidth={1.5} className="text-signal-miss shrink-0 mt-0.5" />}
      label="prompt - integration error"
      title={`${ADAPTER_LABEL[item.adapterId]} connection issue`}
      footer={
        <div className="flex items-center justify-between gap-2 pt-1">
          <Link href="/settings" className="font-mono text-xs text-bone-dim hover:text-accent transition-colors">
            Open Settings &rarr;
          </Link>
          <SkipButton disabled={isPending} onSkip={skip} label="Dismiss" />
        </div>
      }
    >
      <div className="font-mono text-xs text-bone-dim leading-relaxed">{item.message}</div>
    </PromptShell>
  );
}
