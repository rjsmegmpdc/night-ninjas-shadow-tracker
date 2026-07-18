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
 * `tone` and `evidence` now come straight from `CoachRead`
 * (lib/analysis/coach-read-pure.ts) - both engine-derived, no invented
 * numbers. `tone` maps directly onto VerdictCard's tone prop (CoachReadTone
 * is a subset of VerdictTone). `evidence` feeds the Why: chip row, rendered
 * only when there's at least one chip - a miss/no-compliance-context read
 * can have zero evidence, and VerdictCard already renders nothing for an
 * empty/undefined whyChips array, so this stays silent-when-empty rather
 * than showing an empty "why" label.
 */
export async function CoachReadCard({ elevated = true }: { elevated?: boolean } = {}) {
  const read = await getCoachRead();
  if (!read) return null;

  return (
    <VerdictCard
      tone={read.tone}
      icon={<Bot size={20} strokeWidth={1.5} />}
      eyebrow="coach read"
      headline={read.headline}
      detail={read.detail}
      whyChips={read.evidence.length > 0 ? read.evidence : undefined}
      elevated={elevated}
      kiero
    >
      <div className="pt-1 space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">next</div>
        <div className="font-mono text-sm text-k-accent leading-relaxed">{read.pointer}</div>
      </div>
    </VerdictCard>
  );
}
