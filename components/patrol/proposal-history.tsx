import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdjustmentHistoryRow, AdjustmentStatus } from '@/lib/plans/adjustment-history';

/**
 * Phase 3b part 2 / redesign spec §3.12 - the coach proposal history list
 * (server component). Reverse-chronological audit trail of every
 * state-aware adjustment.
 *
 * Each row reads as a *compressed* verdict card - headline + why-chips
 * shape, no decision buttons (history is a record, not a pending
 * decision) - per spec §3.12: "for visual continuity with the live Patrol
 * card the athlete already recognises."
 *
 * Judgment call, flagged per the brief: this does NOT reuse the actual
 * VerdictCard component. That shell (p-6, space-y-4, a 27px headline meant
 * to be the one hero moment on a page) is sized for a single card, not a
 * potentially 200-row list (getPlanAdjustmentsHistory's default limit) -
 * embedding it per row would read as a long column of oversized cards
 * rather than a scannable audit trail. Instead this matches VerdictCard's
 * *visual grammar* at row scale: icon + eyebrow/shift top row, a
 * status-coloured headline, prose detail (the existing `rationale`), and a
 * why-chip-styled meta row (reusing VerdictCard's exact why-chip classes)
 * in place of the old plain-text meta line - same look, tighter footprint,
 * no buttons. If this reads as too different from the live card once seen
 * in context, the alternative is the full VerdictCard per row - flagging
 * for review rather than assuming.
 */

const TRIGGER_LABEL: Record<string, string> = {
  'acwr-high': 'ACWR rail',
  'acwr-caution': 'ACWR caution',
  'tsb-low': 'Low form',
  overreached: 'Overreached',
  monotony: 'Monotony',
  'sickness-window': 'Illness',
  'travel-window': 'Travel',
};

const STATUS_TONE: Record<AdjustmentStatus, string> = {
  pending: 'text-signal-warn',
  applied: 'text-signal-ok',
  'auto-applied': 'text-signal-ok',
  dismissed: 'text-bone-mute',
};

const STATUS_HEADLINE: Record<AdjustmentStatus, string> = {
  pending: 'Adjustment proposed',
  applied: 'Adjustment applied',
  'auto-applied': 'Week adjusted automatically',
  dismissed: 'Adjustment dismissed',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

function WhyChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] text-bone-dim border border-ink-line rounded-md px-2.5 py-1.5 bg-ink-shadow">
      {children}
    </span>
  );
}

export function ProposalHistory({ rows }: { rows: AdjustmentHistoryRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const triggerLabel = TRIGGER_LABEL[r.trigger] ?? r.trigger;
        const tone = STATUS_TONE[r.status];
        const showDelta = r.beforeKm != null && r.afterKm != null && r.beforeKm !== r.afterKm;

        return (
          <div key={r.id} className="nn-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Bot size={18} strokeWidth={1.5} className={cn('shrink-0 mt-0.5', tone)} />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-mute">
                    {triggerLabel}
                  </span>
                  {showDelta && (
                    <span className="font-mono text-xs text-bone-dim whitespace-nowrap shrink-0">
                      {r.beforeKm} → {r.afterKm}km
                    </span>
                  )}
                </div>
                <div className={cn('font-display uppercase text-lg', tone)}>
                  {STATUS_HEADLINE[r.status]}
                </div>
              </div>
            </div>

            <p className="text-sm text-bone-dim leading-relaxed">{r.rationale}</p>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-ink-line">
              {r.weekStartIso && <WhyChip>week of {fmtDate(r.weekStartIso)}</WhyChip>}
              <WhyChip>proposed {fmtDate(r.proposedAt)}</WhyChip>
              {r.decidedAt && r.status !== 'pending' && (
                <WhyChip>
                  {r.status === 'auto-applied' ? 'auto-applied' : r.status} {fmtDate(r.decidedAt)}
                </WhyChip>
              )}
              <WhyChip>{r.mode}</WhyChip>
            </div>
          </div>
        );
      })}
    </div>
  );
}
