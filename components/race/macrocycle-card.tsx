import type { MacrocycleContext } from '@/lib/race/execution';
import { formatSpk } from '@/lib/plans/derive';

/**
 * Phase 6 part 2 - macrocycle context. "Nth marathon block this year" plus a
 * year-over-year self-comparison for the current training week. Renders
 * nothing when there is nothing notable to say.
 */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function MacrocycleCard({ macrocycle }: { macrocycle: MacrocycleContext }) {
  const { blockNumber, distanceLabel, yearOverYear } = macrocycle;
  if (blockNumber < 2 && !yearOverYear) return null;

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">macrocycle context</div>

      {blockNumber >= 2 && (
        <p className="text-sm text-bone-dim leading-relaxed">
          This is your <span className="text-bone font-display tracking-wide-display">{ordinal(blockNumber)}</span>{' '}
          {distanceLabel} block this year.
        </p>
      )}

      {yearOverYear && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="this week" km={yearOverYear.thisYearKm} paceSpk={yearOverYear.thisYearPaceSpk} />
            <Stat label="same week last year" km={yearOverYear.lastYearKm} paceSpk={yearOverYear.lastYearPaceSpk} />
          </div>
          {(yearOverYear.deltaKmPct != null || yearOverYear.paceDeltaSpk != null) && (
            <p className="font-mono text-[10px] text-bone-mute">
              {yearOverYear.deltaKmPct != null &&
                `${yearOverYear.deltaKmPct >= 0 ? '+' : ''}${yearOverYear.deltaKmPct}% volume`}
              {yearOverYear.deltaKmPct != null && yearOverYear.paceDeltaSpk != null && ' · '}
              {yearOverYear.paceDeltaSpk != null &&
                `${Math.abs(yearOverYear.paceDeltaSpk)}s/km ${yearOverYear.paceDeltaSpk <= 0 ? 'faster' : 'slower'} avg`}
              {' '}vs last year
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, km, paceSpk }: { label: string; km: number; paceSpk: number | null }) {
  return (
    <div className="bg-ink-shadow border border-ink-line rounded-lg p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">{label}</div>
      <div className="font-display text-2xl text-bone tabular-nums leading-none mt-1">{km} km</div>
      {paceSpk != null && <div className="font-mono text-[10px] text-bone-mute mt-1">{formatSpk(paceSpk)} avg</div>}
    </div>
  );
}
