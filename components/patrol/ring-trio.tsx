import { Card } from '@/components/shadcn/card';
import { RingGauge } from '@/components/ui/ring-gauge';
import { ACWR_HARD_RAIL, ACWR_CAUTION } from '@/lib/plans/state-awareness';
import type { AthleteState, FormClass } from '@/lib/analysis/athlete-state';

/**
 * RingTrio — kiero-1. Three side-by-side ring gauges mapping Kiero's
 * READINESS/LOAD/SLEEP slots onto metrics Patrol already computes:
 *
 *   FORM       - athleteState.tsb (lib/analysis/athlete-state.ts) - Kiero's
 *                readiness slot. Numeral is the real signed TSB; the arc
 *                fill is a display-only clamp of tsb into a -30..+30 band,
 *                not a fabricated score.
 *   LOAD       - getAcwrNow() (lib/plans/state-aware-week.ts), the same
 *                acute:chronic ratio the state-aware pipeline already
 *                computes for this week's proposal. Arc fill clamps
 *                acwr/ACWR_HARD_RAIL so the ring reads "full" exactly where
 *                the engine's own hard rail fires.
 *   COMPLIANCE - % of this week's scheduled sessions hit so far (the same
 *                calc WeekComplianceChip already does over `compliance`) -
 *                Kiero's sleep slot, repurposed since VELOCITY has no sleep
 *                data.
 *
 * Colour: happy-path default is the mockup's static hue (--k-ring-form/
 * load/compliance - amber/amber/purple, matching the reference exactly).
 * Whenever the metric's own existing thresholds cross into caution/risk
 * (ACWR_CAUTION/HARD_RAIL, overreached form, <80/<50% compliance - the same
 * bands FreshnessChip/WeekComplianceChip already use elsewhere on Patrol),
 * the arc and numeral switch to --nn-signal-warn/miss instead. Fidelity to
 * the mockup when things are fine; one shared risk-colour language with the
 * rest of the page when they're not.
 *
 * Silent when there's no athlete state yet (same posture as the other
 * data-dependent Patrol cards).
 */

type Tone = 'ok' | 'neutral' | 'warn' | 'miss';

function formTone(formClass: FormClass): Tone {
  switch (formClass) {
    case 'fresh':
    case 'on-form':
      return 'ok';
    case 'maintained':
      return 'neutral';
    case 'loaded':
      return 'warn';
    case 'overreached':
      return 'miss';
  }
}

function loadTone(acwr: number | null): Tone {
  if (acwr === null) return 'neutral';
  if (acwr >= ACWR_HARD_RAIL) return 'miss';
  if (acwr >= ACWR_CAUTION) return 'warn';
  return 'ok';
}

// Same 80/50 bands as WeekComplianceChip (components/patrol/week-compliance-chip.tsx)
// and GoalRaceChip's bandTone (components/patrol/goal-race-chip.tsx) - presentation
// convention already established twice elsewhere on Patrol, not a new rule.
function complianceTone(pct: number | null): Tone {
  if (pct === null) return 'neutral';
  if (pct >= 80) return 'ok';
  if (pct >= 50) return 'warn';
  return 'miss';
}

function ringColor(staticVar: string, tone: Tone): string {
  if (tone === 'warn') return 'var(--nn-signal-warn)';
  if (tone === 'miss') return 'var(--nn-signal-miss)';
  return staticVar;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function RingTrio({
  athleteState,
  acwr,
  compliancePct,
}: {
  athleteState: AthleteState | null;
  acwr: number | null;
  compliancePct: number | null;
}) {
  if (!athleteState) return null;

  const { tsb, formClass } = athleteState;
  const fTone = formTone(formClass);
  const lTone = loadTone(acwr);
  const cTone = complianceTone(compliancePct);

  const formPct = clamp01((tsb + 30) / 60) * 100;
  const loadPct = acwr !== null ? clamp01(acwr / ACWR_HARD_RAIL) * 100 : 0;
  const compliancePctFill = compliancePct ?? 0;

  return (
    <Card className="grid grid-cols-3 gap-3 sm:gap-6 px-6 py-8">
      <RingGauge
        value={`${tsb >= 0 ? '+' : ''}${Math.round(tsb)}`}
        label="form"
        pct={formPct}
        color={ringColor('var(--k-ring-form)', fTone)}
      />
      <RingGauge
        value={acwr !== null ? acwr.toFixed(2) : '—'}
        label="load"
        pct={loadPct}
        color={ringColor('var(--k-ring-load)', lTone)}
      />
      <RingGauge
        value={compliancePct !== null ? `${compliancePct}` : '—'}
        unit="%"
        label="compliance"
        pct={compliancePctFill}
        color={ringColor('var(--k-ring-compliance)', cTone)}
      />
    </Card>
  );
}
