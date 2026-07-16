'use client';

import { useRef, useState, useTransition } from 'react';
import { CalendarClock } from 'lucide-react';
import { setPlanStartDate, type SetStartDateResult } from '@/lib/actions/plan-start-date';

/**
 * Phase 5 - edit the program start date. Week 1 of the block begins on this
 * date; the matrix and current-week tracking follow it. Auto-derived from the
 * goal race; editable when the block actually began on a different day.
 */
export function StartDateEditor({
  startDate,
  dojoName,
  programWeeks,
}: {
  startDate: string;
  dojoName: string;
  programWeeks: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SetStartDateResult | null>(null);

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => setResult(await setPlanStartDate(fd)));
  };

  return (
    <div className="nn-card p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} strokeWidth={1.5} className="text-accent" />
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          program start date
        </div>
      </div>
      <p className="text-sm text-bone-dim leading-relaxed">
        Week 1 of your {dojoName} block ({programWeeks} weeks) begins on this date.
        It was auto-set from your goal race - adjust it if your block actually
        started on a different day. The matrix and current-week tracking follow it.
      </p>
      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="space-y-1.5 block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">start date</span>
          <input
            name="start_date"
            type="date"
            defaultValue={startDate}
            className="bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone hover:border-ink-line-bold disabled:opacity-50 font-display tracking-wide-display uppercase text-sm"
        >
          {isPending ? 'Saving...' : 'Save start date'}
        </button>
        {result?.ok && <span className="font-mono text-xs text-signal-ok">Saved.</span>}
        {result && !result.ok && <span className="font-mono text-xs text-signal-miss">{result.error}</span>}
      </form>
    </div>
  );
}
