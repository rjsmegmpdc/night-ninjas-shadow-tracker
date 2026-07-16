import type { AthleteState } from '@/lib/analysis/athlete-state';
import { StatTile, type StatTileTone } from '@/components/ui/stat-tile';

/**
 * AthleteStateCard - large summary of current PMC state for Strike.
 *
 * Shows CTL / ATL / TSB as three StatTiles (redesign spec §2.2/§3.13), with
 * form classification label and confidence rollup. Designed as the dominant
 * card on Strike.
 *
 * Interpretation words: TSB's `formClass` is genuinely engine-owned
 * (`classifyForm(tsb)`, a fixed enum) so it becomes the tile's colour-coded
 * word directly, same discipline as the rest of the app. CTL/ATL have no
 * equivalent engine classification (no "is this fitness level good"
 * threshold exists anywhere in the engine) - inventing one here would
 * violate the "engine owns all numbers/vocabulary" lock, so their words
 * stay purely descriptive (what the metric *is*, not a judgement) and
 * neutral-toned.
 *
 * Includes a "what these mean" footer for users new to the PMC framework.
 */
export function AthleteStateCard({ state }: { state: AthleteState | null }) {
  if (!state) {
    return (
      <div className="nn-card p-6 space-y-3">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          athlete state
        </div>
        <div className="font-mono text-bone-dim text-sm">
          No activity history yet. Sync from Strava on Patrol to populate.
        </div>
      </div>
    );
  }

  const { word: tsbWord, tone: tsbTone } = formTone(state.formClass);

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          athlete state - 8-week window
        </div>
        <div className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
          {state.activityCount} activities - {state.confidence}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <StatTile
          label="ctl"
          value={state.ctl.toFixed(1)}
          target="chronic load"
          word="fitness"
          tone="neutral"
          className="bg-transparent p-0"
        />
        <StatTile
          label="atl"
          value={state.atl.toFixed(1)}
          target="acute load"
          word="fatigue"
          tone="neutral"
          className="bg-transparent p-0"
        />
        <StatTile
          label="tsb"
          value={`${state.tsb >= 0 ? '+' : ''}${state.tsb.toFixed(1)}`}
          word={tsbWord}
          tone={tsbTone}
          className="bg-transparent p-0"
        />
      </div>

      <div className="border-t border-ink-line pt-3 font-mono text-[11px] leading-relaxed text-bone-dim">
        CTL is your fitness floor (28-day exponential average of training points).
        ATL is recent fatigue (7-day average). TSB = CTL - ATL is your form -
        positive means fresh, negative means loaded. Both are in Daniels points,
        a duration-x-intensity unit calibrated by your HR or pace zones.
      </div>
    </div>
  );
}

function formTone(formClass: string): { word: string; tone: StatTileTone } {
  const word = formClass.replace('-', ' ');
  switch (formClass) {
    case 'fresh':
    case 'on-form':
      return { word, tone: 'ok' };
    case 'maintained':
      return { word, tone: 'neutral' };
    case 'loaded':
      return { word, tone: 'warn' };
    case 'overreached':
      return { word, tone: 'miss' };
    default:
      return { word, tone: 'neutral' };
  }
}
