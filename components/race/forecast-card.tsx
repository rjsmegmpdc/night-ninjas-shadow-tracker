import { formatSpk } from '@/lib/plans/derive';
import type { DayForecast } from '@/lib/weather/forecast';
import type { HeatAdjustment, HeatSeverity } from '@/lib/weather/heat-adjust-pure';

/**
 * Phase 7 - race-day forecast + heat advisory. Forward-looking only (Open-Meteo,
 * Auckland default). The heat advisory is observed/advisory-only: it informs
 * pacing, it does not rewrite the plan.
 */

const SEV_TONE: Record<HeatSeverity, string> = {
  none: 'border-signal-ok/40 bg-signal-ok/5',
  mild: 'border-signal-warn/40 bg-signal-warn/5',
  moderate: 'border-signal-warn/50 bg-signal-warn/5',
  severe: 'border-signal-miss/50 bg-signal-miss/5',
};
const SEV_TEXT: Record<HeatSeverity, string> = {
  none: 'text-signal-ok',
  mild: 'text-signal-warn',
  moderate: 'text-signal-warn',
  severe: 'text-signal-miss',
};

function deg(v: number | null): string {
  return v !== null ? `${Math.round(v)}°C` : '-';
}
function pct(v: number | null): string {
  return v !== null ? `${Math.round(v)}%` : '-';
}

export function ForecastCard({
  forecast,
  heat,
  goalPaceSpk,
  heatAdjustedPaceSpk,
  raceDate,
}: {
  forecast: DayForecast | null;
  heat: HeatAdjustment | null;
  goalPaceSpk: number;
  heatAdjustedPaceSpk: number | null;
  raceDate: string;
}) {
  if (!forecast) {
    return (
      <div className="nn-card p-6 space-y-2">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">race-day forecast</div>
        <p className="text-sm text-bone-dim leading-relaxed">
          A forecast appears within 16 days of race day (Open-Meteo). Check back closer to {raceDate}.
        </p>
      </div>
    );
  }

  const cells = [
    { label: 'high', value: deg(forecast.tempMaxC) },
    { label: 'low', value: deg(forecast.tempMinC) },
    { label: 'feels like', value: deg(forecast.apparentTempMaxC) },
    { label: 'humidity', value: pct(forecast.humidityPct) },
    { label: 'rain', value: pct(forecast.precipProbPct) },
    { label: 'wind', value: forecast.windMaxKmh !== null ? `${Math.round(forecast.windMaxKmh)} km/h` : '-' },
  ];

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">race-day forecast</div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-ink-line border border-ink-line rounded-lg overflow-hidden">
        {cells.map((c) => (
          <div key={c.label} className="bg-ink p-3 text-center">
            <div className="font-display text-xl text-bone tabular-nums leading-none">{c.value}</div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-bone-mute mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {heat && (
        <div className={`rounded-lg border p-4 space-y-1 ${SEV_TONE[heat.severity]}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className={`font-display tracking-wide-display uppercase text-sm ${SEV_TEXT[heat.severity]}`}>
              Heat impact: {heat.severity}
            </span>
            {heat.paceAdjustPct > 0 && heatAdjustedPaceSpk !== null && (
              <span className="font-mono text-xs text-bone-dim tabular-nums">
                {formatSpk(goalPaceSpk)} -&gt; {formatSpk(heatAdjustedPaceSpk)}/km (+{heat.paceAdjustPct}%)
              </span>
            )}
          </div>
          <p className="text-sm text-bone-dim leading-relaxed">{heat.advisory}</p>
        </div>
      )}

      <p className="font-mono text-[10px] text-bone-mute leading-relaxed">
        Open-Meteo forecast (Auckland default). Humidity is an ambient &quot;now&quot; reading, not a per-day value.
        Heat advice is observed-only - it informs pacing, it doesn&apos;t rewrite your plan.
      </p>
    </div>
  );
}
