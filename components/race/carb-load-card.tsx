import type { CarbLoadPlan } from '@/lib/race/execution-pure';

/**
 * Phase 6 - final-3-days carbohydrate load. Needs athlete weight; prompts to
 * set it when absent.
 */
export function CarbLoadCard({ carbLoad }: { carbLoad: CarbLoadPlan | null }) {
  if (!carbLoad) {
    return (
      <div className="nn-card p-6 space-y-2">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">carb loading</div>
        <p className="text-sm text-bone-dim leading-relaxed">
          Add your weight on the VO2 Max page to get a carb-loading plan.
        </p>
      </div>
    );
  }

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">carb loading - final 3 days</div>
      <div className="grid grid-cols-3 gap-1.5">
        {carbLoad.days.map((d) => (
          <div key={d.daysOut} className="bg-ink-shadow border border-ink-line rounded-lg p-4 text-center">
            <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
              {d.daysOut} day{d.daysOut === 1 ? '' : 's'} out
            </div>
            <div className="font-display text-3xl text-accent tabular-nums leading-none mt-1">{d.gramsCarb}</div>
            <div className="font-mono text-[10px] text-bone-mute">g carbs · ~{d.approxCalories} kcal</div>
          </div>
        ))}
      </div>
      <p className="font-mono text-[10px] text-bone-mute leading-relaxed">{carbLoad.guidance}</p>
    </div>
  );
}
