import type { MonthVolume, ZoneDistribution, LoadPoint, Zone5 } from '@/lib/analysis/trends';

/**
 * R2 surfacing - Trends widgets for the Recon page.
 *
 *   MonthlyVolumeCard      - 6-month volume bars with MoM delta callout
 *   ZoneDistributionCard   - 5-zone (E/M/T/I/R) time-in-zone stacked bar
 *   LoadRecoveryCard       - CTL/ATL/TSB lines over 8 weeks
 *
 * All read-only, fed by the trends read layer. Confidence on the zone card
 * is surfaced honestly - if max HR isn't calibrated, zones are estimates.
 */

/* ----- Monthly volume ----------------------------------------------------- */

export function MonthlyVolumeCard({ monthly }: { monthly: MonthVolume[] }) {
  const maxKm = Math.max(1, ...monthly.map((m) => m.km));
  const latest = monthly[monthly.length - 1];

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          monthly volume - {monthly.length} months
        </div>
        {latest?.deltaPct !== null && latest?.deltaPct !== undefined && (
          <div className={`font-mono text-xs ${latest.deltaPct >= 0 ? 'text-signal-ok' : 'text-signal-warn'}`}>
            {latest.deltaPct >= 0 ? '+' : ''}{latest.deltaPct}% MoM
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 h-32">
        {monthly.map((m) => {
          const h = (m.km / maxKm) * 100;
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
              <div className="font-mono text-[10px] text-bone-dim tabular-nums">{m.km > 0 ? Math.round(m.km) : ''}</div>
              <div
                className="w-full bg-accent/70 rounded-t"
                style={{ height: `${Math.max(h, m.km > 0 ? 4 : 0)}%` }}
                title={`${m.month}: ${m.km}km`}
              />
              <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
                {monthLabel(m.month)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function monthLabel(ym: string): string {
  const [, m] = ym.split('-');
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)] ?? ym;
}

/* ----- Zone distribution -------------------------------------------------- */

const ZONE_META: Record<Zone5, { label: string; klass: string }> = {
  easy: { label: 'Easy', klass: 'bg-signal-ok' },
  marathon: { label: 'Marathon', klass: 'bg-accent/60' },
  threshold: { label: 'Threshold', klass: 'bg-accent' },
  interval: { label: 'Interval', klass: 'bg-signal-warn' },
  repetition: { label: 'Rep', klass: 'bg-signal-miss' },
};
const ZONE_ORDER: Zone5[] = ['easy', 'marathon', 'threshold', 'interval', 'repetition'];

export function ZoneDistributionCard({ zones }: { zones: ZoneDistribution }) {
  if (zones.totalMin === 0) {
    return (
      <div className="nn-card p-6 space-y-3">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          intensity distribution - 28 days
        </div>
        <p className="text-bone-dim text-sm">No activities with duration in the last 28 days.</p>
      </div>
    );
  }

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          intensity distribution - 28 days
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
          {Math.round(zones.totalMin / 60)}h total
        </div>
      </div>

      {/* Stacked bar */}
      <div className="flex h-6 rounded-lg overflow-hidden">
        {ZONE_ORDER.map((z) =>
          zones.pct[z] > 0 ? (
            <div
              key={z}
              className={ZONE_META[z].klass}
              style={{ width: `${zones.pct[z]}%` }}
              title={`${ZONE_META[z].label}: ${zones.pct[z]}%`}
            />
          ) : null
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-5 gap-2">
        {ZONE_ORDER.map((z) => (
          <div key={z} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-sm ${ZONE_META[z].klass}`} />
              <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">{ZONE_META[z].label}</span>
            </div>
            <div className="font-display text-xl text-bone tabular-nums leading-none">{zones.pct[z]}<span className="text-xs text-bone-mute">%</span></div>
          </div>
        ))}
      </div>

      {zones.confidence !== 'calibrated' && (
        <p className="font-mono text-[10px] text-signal-warn leading-relaxed pt-1">
          ↳ zones are {zones.confidence === 'pace-only' ? 'pace-derived' : 'estimated'} - set a measured max HR for calibrated zones.
        </p>
      )}
    </div>
  );
}

/* ----- Load vs recovery --------------------------------------------------- */

export function LoadRecoveryCard({ load }: { load: LoadPoint[] }) {
  if (load.length === 0 || load.every((p) => p.ctl === 0 && p.atl === 0)) {
    return (
      <div className="nn-card p-6 space-y-3">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          load vs recovery - 8 weeks
        </div>
        <p className="text-bone-dim text-sm">Not enough activity history to chart fitness and fatigue yet.</p>
      </div>
    );
  }

  const W = 320;
  const H = 120;
  const maxVal = Math.max(1, ...load.map((p) => Math.max(p.ctl, p.atl)));
  const stepX = W / (load.length - 1);
  const y = (v: number) => H - (v / maxVal) * H;

  const path = (key: 'ctl' | 'atl') =>
    load.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

  const latest = load[load.length - 1];

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          load vs recovery - 8 weeks
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest">
          <span className="text-accent">fitness {latest.ctl.toFixed(0)}</span>
          <span className="text-signal-warn">fatigue {latest.atl.toFixed(0)}</span>
          <span className={latest.tsb >= 0 ? 'text-signal-ok' : 'text-bone-mute'}>form {latest.tsb >= 0 ? '+' : ''}{latest.tsb.toFixed(0)}</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }} preserveAspectRatio="none">
        <path d={path('ctl')} fill="none" stroke="currentColor" strokeWidth={2} className="text-accent" vectorEffect="non-scaling-stroke" />
        <path d={path('atl')} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-signal-warn" vectorEffect="non-scaling-stroke" strokeDasharray="3 2" />
      </svg>

      <p className="font-mono text-[10px] text-bone-mute leading-relaxed">
        ↳ fitness (CTL, solid) is your 42-day load; fatigue (ATL, dashed) the 7-day. Form is the gap - positive means fresh.
      </p>
    </div>
  );
}
