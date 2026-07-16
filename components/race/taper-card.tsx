import { Check } from 'lucide-react';
import type { TaperView } from '@/lib/race/execution';

/**
 * Phase 6 part 2 - taper view. Arrive-fresh discipline checklist plus honest
 * confidence cues drawn from the block's training. Surfaces in the final ~3
 * weeks (taper / race week).
 */
export function TaperCard({ taper }: { taper: TaperView }) {
  return (
    <div className="bg-ink-shadow border border-accent/40 rounded-xl p-6 space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">taper - arrive fresh</div>
        <div className="font-mono text-xs text-bone-dim whitespace-nowrap">
          {taper.daysToRace} day{taper.daysToRace === 1 ? '' : 's'} to go
        </div>
      </div>

      {taper.cues.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-signal-ok/30 bg-signal-ok/5 p-4">
          {taper.cues.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-signal-ok">
              <Check size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      <ul className="space-y-3">
        {taper.checklist.map((item) => (
          <li key={item.key} className="space-y-0.5">
            <div className="font-display tracking-wide-display uppercase text-sm text-bone">{item.title}</div>
            <p className="text-sm text-bone-dim leading-relaxed">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
