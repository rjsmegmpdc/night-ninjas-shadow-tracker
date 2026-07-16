import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { PostRaceView } from '@/lib/race/execution';
import { RaceDebriefForm } from './race-debrief-form';

/**
 * Phase 6 part 2 - post-race protocol. Graded recovery prescription (current
 * phase highlighted) + the debrief form + a prompt to set the next goal.
 * Surfaces for the recovery window after race day.
 */
export function PostRaceCard({ postRace, raceName }: { postRace: PostRaceView; raceName: string }) {
  const { recovery, daysSinceRace, debrief } = postRace;

  return (
    <div className="bg-ink-shadow border border-accent/40 rounded-xl p-6 space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">post-race recovery</div>
        <div className="font-mono text-xs text-bone-dim whitespace-nowrap">
          day {daysSinceRace} after {raceName}
        </div>
      </div>

      <div className="space-y-2">
        {recovery.phases.map((p) => (
          <div
            key={p.index}
            className={
              'rounded-lg border p-3 ' +
              (p.active ? 'border-accent/50 bg-accent/5' : 'border-ink-line')
            }
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className={'font-display tracking-wide-display uppercase text-sm ' + (p.active ? 'text-accent' : 'text-bone')}>
                {p.label}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute whitespace-nowrap">
                {p.dayRange}
                {p.active ? ' · now' : ''}
              </span>
            </div>
            <p className="text-sm text-bone-dim leading-relaxed mt-1">{p.guidance}</p>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-ink-line">
        <RaceDebriefForm existing={debrief} />
      </div>

      <div className="pt-3 border-t border-ink-line">
        <Link
          href="/calendar#tune-ups"
          className="inline-flex items-center gap-2 font-display tracking-wide-display uppercase text-sm text-accent hover:text-accent-hover transition-colors"
        >
          Set your next goal
          <ArrowRight size={14} strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
