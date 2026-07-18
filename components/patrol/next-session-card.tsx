import Link from 'next/link';
import { CardLabel } from '@/components/ui/card';
import { Card } from '@/components/shadcn/card';
import { SessionSwapRow, sessionPrescription, sessionsDiffer } from '@/components/patrol/session-swap-row';
import type { SessionTarget, WeekAdaptation } from '@/lib/plans/types';

/**
 * Stage 4 (daily loop) / redesign spec §2.4, §2.5, §3.1.5 - "next-session
 * card". Relocated from the old side column's "tonight's mission" card
 * (the one permitted relocation for that stage - see PatrolDashboard). Same
 * prescription formatting as before, plus:
 *
 *   - calendar life-event flags, so the athlete sees *why* tonight's
 *     session looks the way it does without scrolling back up to the
 *     ambient strip;
 *   - a structured SessionSwapRow (spec §2.4) instead of plain prose when
 *     `rawSession` (the pre-adjustment prescription for the same slot)
 *     differs from `session` (the adjusted one Patrol actually shows) -
 *     both sides already exist on the page (rawTemplate vs template), so
 *     this is presentation-only, no new analysis;
 *   - a small right-aligned "Race plan →" link in the footer (spec §2.5) -
 *     relocated here now that GoalLine (its previous home) is retired; the
 *     ambient strip's goal-race chip already covers calendar/races nav, but
 *     Race plan points at pacing/fuelling/carb-load, a different
 *     destination that still needed a home.
 *
 * `adaptations` is PatrolDashboard's already-resolved `template.adaptations`
 * (from resolveWeekContext, via the coach-adjustment pipeline) - passed
 * straight through rather than re-querying the calendar here. Filtered to
 * the kinds that represent an actual life event (illness/injury/travel/
 * holiday causing reduced or no training, a tune-up race, or a taper) -
 * 'group-run' and 'ninja-loop' are recurring schedule shape, not a one-off
 * life event, and stay exclusively in the ambient strip's full weekly list.
 */
const LIFE_EVENT_KINDS = new Set<WeekAdaptation['kind']>([
  'taper',
  'reduced',
  'no-training',
  'travel-only',
  'tuneup-race',
]);

const ADAPTATION_STYLE: Record<WeekAdaptation['kind'], string> = {
  taper: 'border-k-accent/60 text-k-accent bg-k-accent/5',
  'no-training': 'border-signal-warn/60 text-signal-warn bg-signal-warn/5',
  reduced: 'border-signal-warn/60 text-signal-warn bg-signal-warn/5',
  'travel-only': 'border-signal-warn/60 text-signal-warn bg-signal-warn/5',
  'tuneup-race': 'border-k-accent/60 text-k-accent bg-k-accent/5',
  'group-run': 'border-bone-dim/60 text-bone bg-ink-shadow',
  'ninja-loop': 'border-bone-mute/40 text-bone-mute bg-ink-shadow',
};

export function NextSessionCard({
  session,
  rawSession,
  adaptations,
}: {
  session: SessionTarget | null;
  /** The pre-adjustment prescription for the same slot, if different — renders as a SessionSwapRow when it differs from `session`. */
  rawSession?: SessionTarget | null;
  adaptations: WeekAdaptation[];
}) {
  const lifeEvents = adaptations.filter((a) => LIFE_EVENT_KINDS.has(a.kind));
  const swapped = session && rawSession && sessionsDiffer(rawSession, session);

  return (
    <Card className="border-k-accent/40 space-y-4 p-6">
      <CardLabel className="text-k-accent">tonight's mission</CardLabel>

      {session ? (
        swapped ? (
          <SessionSwapRow oldSession={rawSession!} newSession={session} />
        ) : (
          <>
            <div>
              <div className="font-display tracking-wide-display text-2xl uppercase mb-1">
                {session.label}
              </div>
              <div className="font-mono text-bone-dim text-sm">{sessionPrescription(session)}</div>
            </div>
            {session.notes && (
              <div className="font-mono text-xs text-bone-dim leading-relaxed">{session.notes}</div>
            )}
          </>
        )
      ) : (
        <div className="text-bone-dim text-sm">Rest day. Recover.</div>
      )}

      {lifeEvents.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-ink-line">
          {lifeEvents.map((a, i) => (
            <span
              key={i}
              className={
                'inline-flex items-center gap-1.5 px-2 py-1 border text-[10px] font-mono uppercase tracking-widest ' +
                ADAPTATION_STYLE[a.kind]
              }
              title={a.detail}
            >
              {a.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Link
          href="/race"
          className="font-mono text-xs text-bone-mute hover:text-k-accent transition-colors"
          title="Race execution plan - pacing, fuelling, carb-load"
        >
          Race plan →
        </Link>
      </div>
    </Card>
  );
}
