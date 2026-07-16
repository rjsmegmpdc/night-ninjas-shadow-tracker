'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createManualActivity, type ManualActivityResult } from '@/lib/actions/manual-activity';

/**
 * Stage 2 (daily loop) - P0-7 manual results fallback. Log a run that has no
 * synced data. Templated off the interruption-log form. Mounted on Patrol as
 * the unlogged-session prompt's body (components/patrol/prompt-queue.tsx).
 *
 * Date/time default to "now" using the browser's own local Date parts
 * (getFullYear/getMonth/getDate/getHours/getMinutes), not
 * toISOString().slice(...) — the latter reads the UTC date/time, which is
 * wrong for NZ (UTC+12/13) for a large chunk of the day.
 */

const inputClass =
  'w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function nowLocalDateIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowLocalTimeHm(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function ManualResultForm({
  defaultDate,
  defaultTime,
}: {
  /** Prefills the date field, e.g. a missed prescribed session's date. Falls back to today. */
  defaultDate?: string;
  /** Prefills the time field. Falls back to now. */
  defaultTime?: string;
} = {}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualActivityResult | null>(null);
  const [submittedSummary, setSubmittedSummary] = useState<string | null>(null);

  const today = defaultDate ?? nowLocalDateIso();
  const now = defaultTime ?? nowLocalTimeHm();

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => {
      const r = await createManualActivity(fd);
      setResult(r);
      if (r.ok) {
        const distanceKm = Number(fd.get('distance_km'));
        const durationMin = Number(fd.get('duration_min'));
        const mins = Math.floor(durationMin);
        const secs = Math.round((durationMin - mins) * 60);
        setSubmittedSummary(`${distanceKm.toFixed(1)}km · ${mins}:${pad2(secs)}`);
        router.refresh();
      }
    });
  };

  const logAnother = () => {
    setSubmittedSummary(null);
    setResult(null);
    formRef.current?.reset();
  };

  if (submittedSummary) {
    return (
      <div className="border border-ink-line rounded-xl p-6 space-y-3">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          manual result
        </div>
        <div className="rounded-lg p-3 text-sm bg-signal-ok/10 border border-signal-ok/40 text-signal-ok">
          Logged: {submittedSummary}
        </div>
        <button
          type="button"
          onClick={logAnother}
          className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover"
        >
          <Plus size={16} strokeWidth={1.5} />
          Log another
        </button>
      </div>
    );
  }

  return (
    <div className="border border-ink-line rounded-xl p-6 space-y-5">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
        log a manual result
      </div>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="distance (km)">
            <input name="distance_km" type="number" step="0.01" min="0" className={inputClass} placeholder="10.0" />
          </Field>
          <Field label="duration (min)">
            <input name="duration_min" type="number" step="0.1" min="0" className={inputClass} placeholder="50.0" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="date">
            <input name="date" type="date" className={inputClass} defaultValue={today} />
          </Field>
          <Field label="time">
            <input name="time" type="time" className={inputClass} defaultValue={now} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="avg HR (optional)">
            <input name="avg_hr" type="number" step="1" min="30" max="230" className={inputClass} placeholder="150" />
          </Field>
          <Field label="RPE 1-10 (optional)">
            <input name="rpe" type="number" step="1" min="1" max="10" className={inputClass} placeholder="6" />
          </Field>
        </div>

        <Field label="notes (optional)">
          <input name="notes" type="text" className={inputClass} placeholder="e.g. easy shakeout, watch died mid-run" />
        </Field>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} strokeWidth={1.5} />
          {isPending ? 'Saving...' : 'Log it'}
        </button>
      </form>

      {result && !result.ok && (
        <div className="rounded-lg p-3 text-sm bg-signal-miss/10 border border-signal-miss/40 text-signal-miss">
          {result.error}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">{label}</span>
      {children}
    </label>
  );
}
