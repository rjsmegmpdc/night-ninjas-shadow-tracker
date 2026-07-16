import Link from 'next/link';
import { Card, CardLabel } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatTile, type StatTileTone } from '@/components/ui/stat-tile';
import { AlertTriangle, Info } from 'lucide-react';
import { logPageView } from '@/lib/store/instrument';
import { evaluateRecentWeeks, buildReconAggregate, type WeekEvaluation } from '@/lib/analysis/recent-weeks';
import { deriveObservations, type Observation } from '@/lib/analysis/observations';
import { getTrendsBundle } from '@/lib/analysis/trends';
import { MonthlyVolumeCard, ZoneDistributionCard, LoadRecoveryCard } from '@/components/recon/trends-cards';
import { getDb, schema } from '@/lib/db';
import { getActivePlan } from '@/lib/plans/active-plan';

/**
 * Recon — 12-week compliance trends.
 *
 * Four sections:
 *   1. Three big numbers — total km / compliance / long-run consistency
 *      (each with delta vs previous 12 weeks)
 *   2. Compliance heatmap (12 rows × 7 cols)
 *   3. Per-week breakdown table
 *   4. Pattern panel — derived observations
 *
 * Empty states:
 *   - No activities → point to /setup/sync
 *   - No plan      → point to /setup/dojo
 *   - <4 weeks data → "keep training, check back"
 */
export default async function ReconPage() {
  logPageView('/recon');

  const activityCount = await getDb().$count(schema.activities);
  const activePlan = await getActivePlan();

  if (activityCount === 0) {
    return (
      <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-8">
        <Header />
        <EmptyState
          label="recon · no data yet"
          title="No activities synced"
          reason="Recon shows compliance trends across the last 12 weeks. To see anything here, sync your Strava history first."
          action={{ href: '/setup/sync', label: 'Run initial sync' }}
        />
      </div>
    );
  }

  if (!activePlan) {
    return (
      <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-8">
        <Header />
        <EmptyState
          label="recon · plan not configured"
          title="Plan not set up yet"
          reason="Recon compares your last 12 weeks of activities against your plan-of-record. You have synced data but haven't completed the wizard's plan setup."
          action={{ href: '/setup/dojo', label: 'Configure plan' }}
        />
      </div>
    );
  }

  const result = await evaluateRecentWeeks(12);
  const aggregate = await buildReconAggregate();
  const trends = await getTrendsBundle();

  // Need at least 4 weeks of evaluable data for trends to be meaningful
  const evaluableCount = result.weeks.filter((w) => w.compliance).length;
  if (evaluableCount < 4) {
    return (
      <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-8">
        <Header />
        <Card className="space-y-4 max-w-2xl border-bone-mute/30">
          <CardLabel>not enough data yet</CardLabel>
          <p className="text-bone-dim text-sm leading-relaxed">
            Recon needs at least 4 weeks of training history with an active
            plan to show meaningful compliance trends. You currently have {evaluableCount}{' '}
            week{evaluableCount === 1 ? '' : 's'} of evaluable data.
          </p>
          <p className="text-bone-dim text-sm leading-relaxed">
            Keep training and check back here in a few weeks. Until then,
            <Link href="/patrol" className="text-accent hover:text-accent-hover transition-colors"> Patrol </Link>
            shows compliance for the current week.
          </p>
        </Card>

        {/* Volume / intensity / load trends work from raw activity data, so
            they're shown even before compliance trends are meaningful. */}
        {trends.hasData && (
          <div className="space-y-6">
            <MonthlyVolumeCard monthly={trends.monthly} />
            <div className="grid lg:grid-cols-2 gap-6">
              <ZoneDistributionCard zones={trends.zones} />
              <LoadRecoveryCard load={trends.load} />
            </div>
          </div>
        )}
      </div>
    );
  }

  const observations = deriveObservations(result.weeks);

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-8">
      <Header />

      {/* Three big numbers */}
      {aggregate && <AggregateRow aggregate={aggregate} />}

      {/* R2 - volume / intensity / load-recovery trends from activity data */}
      {trends.hasData && (
        <div className="space-y-6">
          <MonthlyVolumeCard monthly={trends.monthly} />
          <div className="grid lg:grid-cols-2 gap-6">
            <ZoneDistributionCard zones={trends.zones} />
            <LoadRecoveryCard load={trends.load} />
          </div>
        </div>
      )}

      {/* Compliance heatmap */}
      <ComplianceHeatmap weeks={result.weeks} />

      {/* Per-week breakdown */}
      <WeekBreakdown weeks={result.weeks} />

      {/* Observations */}
      {observations.length > 0 && <ObservationsPanel observations={observations} />}
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-ink-line pb-6 space-y-1">
      <span className="nn-caps">analytics - trends</span>
      <h1 className="font-display tracking-wide-display text-5xl uppercase">
        Trends
      </h1>
      <div className="font-mono text-bone-dim text-sm max-w-2xl">
        The Sunday-night screen. Twelve weeks of compliance, with each
        week evaluated against the calendar-aware plan-of-record for that
        week — not a generic plan.
      </div>
    </header>
  );
}

