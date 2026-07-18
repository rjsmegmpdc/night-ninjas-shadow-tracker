import { Chip } from '@/components/ui/ambient-chips';
import { Separator } from '@/components/shadcn/separator';
import { SyncChip } from '@/components/patrol/sync-chip';
import { GoalRaceChip } from '@/components/patrol/goal-race-chip';
import { FreshnessChip } from '@/components/patrol/freshness-chip';
import { IntensityChip } from '@/components/patrol/intensity-chip';
import { WeekComplianceChip } from '@/components/patrol/week-compliance-chip';
import { WeekAdherenceChip } from '@/components/patrol/week-adherence-chip';
import { StreakCounter } from '@/components/patrol/streak-counter';
import type { AthleteState } from '@/lib/analysis/athlete-state';
import type { IntensityDistribution } from '@/lib/analysis/intensity-distribution';
import type { WeekCompliance } from '@/lib/analysis/compliance';
import type { ProgramPhase } from '@/lib/plans/program-phase';

/**
 * AmbientStrip — redesign spec §2.3/§3.1. Replaces the old header's
 * right-side chip cluster (FreshnessChip/IntensityChip/WeekComplianceChip/
 * WeekAdherenceChip/StreakCounter/SyncButton) entirely, and moves to the
 * very top of Patrol, above the prompt queue. Two visual clusters:
 *
 *   primary   - plan position, sync freshness, goal-race (orientation:
 *               "where am I, is my data current, how far to the goal")
 *   secondary - form/intensity/compliance/adherence/streak (diagnostic
 *               detail, available on hover, smaller and denser)
 *
 * The five secondary components are rendered exactly as they already are
 * (unchanged internally) — their existing "border + icon + mono value,
 * hover-card for detail" visual language is already the reference the new
 * primary chips were built to match, per spec §2.3.
 */
export function AmbientStrip({
  programPhase,
  phaseName,
  compliance,
  todayDow,
  volumePct,
  athleteState,
  intensityDist,
}: {
  programPhase: ProgramPhase;
  phaseName: string;
  compliance: WeekCompliance;
  todayDow: number;
  volumePct: number;
  athleteState: AthleteState | null;
  intensityDist: IntensityDistribution | null;
}) {
  return (
    <div className="flex items-center flex-wrap gap-3.5 pb-[18px] border-b border-ink-line">
      <div className="flex items-center flex-wrap gap-2">
        <Chip title={programPhase.subline}>
          <span className="text-[9px]">◆</span> {planPositionLabel(programPhase, phaseName)}
        </Chip>
        <SyncChip />
        <GoalRaceChip compliance={compliance} todayDow={todayDow} volumePct={volumePct} />
      </div>

      <Separator orientation="vertical" className="h-5" />

      <div className="flex items-center flex-wrap gap-1.5">
        <FreshnessChip state={athleteState} />
        <IntensityChip distribution={intensityDist} />
        <WeekComplianceChip compliance={compliance} />
        <WeekAdherenceChip days={compliance.days} todayDow={todayDow} />
        <StreakCounter />
      </div>
    </div>
  );
}

/**
 * Plan-position label — the five phase-variant strings that used to live
 * as the page H1 (spec §1.5) move here instead. `programPhase.label` is
 * already a deterministic, engine-derived string; for the two phases that
 * carry a week fraction (mid-program build, taper) it's reformatted as
 * "WEEK N/M · PHASE" to match the approved mockup exactly. The other
 * phases (pre-program, race-week, post-race, no-program) have no week
 * fraction to show, so they fall back to `programPhase.label` uppercased
 * as-is — same underlying data, no new computation.
 */
function planPositionLabel(programPhase: ProgramPhase, phaseName: string): string {
  if (
    (programPhase.kind === 'program-week-N' || programPhase.kind === 'taper') &&
    programPhase.programWeekNumber !== null &&
    programPhase.programWeeks !== null
  ) {
    return `WEEK ${programPhase.programWeekNumber}/${programPhase.programWeeks} · ${phaseName.toUpperCase()}`;
  }
  return programPhase.label.toUpperCase();
}
