import { formatBand } from '@/lib/plans/derive';
import type { SessionTarget } from '@/lib/plans/types';

/**
 * SessionSwapRow / SessionSwapCell — redesign spec §2.4. A structured
 * before/after display for a prescribed session the coach pipeline
 * changed, replacing free-text change descriptions wherever the
 * underlying data already has both sides (the raw and adjusted
 * SessionTarget for the same day) — see NextSessionCard and Patrol's
 * compliance list. Where a change is still just a plain string (e.g.
 * CoachAdjustmentCard's `changes` list), it stays prose per spec's own
 * "don't force-fit" caveat — this component is never used there.
 *
 * Two visual shapes for two contexts: `SessionSwapRow` is the bordered
 * card-block treatment (verdict card / next-session card); `SessionSwapCell`
 * is the compact inline arrow for a compliance-list table row.
 */

export function sessionPrescription(t: SessionTarget): string {
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

/** True when two sessions for the same slot differ enough to show a swap. */
export function sessionsDiffer(a: SessionTarget, b: SessionTarget): boolean {
  return a.label !== b.label;
}

export function SessionSwapRow({ oldSession, newSession }: { oldSession: SessionTarget; newSession: SessionTarget }) {
  return (
    <div className="flex items-center gap-3.5 flex-wrap bg-ink-shadow border border-ink-line rounded-2xl px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-display uppercase text-[15px] line-through text-bone-mute">{oldSession.label}</span>
        <span className="font-mono text-[11px] line-through text-bone-mute">{sessionPrescription(oldSession)}</span>
      </div>
      <span className="text-k-accent text-lg shrink-0">→</span>
      <div className="flex flex-col gap-0.5">
        <span className="font-display uppercase text-[15px] text-bone">{newSession.label}</span>
        <span className="font-mono text-[11px] text-bone-dim">{sessionPrescription(newSession)}</span>
      </div>
    </div>
  );
}

export function SessionSwapCell({ oldSession, newSession }: { oldSession: SessionTarget; newSession: SessionTarget }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="line-through text-bone-mute text-sm">{oldSession.label}</span>
      <span className="text-signal-warn text-sm">→</span>
      <span className="text-bone text-sm">{newSession.label}</span>
    </div>
  );
}
