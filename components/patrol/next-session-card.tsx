import { Card, CardLabel } from '@/components/ui/card';
import { formatBand } from '@/lib/plans/derive';
import type { SessionTarget, WeekAdaptation } from '@/lib/plans/types';

/**
 * Stage 4 (daily loop) - "next-session card". Relocated from the old side
 * column's "tonight's mission" card (the one permitted relocation for this
 * stage - see PatrolDashboard). Same prescription formatting as before, plus
 * calendar life-event flags so the athlete sees *why* tonight's session
 * looks the way it does without having to scroll back up to the header.
 *
 * `adaptations` is PatrolDashboard's already-resolved
 * `template.adaptations` (from resolveWeekContext, via the coach-adjustment
 * pipeline) - passed straight through rather than re-querying the calendar
 * here. Filtered to the kinds that represent an actual life event (illness/
 * injury/travel/holiday causing reduced or no training, a tune-up race, or a
 * taper) - 'group-run' and 'ninja-loop' are recurring schedule shape, not a
 * one-off life event, and stay exclusively in the header's full weekly list.
 */
const LIFE_EVENT_KINDS = new Set<WeekAdaptation['kind']>([
  'taper',
  'reduced',
  'no-training',
  'travel-only',
  'tuneup-race',
]);

const ADAPTATION_STYLE: Record<WeekAdaptation['kind'], string> = {
  taper: 'border-accent/60 text-accent bg-accent/5',
  'no-training': 'border-signal-warn/60 text-signal-warn bg-signal-warn/5',
  reduced: 'border-signal-warn/60 text-signal-warn bg-signal-warn/5',
  'travel-only': 'border-signal-warn/60 text-signal-warn bg-signal-warn/5',
  'tuneup-race': 'border-accent/60 text-accent bg-accent/5',
  'group-run': 'border-bone-dim/60 text-bone bg-ink-shadow',
  'ninja-loop': 'border-bone-mute/40 text-bone-mute bg-ink-shadow',
};

function sessionPrescription(t: SessionTarget): string {
  if (t.paceZone && t.distanceKmMin && t.distanceKmMax) {
    const distRange = t.distanceKmMin === t.distanceKmMax
      ? `${t.distanceKmMin.toFixed(1)} km`
      : `${t.distanceKmMin.toFixed(1)}–${t.distanceKmMax.toFixed(1)} km`;
    return `${distRange} @ ${formatBand(t.paceZone)}`;
  }
  if (t.durationMinMin && t.durationMinMax) {
    return `${t.durationMinMin}–${t.durationMinMax} min`;
  }
  if (t.paceZone) return `pace ${formatBand(t.paceZone)}`;
  return 'see plan';
}

export function NextSessionCard({
  session,
  adaptations,
}: {
  session: SessionTarget | null;
  adaptations: WeekAdaptation[];
}) {
  const lifeEvents = adaptations.filter((a) => LIFE_EVENT_KINDS.has(a.kind));

  return (
    <Card className="border-accent/40 space-y-4">
      <CardLabel className="text-accent">tonight's mission</CardLabel>

      {session ? (
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
    </Card>
  );
}
