/**
 * NS dojo command panel.
 * Shows: current 3-week sub-threshold rotation + 3-week discipline score.
 * Rendered on /dojo when Norwegian Singles is the active plan.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { NsGuardReport, GuardSeverity } from '@/lib/analysis/ns-guardrails';

const SHAPE_LABELS = ['Short reps', 'Medium reps', 'Long reps'] as const;

const SEV_TONE: Record<GuardSeverity, string> = {
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  miss: 'text-signal-miss',
};

interface Props {
  weekNumber: number;
  guardReport: NsGuardReport | null;
}

function shapeLabel(weekNum: number, slot: number): string {
  return SHAPE_LABELS[(weekNum + slot) % 3];
}

export function NsDojoPanel({ weekNumber, guardReport }: Props) {
  const score = guardReport?.disciplineScore ?? null;
  const worst = guardReport?.worst ?? 'ok';

  return (
    <div className="nn-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">norwegian singles</div>
          <div className="font-display tracking-wide-display uppercase text-lg text-bone">This week&rsquo;s dojo</div>
        </div>
        {score !== null && (
          <div className="text-right">
            <div className={`font-mono text-3xl font-bold tabular-nums leading-none ${score >= 80 ? 'text-signal-ok' : score >= 50 ? 'text-signal-warn' : 'text-signal-miss'}`}>
              {score}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-bone-mute">discipline score</div>
            <div className={`font-mono text-[10px] uppercase tracking-widest mt-0.5 ${SEV_TONE[worst]}`}>
              {worst === 'ok' ? 'on method' : worst === 'warn' ? 'watch' : 'off method'}
            </div>
          </div>
        )}
      </div>

      {/* Sub-threshold rotation */}
      <div className="space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">sub-threshold rotation — week {weekNumber}</div>
        <div className="grid grid-cols-3 gap-3">
          {([
            { day: 'Tue', slot: 0 },
            { day: 'Thu', slot: 1 },
            { day: 'Sat', slot: 2 },
          ] as const).map(({ day, slot }) => {
            const label = shapeLabel(weekNumber, slot);
            const isShort = label === 'Short reps';
            const isMed = label === 'Medium reps';
            return (
              <div key={day} className="border border-ink-line rounded-lg p-3 space-y-1 bg-ink-shadow">
                <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">{day}</div>
                <div className="font-display tracking-wide-display uppercase text-sm text-bone">{label}</div>
                <div className="font-mono text-[9px] text-bone-mute">
                  {isShort ? '10×3min / 60s float' : isMed ? '6×5min / 60-90s jog' : '3×10min / 90s jog'}
                </div>
              </div>
            );
          })}
        </div>
        <p className="font-mono text-[10px] text-bone-mute leading-relaxed">
          Sub-threshold = LT1-adjacent. Finish each session knowing you could do several more reps.
          If in doubt, go slower — the discipline is the method.
        </p>
      </div>

      {/* Link to patrol for full guard breakdown */}
      <Link
        href="/patrol"
        className="flex items-center justify-between border border-ink-line rounded-lg px-4 py-3 hover:border-accent/40 hover:bg-accent/5 transition-colors group"
      >
        <div>
          <div className="font-mono text-xs text-bone">Full discipline check</div>
          <div className="font-mono text-[10px] text-bone-mute">4 guards + quality-cap meter on patrol</div>
        </div>
        <ArrowRight size={14} strokeWidth={1.5} className="text-bone-mute group-hover:text-accent transition-colors" />
      </Link>
    </div>
  );
}
