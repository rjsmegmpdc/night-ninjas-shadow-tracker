import { logPageView } from '@/lib/store/instrument';
import { getRaceExecution } from '@/lib/race/execution';
import { getArcStatement } from '@/lib/store/settings';
import { EmptyState } from '@/components/ui/empty-state';
import { PacePlanCard } from '@/components/race/pace-plan-card';
import { FuelingCard } from '@/components/race/fueling-card';
import { CarbLoadCard } from '@/components/race/carb-load-card';
import { ForecastCard } from '@/components/race/forecast-card';
import { TaperCard } from '@/components/race/taper-card';
import { PostRaceCard } from '@/components/race/post-race-card';
import { MacrocycleCard } from '@/components/race/macrocycle-card';
import { formatDuration } from '@/lib/plans/derive';

/**
 * Race execution (Phase 6) - pacing, fuelling and carb-loading for the goal
 * race, computed from target time + weight. The execution side of the plan.
 */
export default async function RacePage() {
  logPageView('/race');
  const view = await getRaceExecution();
  // Same quiet italic mono caption as Patrol's page-title placement (spec
  // §2.5/§3.6) - reinforces the athlete's own stated stakes wherever the
  // countdown appears. Silent when unset.
  const arcStatement = await getArcStatement();

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-5xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">training - race execution</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">Race Day</h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Pacing, fuelling and carb-loading for your goal race - computed from your
          target time and weight. Plan the execution, not just the training.
        </div>
        {arcStatement && (
          <div className="font-mono text-xs text-bone-mute italic pt-1">&ldquo;{arcStatement}&rdquo;</div>
        )}
      </header>

      {!view ? (
        <EmptyState
          label="race · no goal"
          title="No goal race with a target time"
          reason="Race execution needs a goal race and a target finish time. Set them on the Calendar and the pacing, fuelling and carb-load plans appear here."
          action={{ href: '/calendar#tune-ups', label: 'Set goal race' }}
        />
      ) : (
        <>
          {/* Goal-race summary strip - miniature of Patrol's goal-race chip
              countdown. Not a hero card (Race has none - it's a planning
              screen, not a daily-verdict one); the accent border is a
              modest emphasis, and the countdown figure stays at this
              existing size rather than scaling up (spec §3.6: no
              hero-scaled countdown anywhere). */}
          <div className="bg-ink-shadow border border-accent/40 rounded-xl p-6 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <div className="font-display tracking-wide-display uppercase text-2xl text-bone">{view.race.name}</div>
              <div className="font-mono text-xs text-bone-mute mt-1">
                {view.race.distanceKm}km · target {formatDuration(view.race.targetTimeS)}
              </div>
            </div>
            {view.daysToRace !== null && view.daysToRace >= 0 && (
              <div className="text-right">
                <div className="font-display text-4xl text-accent tabular-nums leading-none">{view.daysToRace}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">days to go</div>
              </div>
            )}
          </div>

          {view.postRace ? (
            <>
              <PostRaceCard postRace={view.postRace} raceName={view.race.name} />
              {view.macrocycle && <MacrocycleCard macrocycle={view.macrocycle} />}
            </>
          ) : (
            <>
              {view.taper && <TaperCard taper={view.taper} />}
              <ForecastCard
                forecast={view.forecast}
                heat={view.heat}
                goalPaceSpk={view.goalPaceSpk}
                heatAdjustedPaceSpk={view.heatAdjustedPaceSpk}
                raceDate={view.race.raceDate}
              />
              <PacePlanCard pacing={view.pacing} />
              <FuelingCard fueling={view.fueling} />
              <CarbLoadCard carbLoad={view.carbLoad} />
              {view.macrocycle && <MacrocycleCard macrocycle={view.macrocycle} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