/* ============================================================================
 * Aggregate row — the three big numbers
 * ============================================================================
 */

function AggregateRow({ aggregate }: { aggregate: NonNullable<Awaited<ReturnType<typeof buildReconAggregate>>> }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="nn-caps text-accent">last 12 vs previous 12</span>
      </div>
      <div className="grid md:grid-cols-3 gap-px bg-ink-line border border-ink-line">
        <StatTile
          label="total km"
          value={aggregate.totalKm.current.toFixed(0)}
          unit="km"
          target={deltaTarget(aggregate.totalKm.deltaPct, '%', 'vs prev 12wk')}
          points={aggregate.weeklyKmTrend}
          {...trendInterpretation(aggregate.totalKm.deltaPct)}
        />
        <StatTile
          label="compliance"
          value={aggregate.compliance.currentPct}
          unit="%"
          target={deltaTarget(aggregate.compliance.deltaPp, 'pp', 'vs prev')}
          {...trendInterpretation(aggregate.compliance.deltaPp)}
        />
        <StatTile
          label="long run consistency"
          value={aggregate.longRunConsistency.currentPct}
          unit="%"
          target={deltaTarget(aggregate.longRunConsistency.deltaPp, 'pp', 'vs prev')}
          {...trendInterpretation(aggregate.longRunConsistency.deltaPp)}
        />
      </div>
    </section>
  );
}

/** Plain-fact delta line for StatTile's neutral `target` slot — the colour
 * judgement lives in the interpretation word instead (see trendInterpretation). */
function deltaTarget(delta: number | null | undefined, unit: string, label: string): string {
  if (delta == null) return label;
  return `${delta > 0 ? '+' : ''}${delta}${unit} ${label}`;
}

/** Deterministic, engine-owned interpretation word for a vs-previous-12-weeks
 * delta (spec §2.2) — mirrors the tone the old BigStat's trend arrow/colour
 * already used: positive = ok (climbing), negative = accent (declining),
 * flat/unknown = neutral (steady). */
function trendInterpretation(delta: number | null | undefined): { word: string; tone: StatTileTone } {
  if (delta == null) return { word: 'no baseline', tone: 'neutral' };
  if (delta > 0) return { word: 'climbing', tone: 'ok' };
  if (delta < 0) return { word: 'declining', tone: 'miss' };
  return { word: 'steady', tone: 'neutral' };
}

