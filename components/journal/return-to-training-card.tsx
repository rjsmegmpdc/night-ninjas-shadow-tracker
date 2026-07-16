import { TrendingUp } from 'lucide-react';
import type { Interruption, ReturnPhase } from '@/lib/analysis/interruptions-pure';

/**
 * Phase 4 - graded return-to-training guidance for a recently-resolved injury
 * or illness. Guidance only - the athlete chooses to follow it. Renders
 * nothing when no return ramp is in progress.
 *
 * DESIGN-SPEC §3.4: stays a base card - ActiveInterruptionBanner is this
 * screen's only hero. The accent-tinted full border/background this card
 * used to carry is replaced with the plain base shell; the accent read
 * still comes through in the icon and phase label.
 */
export function ReturnToTrainingCard({
  returns,
}: {
  returns: { interruption: Interruption; phase: ReturnPhase }[];
}) {
  if (returns.length === 0) return null;

  return (
    <div className="space-y-4">
      {returns.map(({ interruption, phase }) => (
        <div key={interruption.id} className="nn-card p-6 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} strokeWidth={1.5} className="text-accent" />
            <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
              return to training - {labelFor(interruption)}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent ml-auto">
              {phase.label} · {phase.phase}/{phase.totalPhases}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">suggested volume</span>
              <span className="font-mono text-xs text-bone-dim">{Math.round(phase.volumeFraction * 100)}% of normal</span>
            </div>
            <div className="relative h-3 bg-ink-shadow border border-ink-line rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                style={{ width: `${Math.min(phase.volumeFraction * 100, 100)}%` }}
              />
            </div>
          </div>

          <p className="text-sm text-bone-dim leading-relaxed">{phase.guidance}</p>
        </div>
      ))}
    </div>
  );
}

function labelFor(i: Interruption): string {
  return i.bodyRegion ? `${i.type} (${i.bodyRegion})` : i.type;
}
