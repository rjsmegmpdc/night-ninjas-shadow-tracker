'use client';

import { useState, useTransition } from 'react';
import { Bot, AlertTriangle, Check, X } from 'lucide-react';
import { VerdictCard, type VerdictTone } from '@/components/ui/verdict-card';
import { Button } from '@/components/shadcn/button';
import { applyPlanAdjustment, dismissPlanAdjustment } from '@/lib/actions/plan-adjustments';

/**
 * Phase 3b / redesign spec §2.1, §2.6 - the coach's voice on the dashboard,
 * now on the unified VerdictCard shell shared with CoachReadCard. All
 * existing behaviour is preserved exactly: the pending/auto-applied/applied
 * copy, the rail-vs-normal tone split, the raw->adjusted shift figure, the
 * injury-paused notice, the plain-prose `changes` list (left as prose per
 * spec §2.4 - it's unstructured text, not old/new pairs, so it isn't
 * force-fit into a SessionSwapRow), and the rail dismiss's extra
 * confirmation sub-step.
 *
 * Renders the state-aware interpretation of the current week:
 *   pending      - proposal with Apply / Dismiss (rail rows need an extra
 *                  confirmation step before dismissal)
 *   auto-applied - notification that automatic mode adjusted the week
 *   applied      - confirmation the athlete accepted a proposal
 *   none/dismissed - renders nothing
 *
 * `elevated` (spec §1.4/§3.1.6): only one hero card per Patrol load. This
 * card is NOT hero by default - CoachReadCard is - but the page passes
 * `elevated=true` here (and `elevated=false` to CoachReadCard) when `rail`
 * is true, since an active safety rail takes the hero slot instead.
 */

export interface CoachCardProps {
  adjustmentId: number | null;
  status: 'none' | 'pending' | 'applied' | 'auto-applied' | 'dismissed';
  rail: boolean;
  trigger: string | null;
  rationale: string;
  changes: string[];
  rawTotalKm: number;
  adjustedTotalKm: number;
  /** Phase 4: automatic mode paused by an active injury/illness. */
  injuryPaused?: boolean;
  /** Redesign spec §1.4 - hero-card treatment. Default false; the page decides. */
  elevated?: boolean;
}

export function CoachAdjustmentCard(props: CoachCardProps) {
  const { adjustmentId, status, rail, rationale, changes, rawTotalKm, adjustedTotalKm, injuryPaused, elevated = false } = props;
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (status === 'none' || status === 'dismissed' || adjustmentId === null) return null;

  const act = (action: (fd: FormData) => Promise<void>) => {
    const fd = new FormData();
    fd.set('id', String(adjustmentId));
    startTransition(() => {
      action(fd);
    });
  };

  const tone: VerdictTone = rail ? 'miss' : status === 'pending' ? 'warn' : 'ok';
  const Icon = rail ? AlertTriangle : Bot;
  const eyebrow = rail ? 'coach - safety rail' : 'coach';
  const headline = (
    status === 'pending' ? (rail ? 'Volume cut required' : 'Adjustment proposed')
    : status === 'auto-applied' ? 'Week adjusted automatically'
    : 'Adjustment applied'
  ).toUpperCase();
  const shift = status === 'pending' ? `${rawTotalKm} → ${adjustedTotalKm}km` : undefined;

  const decisionRow = status === 'pending' ? (
    !confirmingDismiss ? (
      <>
        {/* kiero-2: shadcn Button (variant="default" -> bg-sh-primary/text-sh-primary-foreground,
            same teal-on-ink CTA as before) - pill shape + font via className override,
            the "customize via wrapper classes" pattern from the plan. */}
        <Button
          type="button"
          disabled={isPending}
          onClick={() => act(applyPlanAdjustment)}
          className="rounded-full h-11 px-5 font-sans font-semibold"
        >
          <Check size={14} strokeWidth={1.5} />
          Apply
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => (rail ? setConfirmingDismiss(true) : act(dismissPlanAdjustment))}
          className="rounded-full h-11 px-5 font-sans text-bone-dim hover:text-bone border border-ink-line hover:border-ink-line-bold"
        >
          <X size={14} strokeWidth={1.5} />
          Dismiss
        </Button>
      </>
    ) : (
      <div className="flex items-center gap-3">
        <span className="text-xs text-signal-miss">
          This is an injury-risk rail. It will re-raise until your load ratio drops. Dismiss anyway?
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirmingDismiss(false)}
          className="px-3 py-1.5 rounded-lg text-xs text-bone-dim border border-ink-line hover:border-ink-line-bold"
        >
          Keep
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => act(dismissPlanAdjustment)}
          className="px-3 py-1.5 rounded-lg text-xs text-signal-miss border border-signal-miss/40 hover:bg-signal-miss/10 disabled:opacity-50"
        >
          Dismiss anyway
        </button>
      </div>
    )
  ) : undefined;

  return (
    <VerdictCard
      tone={tone}
      icon={<Icon size={20} strokeWidth={1.5} />}
      eyebrow={eyebrow}
      shift={shift}
      headline={headline}
      detail={rationale}
      elevated={elevated}
      decisionRow={decisionRow}
      kiero
    >
      {injuryPaused && (
        <div className="flex items-start gap-2 rounded-lg border border-signal-warn/40 bg-signal-warn/5 px-3 py-2 text-xs text-signal-warn">
          <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
          <span>Managing an injury - automatic adjustments are paused. This is shown for you to apply, not applied for you.</span>
        </div>
      )}

      {changes.length > 0 && (
        <ul className="font-mono text-xs text-bone-dim space-y-1">
          {changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-bone-mute shrink-0">·</span>
              {c}
            </li>
          ))}
        </ul>
      )}
    </VerdictCard>
  );
}
