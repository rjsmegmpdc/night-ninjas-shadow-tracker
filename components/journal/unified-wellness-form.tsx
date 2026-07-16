'use client';

import { useRef, useState, useTransition } from 'react';
import { HeartPulse } from 'lucide-react';
import { logJournalEntry, type JournalResult } from '@/lib/actions/journal';
import { InterruptionLogForm } from './interruption-log-form';
import type { JournalEntry } from '@/lib/db/schema';

/**
 * Stage 3 - unified Journal surface (PHASES Phase 10, PRD 8.5). One place for
 * the context a device can't see: today's wellness check-in (sleep, energy,
 * work stress, perceived effort, notes) alongside the interruption log.
 * Composes the existing InterruptionLogForm rather than rewriting it.
 *
 * `today` is the athlete's already-saved journal row for today, if any -
 * read server-side by the Journal page and passed down so the sliders open
 * on real values instead of silently resetting to defaults. `todayIso` is
 * the athlete's NZ wall-clock date (same formatInTimeZone-against-timezone
 * derivation the Journal page and Patrol's prompt queue use) passed down
 * explicitly rather than re-derived client-side, so the date this form
 * writes to always matches the date the page just read from.
 */

const inputClass =
  'w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none';

export function UnifiedWellnessForm({
  today,
  todayIso,
}: {
  today: JournalEntry | null;
  todayIso: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<JournalResult | null>(null);
  const [sleepQuality, setSleepQuality] = useState(today?.sleepQuality ?? 7);
  const [energy, setEnergy] = useState(today?.energy ?? 7);
  const [workStress, setWorkStress] = useState(today?.workStress ?? 5);
  const [perceivedEffort, setPerceivedEffort] = useState(today?.perceivedEffort ?? 5);

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => {
      setResult(await logJournalEntry(fd));
    });
  };

  return (
    <div className="border border-ink-line rounded-xl p-6 space-y-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <HeartPulse size={16} strokeWidth={1.5} className="text-bone-mute" />
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
            today&apos;s wellness
          </div>
          {today && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-signal-ok ml-auto">
              saved for today
            </span>
          )}
        </div>

        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
          <input type="hidden" name="date" value={todayIso} />

          <label className="space-y-1.5 block max-w-xs">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">sleep (hours)</span>
            <input
              name="sleepHours"
              type="number"
              step="0.5"
              min={0}
              max={16}
              className={inputClass}
              placeholder="7.5"
              defaultValue={today?.sleepHours ?? undefined}
            />
          </label>

          <Range name="sleepQuality" label="sleep quality" value={sleepQuality} onChange={setSleepQuality} />
          <Range name="energy" label="energy" value={energy} onChange={setEnergy} />
          <Range name="workStress" label="work stress" value={workStress} onChange={setWorkStress} />
          <Range name="perceivedEffort" label="perceived effort (today's session)" value={perceivedEffort} onChange={setPerceivedEffort} />

          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">notes</span>
            <textarea
              name="notes"
              rows={2}
              className={inputClass}
              placeholder="anything the coach can't see"
              defaultValue={today?.notes ?? ''}
            />
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Log today'}
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
            {result.ok ? 'Logged.' : result.error}
          </div>
        )}
      </div>

      <div className="border-t border-ink-line pt-6">
        <InterruptionLogForm />
      </div>
    </div>
  );
}

function Range({
  name, label, value, onChange,
}: { name: string; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="space-y-1.5 block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute flex items-center justify-between">
        <span>{label}</span>
        <span className="text-accent tabular-nums">{value}/10</span>
      </span>
      <input
        name={name}
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
