import { logPageView } from '@/lib/store/instrument';
import { getAthleteState } from '@/lib/analysis/athlete-state';
import {
  getWeeklyIntensityHistory,
  getWeeklyMileageHistory,
} from '@/lib/analysis/weekly-history';
import { checkLongRunProportion, type ProgressionSeverity } from '@/lib/analysis/progression';
import { currentWeekRange } from '@/lib/plans/active-plan';
import { AthleteStateCard } from '@/components/strike/athlete-state-card';
import { IntensityHistoryCard } from '@/components/strike/intensity-history-card';
import { MileageTrajectoryCard } from '@/components/strike/mileage-trajectory-card';
import { BiometricsCard } from '@/components/strike/biometrics-card';
import { getBiometricSummary } from '@/lib/analysis/biometrics';
import { StatTile, type StatTileTone } from '@/components/ui/stat-tile';

/**
 * Strike - athlete state visualisation.
 *
 * Phase 2 surface for the data layer built in Session A. Shows current
 * CTL/ATL/TSB and 8-week histories of intensity distribution + mileage.
 *
 * What's NOT here yet (deferred):
 *   - Full PMC line chart (Recharts integration with daily CTL/ATL/TSB
 *     overlay over the 8-week window)
 *   - Hover-over data points
 *   - Year-over-year comparison
 *   - Personal records ranking (the original Strike concept)
 *
 * The hard analytical work is done. The chart-rich visualisations come
 * in a follow-up session when the value-to-effort ratio justifies the
 * Recharts complexity.
 */
export default async function StrikePage() {
  logPageView('/strike');

  // All four queries run in parallel.
  // Calibration is empty for now - Phase 5 builds the profile UI.
  const [athleteState, intensityHistory, mileageHistory, longRunCheck, biometrics] = await Promise.all([
    getAthleteState({}),
    getWeeklyIntensityHistory(8, {}),
    getWeeklyMileageHistory(8),
    (async () => {
      const { startIso } = currentWeekRange();
      return checkLongRunProportion(startIso);
    })(),
    getBiometricSummary(14),
  ]);

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">analytics - athlete state</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Athlete State
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Where you actually are. Fitness, fatigue, form - and how your
          training has been distributed and progressing across the last
          eight weeks.
        </div>
      </header>

      {/* Top: athlete state full-width */}
      <AthleteStateCard state={athleteState} />

      {/* Phase 12 - biometric overview (RHR/HRV/sleep/body battery/stress/weight) */}
      <BiometricsCard summary={biometrics} />

      {/* R2.5 - VO2 max entry point */}
      <a
        href="/vo2max"
        className="block bg-ink-shadow border border-ink-line rounded-xl p-5 hover:border-ink-line-bold transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">aerobic ceiling</div>
            <div className="font-display tracking-wide-display uppercase text-lg text-bone group-hover:text-accent transition-colors">VO2 Max →</div>
          </div>
          <div className="font-mono text-[10px] text-bone-mute max-w-xs text-right">Record a Cooper or Rockport test, enter a lab result, or pull device estimates.</div>
        </div>
      </a>

      {/* Two-column: intensity history + mileage trajectory */}
      <div className="grid lg:grid-cols-2 gap-6">
        <IntensityHistoryCard history={intensityHistory} />
        <MileageTrajectoryCard history={mileageHistory} />
      </div>

      {/* Long-run snapshot - this week's long run proportion.
          Redesign spec §1.2/§3.13 - extends the hairline stat-grid pattern
          (already used on Patrol's top row / Recon's aggregate row) here in
          place of the old ad hoc 3-number grid, using the shared StatTile.
          Proportion and growth are the two direct inputs to the engine's
          `severity` classification, so both tiles surface that same
          engine-owned word; the raw long-run distance has no such
          classification (severity is a function of proportion + growth, not
          the absolute km), so its word stays purely descriptive. */}
      {longRunCheck && (
        <div className="space-y-4">
          <span className="nn-caps text-accent">long run - this week</span>
          <div className="grid grid-cols-3 gap-px bg-ink-line border border-ink-line">
            <StatTile
              label="long run"
              value={longRunCheck.longRunKm}
              unit="km"
              word="this week"
              tone="neutral"
            />
            <StatTile
              label="of weekly total"
              value={longRunCheck.proportionPct.toFixed(0)}
              unit="%"
              {...severityInterpretation(longRunCheck.severity)}
            />
            <StatTile
              label="vs 2 weeks ago"
              value={`${longRunCheck.growthVs2WeeksKm >= 0 ? '+' : ''}${longRunCheck.growthVs2WeeksKm.toFixed(1)}`}
              unit="km"
              {...severityInterpretation(longRunCheck.severity)}
            />
          </div>
          <div className="font-mono text-[11px] leading-relaxed text-bone-dim">
            {longRunCheck.message}
          </div>
        </div>
      )}
    </div>
  );
}

/** Deterministic word for the engine-owned `ProgressionSeverity` enum
 * (spec §2.2) - reused verbatim, not a new judgement invented here. */
function severityInterpretation(severity: ProgressionSeverity): { word: string; tone: StatTileTone } {
  switch (severity) {
    case 'ok':
      return { word: 'on track', tone: 'ok' };
    case 'caution':
      return { word: 'watch', tone: 'warn' };
    case 'risk':
      return { word: 'risk', tone: 'miss' };
  }
}
