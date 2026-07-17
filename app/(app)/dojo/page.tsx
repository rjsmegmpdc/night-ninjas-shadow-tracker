import { Card, CardLabel } from '@/components/ui/card';
import { Wrench } from 'lucide-react';
import { BackfillPlanPeriodButton } from '@/components/dojo/backfill-plan-period-button';
import { getProgramPhase } from '@/lib/plans/program-phase';
import { getRampPlanForActivePeriod } from '@/lib/plans/ramp-loader';
import { getActivePlan, currentWeekNumber } from '@/lib/plans/active-plan';
import { phaseBandFor } from '@/lib/plans/state-awareness';
import { ProgramShapeCard } from '@/components/dojo/program-shape-card';
import { StartDateEditor } from '@/components/dojo/start-date-editor';
import { RampCard } from '@/components/patrol/ramp-card';
import { DojoPicker } from '@/components/dojo/dojo-picker';
import { NsDojoPanel } from '@/components/dojo/ns-dojo-panel';
import { NsDisciplineTrendCard } from '@/components/dojo/ns-discipline-trend-card';
import { getHrAvailability } from '@/lib/analysis/hr-availability';
import { getNsGuardReport, getNsWeeklyTrend } from '@/lib/analysis/ns-guardrails-read';
import { switchDojo } from '@/lib/actions/switch-dojo';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import type { Dojo, PhaseBand } from '@/lib/plans/types';

export default async function DojoPage() {
  const programPhase = await getProgramPhase();
  const rampPlan = await getRampPlanForActivePeriod(programPhase);

  // R2 part 2 - program-shape view (macrocycle phase bar + microcycle week)
  // for the active plan. Only when a plan can be synthesised (goal race set).
  const activePlan = await getActivePlan();
  let programShape: {
    dojoName: string;
    programWeeks: number;
    currentWeek: number | null;
    bands: PhaseBand[];
    micro: { dow: number; type: string; label: string }[];
  } | null = null;
  if (activePlan) {
    const { engine, params } = activePlan;
    const programWeeks = params.programWeeks ?? engine.defaultProgramWeeks;
    const weekNum = currentWeekNumber(params) ?? 1;
    const microTemplate = engine.renderWeek(params, weekNum);
    const bands = Array.from({ length: programWeeks }, (_, i) => phaseBandFor(i + 1, programWeeks));
    const micro = Array.from({ length: 7 }, (_, dow) => {
      const day = microTemplate.days.find((d) => d.dow === dow);
      const sess = day?.sessions.find((s) => s.type !== 'rest') ?? day?.sessions[0];
      return { dow, type: sess?.type ?? 'rest', label: sess?.label ?? 'Rest' };
    });
    programShape = {
      dojoName: engine.displayName,
      programWeeks,
      currentWeek: programPhase.programWeekNumber,
      bands,
      micro,
    };
  }

  // Read currently-selected dojo
  const db = (await getDb());
  const goalRace = await db
    .select()
    .from(schema.races)
    .where(eq(schema.races.isGoal, true))
    .get();
  const dojoRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'plan.dojo'))
    .get();
  const selectedDojo = (dojoRow?.value ?? null) as Dojo | null;
  const hrAvailability = selectedDojo === 'norwegian-singles' ? await getHrAvailability(42) : null;
  const level = (goalRace?.level as 'beginner' | 'intermediate' | 'advanced') ?? 'intermediate';

  // NS-specific data: load only when NS is the active dojo
  const isNsActive = selectedDojo === 'norwegian-singles' && activePlan?.engine.dojo === 'norwegian-singles';
  const [nsGuardReport, nsTrendData] = isNsActive
    ? await Promise.all([getNsGuardReport(3), getNsWeeklyTrend(12)])
    : [null, null];
  const nsWeekNumber = isNsActive ? (currentWeekNumber(activePlan!.params) ?? 1) : 1;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">training - methodology</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Methodology
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-3xl">
          Each dojo brings a different philosophy. Pick the one that
          matches the kind of athlete you want to be. Switch any time
          without losing your history.
        </div>
      </header>

      {/* Dojo selection grid - the centrepiece of this page */}
      <DojoPicker
        selectedDojo={selectedDojo}
        defaultLevel={level}
        onSelectFormAction={switchDojo}
        hrAvailability={hrAvailability}
      />

      {/* R2 part 2 - macrocycle phase bar + microcycle preview for the active plan. */}
      {programShape && <ProgramShapeCard {...programShape} />}

      {/* NS dojo panel + discipline trend — only when Norwegian Singles is active */}
      {isNsActive && (
        <NsDojoPanel weekNumber={nsWeekNumber} guardReport={nsGuardReport} />
      )}
      {isNsActive && nsTrendData && (
        <NsDisciplineTrendCard data={nsTrendData} />
      )}

      {/* Phase 5 - editable program start date (canonical plan_periods.startDate). */}
      {activePlan && (
        <StartDateEditor
          startDate={activePlan.params.startDate}
          dojoName={activePlan.engine.displayName}
          programWeeks={activePlan.params.programWeeks ?? activePlan.engine.defaultProgramWeeks}
        />
      )}

      {/* Ramp analysis - visible only during pre-program base. */}
      {rampPlan && <RampCard ramp={rampPlan} />}

      {/* Maintenance card - tucked at bottom for the backfill case. */}
      <Card className="space-y-4 max-w-2xl border-bone-mute/30">
        <CardLabel className="text-bone-mute flex items-center gap-2">
          <Wrench size={14} strokeWidth={1.5} />
          maintenance
        </CardLabel>
        <p className="text-bone-dim text-sm leading-relaxed">
          If your matrix shows past weeks as <span className="font-mono">(base)</span>
          even though you have an active dojo and goal race, the
          plan_periods row may not have been written. Click below to
          backfill it from your current settings.
        </p>
        <BackfillPlanPeriodButton />
      </Card>
    </div>
  );
}
