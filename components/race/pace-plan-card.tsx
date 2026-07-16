'use client';

import { useState } from 'react';
import { formatSpk, formatDuration } from '@/lib/plans/derive';
import type { PacePlan, PaceStrategy } from '@/lib/race/execution-pure';

const STRAT_LABEL: Record<PaceStrategy, string> = {
  even: 'Even',
  negative: 'Negative',
  progressive: 'Progressive',
};
const STRAT_DESC: Record<PaceStrategy, string> = {
  even: 'Hold goal pace the whole way. Simplest to execute, least margin for error.',
  negative: 'Start ~1.5% easier, finish ~1.5% faster. The classic way to run a PR.',
  progressive: 'Ramp steadily from conservative to strong across the race.',
};

export function PacePlanCard({ pacing }: { pacing: Record<PaceStrategy, PacePlan> }) {
  const [strat, setStrat] = useState<PaceStrategy>('even');
  const plan = pacing[strat];

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">pacing strategy</div>

      <div className="flex gap-2 flex-wrap">
        {(Object.keys(pacing) as PaceStrategy[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStrat(s)}
            className={
              'px-3 py-2 rounded-lg text-sm border transition-colors ' +
              (s === strat
                ? 'border-accent text-accent bg-accent-faint'
                : 'border-ink-line text-bone-dim hover:border-ink-line-bold hover:text-bone')
            }
          >
            {STRAT_LABEL[s]}
          </button>
        ))}
      </div>

      <p className="text-sm text-bone-dim leading-relaxed">{STRAT_DESC[strat]}</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-widest text-bone-mute text-left">
              <th className="py-2 font-normal">Split</th>
              <th className="font-normal">Pace</th>
              <th className="font-normal">Segment</th>
              <th className="font-normal text-right">Elapsed</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {plan.segments.map((seg, i) => (
              <tr key={i} className="border-t border-ink-line">
                <td className="py-2 text-bone">{seg.toKm}km</td>
                <td className="text-bone-dim">{formatSpk(seg.paceSpk)}/km</td>
                <td className="text-bone-mute">{formatDuration(seg.segmentTimeS)}</td>
                <td className="text-right text-bone">{formatDuration(seg.cumulativeTimeS)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
