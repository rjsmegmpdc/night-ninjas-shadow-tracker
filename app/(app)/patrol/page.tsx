import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { Card, CardLabel } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import { Check, AlertCircle, Minus, Minimize2 } from 'lucide-react';
import { SyncStatusBanner } from '@/components/sync/sync-status-banner';
import { PromptQueue } from '@/components/patrol/prompt-queue';
import { AmbientStrip } from '@/components/patrol/ambient-strip';
import { CoachReadCard } from '@/components/patrol/coach-read-card';
import { NextSessionCard } from '@/components/patrol/next-session-card';
import { SessionSwapCell, sessionsDiffer } from '@/components/patrol/session-swap-row';
import { volumeWord, longRunWord, paceWord, hrWord } from '@/components/patrol/stat-tile-words';
import { getPromptQueue } from '@/lib/analysis/prompt-context';
import { getUserTimezone, getArcStatement } from '@/lib/store/settings';
import { EmptyState } from '@/components/ui/empty-state';
import { getDb, schema } from '@/lib/db';
import {
  getActivePlan,
  currentWeekNumber,
  currentWeekRange,
} from '@/lib/plans/active-plan';
import { getActivitiesInRange, aggregateWeekStats } from '@/lib/analysis/week-queries';
import { evaluateWeek, type SessionCompliance } from '@/lib/analysis/compliance';
import { formatSpk } from '@/lib/plans/derive';
import type { SessionTarget } from '@/lib/plans/types';
import { resolveWeekContext } from '@/lib/plans/week-context';
import { logPageView } from '@/lib/store/instrument';
import { ShoeNudgeBanner } from '@/components/shoes/shoe-nudge-banner';
import { ProgramMatrix } from '@/components/patrol/program-matrix';
import { ProgressionFlagCard } from '@/components/patrol/progression-flag-card';
import { getAthleteState } from '@/lib/analysis/athlete-state';
import { getIntensityDistribution } from '@/lib/analysis/intensity-distribution';
import {
  checkMileageProgression,
  checkLongRunProportion,
} from '@/lib/analysis/progression';
import { getProgramPhase } from '@/lib/plans/program-phase';
import { getRampPlanForActivePeriod } from '@/lib/plans/ramp-loader';
import { RampCard } from '@/components/patrol/ramp-card';
import { CoachAdjustmentCard } from '@/components/patrol/coach-adjustment-card';
import { resolveCoachAdjustment } from '@/lib/plans/state-aware-week';
import { NsGuardrailsCard } from '@/components/patrol/ns-guardrails-card';
import { getNsGuardReport } from '@/lib/analysis/ns-guardrails-read';
import { getInterruptionsView } from '@/lib/analysis/interruptions';
import { InterruptionIndicator } from '@/components/patrol/interruption-indicator';

/**
 * Patrol — this week's training loop.
 *
 * Live data version. Three render branches:
 *   1. No synced activities  -> Empty state, point to /setup/sync
 *   2. No active plan        -> "Plan not configured" state, point to wizard
 *   3. Activities + plan     -> Full dashboard with live compliance
 *
 * Redesign spec §3.1 order (top to bottom, once data exists): ambient chips
 * strip -> page title + arc statement -> prompt queue -> coach read (hero
 * verdict card) -> next-session card -> interruption indicator + coach
 * adjustment card -> week stat tiles -> program matrix -> progression
 * flags / ramp card -> compliance list -> shoe nudge banner.
 *
 * SyncStatusBanner only renders in the pre-data empty state now — once
 * activities exist, the ambient strip's SyncChip is the single home for
 * sync status (spec §2.3/§3.1), so showing both would duplicate the same
 * information.
 */
