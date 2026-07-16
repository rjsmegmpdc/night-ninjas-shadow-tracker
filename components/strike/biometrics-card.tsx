import Link from 'next/link';
import type { BiometricSummary } from '@/lib/analysis/biometrics';
import type { MetricTrend } from '@/lib/analysis/biometrics-pure';
import { StatTile, type StatTileTone } from '@/components/ui/stat-tile';

/**
 * Phase 12 surfacing - biometric overview on Athlete State.
 *
 * Renders RHR, HRV, sleep, body battery, stress, and weight as compact
 * stat tiles with a 14-day sparkline each. Direction arrows compare the
 * latest value against the older-half mean.
 *
 * Pre-sync empty state: when no health data exists (no Garmin sync yet,
 * or the table is empty), the card explains how to connect rather than
 * showing dashes - so the feature is discoverable.
 *
 * "Better" direction is metric-specific: lower RHR/stress is good, higher
 * HRV/body-battery/sleep is good. Weight is shown neutral (no good/bad).
 */

type Direction = 'up' | 'down' | 'flat';
type Polarity = 'higher-better' | 'lower-better' | 'neutral';

function direction(t: MetricTrend): Direction {
  if (t.latest === null || t.priorMean === null) return 'flat';
  const delta = t.latest - t.priorMean;
  const threshold = Math.abs(t.priorMean) * 0.02; // 2% deadband
  if (delta > threshold) return 'up';
  if (delta < -threshold) return 'down';
  return 'flat';
}

/** Deterministic interpretation word for a biometric trend (spec §2.2) -
 * mirrors the colour the old direction-arrow already used: "good" per the
 * metric's polarity is ok, "bad" is warn, flat/no-data/neutral-polarity is
 * neutral. */
function statWord(trend: MetricTrend, polarity: Polarity): { word: string; tone: StatTileTone } {
  if (trend.latest === null) return { word: 'no data', tone: 'neutral' };
  const dir = direction(trend);
  if (polarity === 'neutral') {
    return dir === 'flat' ? { word: 'steady', tone: 'neutral' } : { word: dir === 'up' ? 'rising' : 'falling', tone: 'neutral' };
  }
  if (dir === 'flat') return { word: 'steady', tone: 'neutral' };
  const good =
    (polarity === 'higher-better' && dir === 'up') ||
    (polarity === 'lower-better' && dir === 'down');
  return good ? { word: 'improving', tone: 'ok' } : { word: 'declining', tone: 'warn' };
}

function Sparkline({ series, polarity }: { series: MetricTrend['series']; polarity: Polarity }) {
  const pts = series.filter((s) => s.value !== null) as { date: string; value: number }[];
  if (pts.length < 2) {
    return <div className="h-8" aria-hidden />;
  }
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 100;
  const H = 28;
  const stepX = W / (series.length - 1);

  // Map full series (preserving gaps) to coordinates; break the path at gaps.
  const segments: string[] = [];
  let current: string[] = [];
  series.forEach((s, i) => {
    if (s.value === null) {
      if (current.length) { segments.push(current.join(' ')); current = []; }
      return;
    }
    const x = i * stepX;
    const y = H - ((s.value - min) / range) * H;
    current.push(`${current.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length) segments.push(current.join(' '));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8" preserveAspectRatio="none">
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-accent/70" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** One biometric cell — thin wrapper around the shared StatTile (spec
 * §2.2/§3.13) that keeps this card's own bordered/rounded tile look
 * (rather than the flat hairline-grid cell StatTile defaults to) and its
 * gap-aware Sparkline, which handles missing days the shared default
 * sparkline doesn't. */
function BiometricTile({
  label, value, unit, trend, polarity, precision = 0,
}: {
  label: string;
  value: number | null;
  unit: string;
  trend: MetricTrend;
  polarity: Polarity;
  precision?: number;
}) {
  const { word, tone } = statWord(trend, polarity);
  return (
    <StatTile
      label={label}
      value={value !== null ? value.toFixed(precision) : '--'}
      unit={value !== null ? unit : undefined}
      word={word}
      tone={tone}
      sparkline={<Sparkline series={trend.series} polarity={polarity} />}
      className="bg-ink-shadow border border-ink-line rounded-lg p-4"
    />
  );
}

function formatSleep(seconds: number | null): number | null {
  if (seconds === null) return null;
  return Math.round((seconds / 3600) * 10) / 10; // hours, 1dp
}

export function BiometricsCard({ summary }: { summary: BiometricSummary }) {
  if (!summary.hasAnyData) {
    return (
      <div className="nn-card p-6 space-y-3">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          biometrics - last {summary.windowDays} days
        </div>
        <div className="space-y-2">
          <p className="text-bone-dim text-sm leading-relaxed max-w-xl">
            No health data yet. Connect Garmin to sync resting heart rate, HRV,
            sleep, body battery, stress and weight - they'll appear here as a
            14-day trend and feed future readiness insights.
          </p>
          {/* <Link href="/settings#garmin" className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover">Connect Garmin</Link> */}
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-accent/30 text-ink/50 rounded-lg font-display tracking-wide-display uppercase text-sm opacity-50 cursor-not-allowed select-none">
            Garmin &mdash; Under Development <span className="normal-case font-mono text-[10px] tracking-normal">(coming soon)</span>
          </span>
        </div>
      </div>
    );
  }

  // Convert sleep duration trend (seconds) into an hours-based trend view.
  const sleepHours: MetricTrend = {
    latest: formatSleep(summary.sleep.latest),
    latestDate: summary.sleep.latestDate,
    mean: formatSleep(summary.sleep.mean),
    priorMean: formatSleep(summary.sleep.priorMean),
    series: summary.sleep.series.map((s) => ({ date: s.date, value: s.value === null ? null : Math.round((s.value / 3600) * 10) / 10 })),
  };

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          biometrics - last {summary.windowDays} days
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
          {summary.sources.join(' · ')}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <BiometricTile label="resting HR" value={summary.rhr.latest} unit="bpm" trend={summary.rhr} polarity="lower-better" />
        <BiometricTile label="HRV" value={summary.hrv.latest} unit="ms" trend={summary.hrv} polarity="higher-better" />
        <BiometricTile label="sleep" value={sleepHours.latest} unit="h" trend={sleepHours} polarity="higher-better" precision={1} />
        <BiometricTile label="body battery" value={summary.bodyBattery.latest} unit="" trend={summary.bodyBattery} polarity="higher-better" />
        <BiometricTile label="stress" value={summary.stress.latest} unit="" trend={summary.stress} polarity="lower-better" />
        <BiometricTile label="weight" value={summary.weight.latest} unit="kg" trend={summary.weight} polarity="neutral" precision={1} />
      </div>

      <p className="font-mono text-[10px] text-bone-mute leading-relaxed pt-1">
        ↳ arrows compare the latest reading to the window's earlier average. Sourced by priority when multiple devices report.
      </p>
    </div>
  );
}
