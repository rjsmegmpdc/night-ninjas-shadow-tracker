import { Card, CardLabel } from '@/components/ui/card';
import { getCoachRead } from '@/lib/analysis/coach-read';

/**
 * Stage 4 (daily loop) - PRD 8.5's "Coach read": deterministic assessment of
 * the most recent run. Self-contained async server component (same pattern
 * as RaceCountdown) - it owns its own read via getCoachRead() rather than
 * threading another value through PatrolDashboard's props, since the data it
 * needs isn't otherwise computed on Patrol.
 *
 * Hidden entirely when there's no activity yet to read (getCoachRead()
 * returns null) - same silent-when-empty posture as the prompt queue.
 */
export async function CoachReadCard() {
  const read = await getCoachRead();
  if (!read) return null;

  return (
    <Card className="space-y-3">
      <CardLabel>coach read</CardLabel>
      <div className="font-display tracking-wide-display text-xl text-bone leading-snug">
        {read.headline}
      </div>
      <div className="font-mono text-sm text-bone-dim leading-relaxed">{read.detail}</div>
      <div className="pt-2 border-t border-ink-line space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">next</div>
        <div className="font-mono text-sm text-accent leading-relaxed">{read.pointer}</div>
      </div>
    </Card>
  );
}
