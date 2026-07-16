'use client';

import { useTransition } from 'react';
import { AlertTriangle, Check, Trash2 } from 'lucide-react';
import { resolveInterruption, deleteInterruption } from '@/lib/actions/interruptions';
import { durationDays, type Interruption } from '@/lib/analysis/interruptions-pure';

/**
 * Phase 4 - the active-interruptions panel on the Journal page. Each active
 * interruption can be Resolved (sets end date to today) or Deleted (logged in
 * error). Renders nothing when nothing is active.
 *
 * DESIGN-SPEC §3.4 / §1.4: this is Journal's one hero card when an
 * interruption is active - the single thing that changes what the rest of
 * the page means - so it takes the elevated shell (ink-panel + tone top
 * border) instead of the old full-border/tinted-background treatment.
 */
export function ActiveInterruptionBanner({ active }: { active: Interruption[] }) {
  const [isPending, startTransition] = useTransition();

  if (active.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);

  const act = (action: (fd: FormData) => Promise<unknown>, id: number) => {
    const fd = new FormData();
    fd.set('id', String(id));
    startTransition(() => {
      action(fd);
    });
  };

  return (
    <div className="nn-card-elevated border-t-2 border-t-signal-warn p-6 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} strokeWidth={1.5} className="text-signal-warn" />
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          active interruption{active.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="divide-y divide-ink-line">
        {active.map((i) => {
          const days = durationDays(i, today);
          return (
            <div key={i.id} className="py-3 flex flex-wrap items-center gap-3 first:pt-0 last:pb-0">
              <div className="flex-1 min-w-[12rem]">
                <div className="text-bone">
                  {i.type}
                  {i.type === 'injury' && i.bodyRegion ? ` · ${i.bodyRegion}` : ''}{' '}
                  <span className="text-bone-mute">· {i.severity}</span>
                </div>
                <div className="font-mono text-xs text-bone-mute mt-0.5">
                  since {i.startDate} · {days} day{days === 1 ? '' : 's'}{i.note ? ` · ${i.note}` : ''}
                </div>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => act(resolveInterruption, i.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-signal-ok border border-signal-ok/40 hover:bg-signal-ok/10 disabled:opacity-50"
              >
                <Check size={14} strokeWidth={1.5} />
                Resolve
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => act(deleteInterruption, i.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-bone-dim border border-ink-line hover:border-signal-miss/40 hover:text-signal-miss disabled:opacity-50"
              >
                <Trash2 size={14} strokeWidth={1.5} />
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