export default async function PatrolPage() {
  logPageView('/patrol');
  const activityCount = await getDb().$count(schema.activities);
  const hasData = activityCount > 0;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-10">
      {!hasData && (
        <>
          <SyncStatusBanner />
          <EmptyState
            label="patrol · no data yet"
            title="No activities synced"
            reason="Patrol shows your current week — sessions, paces, compliance flags. To see anything here, you need to pull your activity history from Strava first."
            action={{ href: '/setup/sync', label: 'Run initial sync' }}
          />
          <p className="font-mono text-xs text-bone-mute max-w-2xl">
            ↳ new to the app? <a href="/help" className="text-bone-dim hover:text-accent transition-colors underline">Read the help</a> for a 2-minute orientation
          </p>
        </>
      )}

      {hasData && <PatrolDashboard />}
    </div>
  );
}

async function PatrolDashboard() {
  const activePlan = await getActivePlan();

  if (!activePlan) {
    // Diagnose what's actually missing rather than show a generic message.
    // getActivePlan() returns null if either the goal race is missing OR
    // it's missing a target time. The user has reasonably enough context
    // to know which one to fix when we tell them precisely.
    const goalRace = await getDb()
      .select()
      .from(schema.races)
      .where(eq(schema.races.isGoal, true))
      .get();

    if (!goalRace) {
      return (
        <EmptyState
          label="patrol · no goal race"
          title="No goal race set"
          reason="Patrol needs a goal race to know what you're training for. Pick a dojo and add a goal race in the wizard."
          action={{ href: '/setup/dojo', label: 'Configure plan' }}
        />
      );
    }

    if (!goalRace.targetTimeS) {
      return (
        <EmptyState
          label="patrol · target time missing"
          title="Target time needed"
          reason={`Your goal race (${goalRace.name}) doesn't have a target time set. Pace zones — easy, tempo, interval — are derived from goal pace, so the plan engine can't run without it. Add a target time on the Calendar page and Patrol will activate.`}
          action={{ href: '/calendar', label: 'Set target time' }}
        />
      );
    }

    // Fallback — shouldn't normally hit this since the two checks above
    // cover what getActivePlan() blocks on
    return (
      <EmptyState
        label="patrol · plan not configured"
        title="Plan not set up yet"
        reason="Patrol compares your activities against a plan. Configuration is incomplete — pick a dojo and set a goal race with a target time to see compliance."
        action={{ href: '/setup/dojo', label: 'Configure plan' }}
      />
    );
  }

  const { engine, params } = activePlan;
  const weekNumber = currentWeekNumber(params) ?? 1;
  const { startIso, endIso } = currentWeekRange();
  const context = await resolveWeekContext({ weekStartIso: startIso, weekEndIso: endIso });
  const rawTemplate = engine.renderWeek(params, weekNumber, context);

  // Phase 3b - state-aware pipeline. In automatic mode (or once a proposal
  // is applied) the adjusted template becomes the week's prescription;
  // compliance and volume targets follow it.
  const coach = await resolveCoachAdjustment({
    dojo: engine.dojo,
    weekStartIso: startIso,
    weekNumber,
    programWeeks: params.programWeeks ?? engine.defaultProgramWeeks,
    rawTemplate,
  });
  const template = coach.template;

  // NS-2/NS-3 - discipline guardrails, only when Norwegian Singles is active.
  const nsReport = engine.dojo === 'norwegian-singles' ? await getNsGuardReport(3) : null;

  const activities = await getActivitiesInRange(startIso, endIso);
  const stats = aggregateWeekStats(activities);
  const compliance = evaluateWeek(template, activities);

  // Phase 2 athlete state surfaces + Phase 3a phase + ramp.
  // All run in parallel.
  const [athleteState, intensityDist, mileageProg, longRunCheck, programPhase, interruptions, promptItems, timezone, arcStatement] =
    await Promise.all([
      getAthleteState({}),
      getIntensityDistribution(startIso, endIso, {}),
      checkMileageProgression(startIso),
      checkLongRunProportion(startIso),
      getProgramPhase(),
      getInterruptionsView(),
      getPromptQueue(),
      getUserTimezone(),
      getArcStatement(),
    ]);
  const todayLocalIso = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
  // Ramp depends on programPhase, so it sequences after - but only triggers
  // a real fetch when phase is pre-program.
  const rampPlan = await getRampPlanForActivePeriod(programPhase);

  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // Mon=0..Sun=6
  const todayPlan = template.days.find((d) => d.dow === todayDow);
  const tonightSession = todayPlan?.sessions[0] ?? null;
  const rawTodayPlan = rawTemplate.days.find((d) => d.dow === todayDow);
  const rawTonightSession = rawTodayPlan?.sessions[0] ?? null;

  // Volume cell: actual / target with %
  const volumePct = template.totalKmTarget > 0
    ? Math.round((stats.totalKm / template.totalKmTarget) * 100)
    : 0;

  // Long run cell: actual / target
  const longPct = template.longRunKmTarget > 0
    ? Math.round((stats.longRunKm / template.longRunKmTarget) * 100)
    : 0;

  // Redesign spec §1.4/§3.1.6: only one hero card per load. CoachReadCard is
  // the hero by default; an active safety rail on CoachAdjustmentCard takes
  // that slot instead, and CoachReadCard steps down to a base card.
  const railIsHero = coach.rail === true;

  const volume = volumeWord(stats.totalKm, volumePct);
  const longRun = longRunWord(stats.longRunKm, longPct);
  const pace = paceWord(compliance);
  const hr = hrWord(athleteState?.formClass ?? null);

  return (
    <>
      {/* Redesign spec §2.3 - ambient chips strip, above everything else. */}
      <AmbientStrip
        programPhase={programPhase}
        phaseName={template.phaseName}
        compliance={compliance}
        todayDow={todayDow}
        volumePct={volumePct}
        athleteState={athleteState}
        intensityDist={intensityDist}
      />

      {/* Page title — stable "Patrol" H1 matching every other screen's
          eyebrow -> H1 -> mono dek pattern (spec §1.5); the five old
          phase-variant strings now live in the ambient strip's plan
          chip instead. Arc statement (spec §2.5) is the athlete's own
          quiet caption underneath - silent when unset. */}
      <header className="space-y-1 border-b border-ink-line pb-5">
        <span className="nn-caps">dashboard · this week</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase leading-none">Patrol</h1>
        <div className="font-mono text-bone-dim text-xs">
          {formatRange(startIso, endIso)} · {programPhase.subline}
        </div>
        {arcStatement && (
          <div className="font-mono text-xs text-bone-mute italic pt-1">&ldquo;{arcStatement}&rdquo;</div>
        )}
      </header>

      {/* Full weekly calendar-adaptation list (all kinds, incl. group-run/
          ninja-loop) - the next-session card only surfaces the "life event"
          subset; this stays the complete weekly picture. */}
      {template.adaptations && template.adaptations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {template.adaptations.map((a, i) => (
            <span
              key={i}
              className={
                'inline-flex items-center gap-1.5 px-2 py-1 border text-[10px] font-mono uppercase tracking-widest ' +
                adaptationStyle(a.kind)
              }
              title={a.detail}
            >
              {a.label}
            </span>
          ))}
        </div>
      )}

      {/* Stage 3 - daily-loop prompt queue. Silent when nothing's missing. */}
      <PromptQueue items={promptItems} todayLocalIso={todayLocalIso} />

      {/* Coach read - Patrol's one hero card (unless a safety rail below takes that slot instead). */}
      <CoachReadCard elevated={!railIsHero} />

      <NextSessionCard
        session={tonightSession}
        rawSession={rawTonightSession}
        adaptations={template.adaptations ?? []}
      />

      {/* Phase 4 - active injury / illness / travel indicator */}
      <InterruptionIndicator active={interruptions.active} />

      {/* Phase 3b - coach proposal / auto-adjustment notice. Hero-elevated only when it's the active safety rail. */}
      <CoachAdjustmentCard
        adjustmentId={coach.adjustmentId}
        status={coach.status}
        rail={coach.rail}
        trigger={coach.trigger}
        rationale={coach.rationale}
        changes={coach.changes}
        rawTotalKm={coach.rawTotalKm}
        adjustedTotalKm={coach.adjustedTotalKm}
        injuryPaused={coach.injuryPaused}
        elevated={railIsHero}
      />

      {/* NS-2/NS-3 - Norwegian Singles discipline guardrails */}
      {nsReport && <NsGuardrailsCard report={nsReport} />}

      {/* Week stat tiles — StatTile grid (spec §2.2), same hairline pattern
          as before, each with a deterministic interpretation word derived
          from numbers already on the page. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line border border-ink-line">
        <StatTile
          label="this week"
          value={stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0'}
          unit="km"
          target={`target ${template.totalKmTarget} · ${volumePct}%`}
          word={volume.word}
          tone={volume.tone}
        />
        <StatTile
          label="long run"
          value={stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : '0.0'}
          unit="km"
          target={`target ${template.longRunKmTarget} · ${longPct}%`}
          word={longRun.word}
          tone={longRun.tone}
        />
        <StatTile
          label="avg pace"
          value={stats.avgPaceSpk ? formatSpk(stats.avgPaceSpk) : '—:—'}
          unit="/km"
          target={`${stats.totalSessions} session${stats.totalSessions === 1 ? '' : 's'} this week`}
          word={pace.word}
          tone={pace.tone}
        />
        <StatTile
          label="avg HR"
          value={stats.avgHr ? Math.round(stats.avgHr).toString() : '—'}
          unit="bpm"
          target={stats.avgHr ? 'weighted by time' : 'no HR data'}
          word={hr.word}
          tone={hr.tone}
        />
      </div>

      {/* Program matrix — coach's-spreadsheet view of the training block */}
      <ProgramMatrix activePlan={activePlan} />

      {/* Progression flags - render only when caution/risk thresholds crossed.
          Stays silent during normal training weeks. */}
      <ProgressionFlagCard mileage={mileageProg} longRun={longRunCheck} />

      {/* Ramp card - visible only during pre-program base.
          Shows the gap between current chronic load and program entry
          expectation, with state-aware verdict. */}
      <RampCard ramp={rampPlan} />

      {/* Two-column body */}
      <div className="grid lg:grid-cols-[3fr_2fr] gap-8">
        {/* Sessions */}
        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <CardLabel>session compliance</CardLabel>
            <span className="font-mono text-xs text-bone-mute">
              {compliance.daysWithSessions} of {template.days.filter((d) => d.sessions.some((s) => s.type !== 'rest')).length} logged
            </span>
          </div>
          <div className="divide-y divide-ink-line">
            {compliance.days.map((day) => {
              const sessionsToShow = day.sessions.filter((s) => s.target.type !== 'rest');
              if (sessionsToShow.length === 0) return null;
              // Redesign spec §2.4 - compare each slot's raw (pre-adjustment)
              // prescription against the adjusted one Patrol actually shows,
              // so a swap can render as a structured before/after cell rather
              // than plain prose. Only when the two sides line up 1:1 by
              // count - if the adjustment restructured the day (added/
              // removed a session), fall back to the plain row rather than
              // force-fitting a mismatched swap display.
              const rawDay = rawTemplate.days.find((d) => d.dow === day.dow);
              const rawSessionsToShow = (rawDay?.sessions ?? []).filter((s) => s.type !== 'rest');
              const canCompareSwap = rawSessionsToShow.length === sessionsToShow.length;
              return sessionsToShow.map((sess, i) => (
                <ComplianceRow
                  key={`${day.dow}-${i}`}
                  dow={day.dow}
                  sess={sess}
                  todayDow={todayDow}
                  rawSession={canCompareSwap ? rawSessionsToShow[i] : undefined}
                />
              ));
            })}
          </div>
        </Card>

        {/* Side column — thin pointer to Journal, which owns wellness */}
        <div className="space-y-5">
          <Card className="space-y-4">
            <CardLabel>wellness · interruptions</CardLabel>
            <div className="font-mono text-xs text-bone-mute leading-relaxed">
              {interruptions.active.length > 0
                ? `↳ ${interruptions.active.length} active interruption${interruptions.active.length === 1 ? '' : 's'} logged. Manage them on the Journal page.`
                : '↳ no active interruptions. Log an injury, illness, or travel break on the Journal page so the plan and risk read stay honest.'}
            </div>
            <Link href="/journal">
              <span className="font-mono text-xs text-bone-dim hover:text-accent transition-colors">
                Open Journal →
              </span>
            </Link>
          </Card>
        </div>
      </div>

      {/* Demoted shoe nudges — useful but no longer part of the hero */}
      <ShoeNudgeBanner />
    </>
  );
}