/* ============================================================================
 * Compliance heatmap — 12 rows × 7 cols
 * ============================================================================
 */

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ComplianceHeatmap({ weeks }: { weeks: WeekEvaluation[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="nn-caps text-accent">compliance heatmap</span>
        <span className="font-mono text-xs text-bone-mute">
          rows = weeks (newest on top) · cells = day-of-week
        </span>
      </div>
      <Card className="space-y-2">
        <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))] gap-1 items-center">
          {/* Header row */}
          <div></div>
          {DOW_LABELS.map((d) => (
            <div key={d} className="text-center font-mono text-[10px] text-bone-mute uppercase">
              {d}
            </div>
          ))}
          {/* One row per week */}
          {weeks.map((week) => (
            <HeatmapRow key={week.weekStartIso} week={week} />
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 pt-3 border-t border-ink-line font-mono text-[10px] text-bone-dim">
          <span>legend:</span>
          <Swatch className="bg-signal-ok" label="hit" />
          <Swatch className="bg-signal-warn" label="off-pace" />
          <Swatch className="bg-accent" label="missed/short" />
          <Swatch className="bg-ink-line" label="rest / no plan" />
        </div>
      </Card>
    </section>
  );
}

function HeatmapRow({ week }: { week: WeekEvaluation }) {
  // Map dow → flag (most-severe of that day's sessions)
  const dowToFlag = new Map<number, string>();
  if (week.compliance) {
    for (const day of week.compliance.days) {
      // Pick the most-severe flag among non-rest sessions
      const nonRest = day.sessions.filter((s) => s.target.type !== 'rest');
      if (nonRest.length === 0) {
        dowToFlag.set(day.dow, 'rest');
        continue;
      }
      // Severity ordering: short/miss > slow/fast/warn > ok > none
      const severityRank: Record<string, number> = {
        short: 5, miss: 5,
        slow: 3, fast: 3, warn: 3,
        ok: 1,
        none: 0,
      };
      let worst = 'none';
      let worstRank = 0;
      for (const s of nonRest) {
        const rank = severityRank[s.flag] ?? 0;
        if (rank > worstRank) {
          worstRank = rank;
          worst = s.flag;
        }
      }
      dowToFlag.set(day.dow, worst);
    }
  }

  const weekLabel = formatWeekLabel(week.weekStartIso);
  const adapted = (week.template?.adaptations?.length ?? 0) > 0;

  return (
    <>
      <div className="font-mono text-[10px] text-bone-dim leading-tight">
        {weekLabel}
        {adapted && <span className="text-signal-warn"> ◆</span>}
      </div>
      {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
        const flag = dowToFlag.get(dow) ?? 'rest';
        return (
          <div
            key={dow}
            className={'h-6 ' + heatmapCellClass(flag)}
            title={`${DOW_LABELS[dow]} ${week.weekStartIso}: ${flag}`}
          />
        );
      })}
    </>
  );
}

function heatmapCellClass(flag: string): string {
  switch (flag) {
    case 'ok':
      return 'bg-signal-ok';
    case 'warn':
    case 'fast':
    case 'slow':
      return 'bg-signal-warn';
    case 'short':
    case 'miss':
      return 'bg-accent';
    case 'none':
      return 'bg-ink-shadow border border-bone-mute/20';
    default:
      return 'bg-ink-line';
  }
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={'w-3 h-3 ' + className} />
      <span>{label}</span>
    </div>
  );
}

function formatWeekLabel(weekStartIso: string): string {
  const d = new Date(weekStartIso);
  return d.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' });
}

/* ============================================================================
 * Week breakdown table
 * ============================================================================
 */

function WeekBreakdown({ weeks }: { weeks: WeekEvaluation[] }) {
  return (
    <section className="space-y-4">
      <span className="nn-caps text-accent">week-by-week</span>
      <Card>
        <div className="grid grid-cols-[60px_80px_1fr_80px_60px_80px_1fr] gap-3 pb-2 border-b border-ink-line font-mono text-[10px] uppercase tracking-widest text-bone-mute">
          <div>week</div>
          <div>phase</div>
          <div>volume</div>
          <div className="text-right">long</div>
          <div className="text-right">ok %</div>
          <div className="text-right">missed</div>
          <div>notes</div>
        </div>
        <div className="divide-y divide-ink-line">
          {weeks.map((week) => (
            <WeekRow key={week.weekStartIso} week={week} />
          ))}
        </div>
      </Card>
    </section>
  );
}

