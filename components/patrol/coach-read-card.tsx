import { Bot } from 'lucide-react';
import { VerdictCard } from '@/components/ui/verdict-card';
import { getCoachRead } from '@/lib/analysis/coach-read';

/**
 * Stage 4 (daily loop) / redesign spec §2.1 - PRD 8.5's "Coach read":
 * deterministic assessment of the most recent run, now on the unified
 * VerdictCard shell shared with CoachAdjustmentCard. Self-contained async
 * server component (same pattern as RaceCountdown/GoalRaceChip) - it owns
 * its own read via getCoachRead() rather than threading another value
 * through PatrolDashboard's props, since the data it needs isn't otherwise
 * computed on Patrol.
 *
 * Hidden entirely when there's no activity yet to read (getCoachRead()
 * returns null) - same silent-when-empty posture as the prompt queue.
 *
 * `elevated` defaults true (this is Patrol's hero card in the common
 * case), but the page passes false when a safety-rail CoachAdjustmentCard
 * exists that load - only one card earns hero status (spec §1.4/§3.1.6).
 *
 * Tone/why-chips limitation: `CoachRead` (lib/analysis/coach-read-pure.ts)
 * currently exposes only {headline, detail, pointer} - no severity flag or
 * structured evidence array to build genuine why-chips from (the mockup's
 * "HRV ↓11%" style chips need new fields on that type). Out of this
 * component's file scope (lib/ is Quill's this wave) - flagged in the
 * report as a follow-up rather than fabricated here. Tone is fixed to
 * 'accent' (the coach's default voice) until that data exists; the
 * `pointer` line keeps its original "next" treatment via the children slot.
 */
export async function CoachReadCard({ elevated = true }: { elevated?: boolean } = {}) {
  const read = await getCoachRead();
  if (!read) return null;

  return (
    <VerdictCard
      tone="accent"
      icon={<Bot size={20} strokeWidth={1.5} />}
      eyebrow="coach read"
      headline={read.headline}
      detail={read.detail}
      elevated={elevated}
    >
      <div className="pt-1 space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">next</div>
        <div className="font-mono text-sm text-accent leading-relaxed">{read.pointer}</div>
      </div>
    </VerdictCard>
  );
}