/* ---------- Helpers ---------- */

function formatRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' });
  };
  return `${fmt(startIso)} — ${fmt(endIso)} ${new Date(endIso).getFullYear()}`;
}

function adaptationStyle(kind: string): string {
  switch (kind) {
    case 'taper':
      return 'border-accent/60 text-accent bg-accent/5';
    case 'no-training':
    case 'reduced':
    case 'travel-only':
      return 'border-signal-warn/60 text-signal-warn bg-signal-warn/5';
    case 'tuneup-race':
      return 'border-accent/60 text-accent bg-accent/5';
    case 'group-run':
      return 'border-bone-dim/60 text-bone bg-ink-shadow';
    case 'ninja-loop':
      return 'border-bone-mute/40 text-bone-mute bg-ink-shadow';
    default:
      return 'border-bone-mute/40 text-bone-mute';
  }
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ComplianceRow({
  dow,
  sess,
  todayDow,
  rawSession,
}: {
  dow: number;
  sess: SessionCompliance;
  todayDow: number;
  /** The pre-adjustment prescription for this slot, when it lines up 1:1 with the adjusted one — renders a swap cell when it differs. */
  rawSession?: SessionTarget;
}) {
  const FlagIcon = {
    ok: Check,
    warn: AlertCircle,
    fast: AlertCircle,
    slow: AlertCircle,
    short: Minimize2,
    miss: AlertCircle,
    none: Minus,
  }[sess.flag];

  const flagColor = {
    ok: 'text-signal-ok',
    warn: 'text-signal-warn',
    fast: 'text-signal-warn',
    slow: 'text-signal-warn',
    short: 'text-accent',
    miss: 'text-accent',
    none: 'text-bone-mute',
  }[sess.flag];

  const swapped = rawSession && sessionsDiffer(rawSession, sess.target);

  return (
    <div className="py-3 grid grid-cols-[60px_1fr_120px_80px_28px] gap-4 items-center">
      <span
        className={
          'font-display tracking-wide-display uppercase text-sm ' +
          (dow === todayDow ? 'text-accent' : 'text-bone-dim')
        }
      >
        {DOW_LABELS[dow]}
      </span>
      {swapped ? (
        <SessionSwapCell oldSession={rawSession!} newSession={sess.target} />
      ) : (
        <div>
          <div className={sess.flag === 'ok' ? 'line-through text-bone-dim' : 'text-bone'}>
            {sess.target.label}
          </div>
          <div className="font-mono text-xs text-bone-mute mt-0.5">
            {sess.message}
          </div>
        </div>
      )}
      <span className="font-mono tabular-nums text-bone">
        {sess.actualKm != null ? `${sess.actualKm.toFixed(1)} km` : '—'}
      </span>
      <span className="font-mono tabular-nums text-bone-dim text-sm">
        {sess.actualPaceSpk ? `${formatSpk(sess.actualPaceSpk)}/km` : '—'}
      </span>
      <FlagIcon size={18} strokeWidth={1.5} className={flagColor} />
    </div>
  );
}