function WeekRow({ week }: { week: WeekEvaluation }) {
  const wkLabel = week.programWeekNumber
    ? `Wk ${week.programWeekNumber}`
    : '—';

  const phase = week.template?.phaseName ?? '—';

  const target = week.template?.totalKmTarget ?? null;
  const volPct = target && target > 0 ? Math.round((week.stats.totalKm / target) * 100) : null;
  const longTarget = week.template?.longRunKmTarget ?? null;

  // Compute ok % and miss count from compliance
  const { okPct, missCount, totalSessions } = computeRowStats(week);

  // Adaptations
  const adaptations = week.template?.adaptations ?? [];
  const adaptationLabels = adaptations.map((a) => a.label).join(' · ');

  return (
    <div className="py-3 grid grid-cols-[60px_80px_1fr_80px_60px_80px_1fr] gap-3 items-center text-sm">
      <div>
        <div className="font-display tracking-wide-display uppercase text-bone">{wkLabel}</div>
        <div className="font-mono text-[10px] text-bone-mute">{formatWeekLabel(week.weekStartIso)}</div>
      </div>
      <div className="font-mono text-xs text-bone-dim">{phase}</div>
      <div className="font-mono text-xs">
        <span className="text-bone tabular-nums">
          {week.stats.totalKm.toFixed(0)}
        </span>
        {target && (
          <span className="text-bone-mute"> / {target} km{volPct !== null && ` (${volPct}%)`}</span>
        )}
      </div>
      <div className="text-right font-mono text-xs">
        <span className="text-bone tabular-nums">
          {week.stats.longRunKm.toFixed(1)}
        </span>
        {longTarget !== null && longTarget > 0 && (
          <span className="text-bone-mute"> / {longTarget}</span>
        )}
      </div>
      <div className="text-right font-mono text-xs tabular-nums">
        {totalSessions > 0 ? (
          <span
            className={
              okPct >= 80
                ? 'text-signal-ok'
                : okPct >= 60
                ? 'text-signal-warn'
                : 'text-accent'
            }
          >
            {okPct}%
          </span>
        ) : (
          <span className="text-bone-mute">—</span>
        )}
      </div>
      <div className="text-right font-mono text-xs tabular-nums">
        {totalSessions > 0 ? (
          <span className={missCount > 0 ? 'text-accent' : 'text-bone'}>
            {missCount}/{totalSessions}
          </span>
        ) : (
          <span className="text-bone-mute">—</span>
        )}
      </div>
      <div className="font-mono text-[10px] text-bone-mute leading-tight">
        {adaptationLabels || '—'}
      </div>
    </div>
  );
}

function computeRowStats(week: WeekEvaluation): {
  okPct: number;
  missCount: number;
  totalSessions: number;
} {
  if (!week.compliance) return { okPct: 0, missCount: 0, totalSessions: 0 };
  let total = 0;
  let ok = 0;
  let missed = 0;
  for (const day of week.compliance.days) {
    for (const session of day.sessions) {
      if (session.target.type === 'rest') continue;
      total++;
      if (session.flag === 'ok' || session.flag === 'warn') ok++;
      if (session.flag === 'miss' || session.flag === 'short' || session.flag === 'none') missed++;
    }
  }
  return {
    okPct: total > 0 ? Math.round((ok / total) * 100) : 0,
    missCount: missed,
    totalSessions: total,
  };
}

/* ============================================================================
 * Observations panel
 * ============================================================================
 */

function ObservationsPanel({ observations }: { observations: Observation[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="nn-caps text-accent">observations</span>
        <span className="font-mono text-xs text-bone-mute">
          patterns from the data — not advice, signals
        </span>
      </div>
      <div className="space-y-3">
        {observations.map((o) => (
          <ObservationCard key={o.kind} observation={o} />
        ))}
      </div>
    </section>
  );
}

function ObservationCard({ observation }: { observation: Observation }) {
  const Icon =
    observation.severity === 'alert' ? AlertTriangle :
    observation.severity === 'warn' ? AlertTriangle :
    Info;

  const borderClass =
    observation.severity === 'alert' ? 'border-accent/40' :
    observation.severity === 'warn' ? 'border-signal-warn/40' :
    'border-bone-mute/40';

  const iconColor =
    observation.severity === 'alert' ? 'text-accent' :
    observation.severity === 'warn' ? 'text-signal-warn' :
    'text-bone-dim';

  return (
    <Card className={'space-y-1 ' + borderClass}>
      <div className="flex items-start gap-3">
        <Icon size={16} strokeWidth={1.5} className={iconColor + ' flex-shrink-0 mt-0.5'} />
        <div className="text-bone-dim text-sm leading-relaxed">{observation.text}</div>
      </div>
    </Card>
  );
}
