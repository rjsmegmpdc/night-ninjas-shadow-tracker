import { formatDuration } from '@/lib/plans/derive';
import type { FuelingPlan } from '@/lib/race/execution-pure';

/**
 * Phase 6 - race-day fuelling summary. General sea-level guidance; heat /
 * sweat-rate tuning arrives with Phase 7 (weather).
 */
export function FuelingCard({ fueling }: { fueling: FuelingPlan }) {
  const cells = [
    { label: 'carbs / hour', value: `${fueling.carbsPerHrG} g` },
    { label: 'fluid / hour', value: `${fueling.fluidMlPerHr} ml` },
    { label: 'sodium / hour', value: `${fueling.sodiumMgPerHr} mg` },
    { label: 'total carbs', value: `${fueling.totalCarbsG} g` },
    { label: 'gels (~25g)', value: `${fueling.gelCount}` },
    { label: 'gel every', value: fueling.gelIntervalMin ? `${fueling.gelIntervalMin} min` : '-' },
  ];

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">race-day fuelling</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink-line border border-ink-line rounded-lg overflow-hidden">
        {cells.map((c) => (
          <div key={c.label} className="bg-ink p-4">
            <div className="font-display text-2xl text-bone tabular-nums leading-none">{c.value}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute mt-1">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="font-mono text-[10px] text-bone-mute leading-relaxed">
        Baseline for a ~{formatDuration(fueling.durationS)} effort. Train your gut at race
        intake before relying on it; heat and sweat-rate tuning come with weather (Phase 7).
      </p>
    </div>
  );
}
