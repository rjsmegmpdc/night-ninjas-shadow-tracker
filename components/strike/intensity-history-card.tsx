import type { IntensityDistribution } from '@/lib/analysis/intensity-distribution';

/**
 * IntensityHistoryCard - 8-week strip of intensity distribution per
 * week, rendered as stacked bars.
 *
 * Each bar's segments (top to bottom):
 *   - hard  (signal-miss)
 *   - grey  (signal-warn)
 *   - easy  (signal-ok)
 *
 * Visual goal: at a glance, can you see whether your easy time has
 * dominated consistently? Or is grey/hard creeping up? The Seiler
 * polarised pattern is a nearly-all-green bar with a thin red strip
 * on top - week after week.
 *
 * Empty weeks (no running) render as muted "no data" cells.
 */
export function IntensityHistoryCard({
  history,
}: {
  history: Array<{ weekStartIso: string; distribution: IntensityDistribution | null }>;
}) {
  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          intensity history - last {history.length} weeks
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute flex gap-3">
          <span>
            <span className="inline-block w-2 h-2 bg-signal-ok mr-1 align-middle" /> easy
          </span>
          <span>
            <span className="inline-block w-2 h-2 bg-signal-warn mr-1 align-middle" /> grey
          </span>
          <span>
            <span className="inline-block w-2 h-2 bg-signal-miss mr-1 align-middle" /> hard
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1.5 h-32">
        {history.map((week, i) => (
          <IntensityBar key={i} week={week} />
        ))}
      </div>

      <div className="font-mono text-[10px] text-bone-mute flex justify-between">
        <span>{formatShort(history[0]?.weekStartIso)}</span>
        <span>{formatShort(history[history.length - 1]?.weekStartIso)}</span>
      </div>
    </div>
  );
}

function IntensityBar({
  week,
}: {
  week: { weekStartIso: string; distribution: IntensityDistribution | null };
}) {
  const d = week.distribution;
  const tooltip = d
    ? `${week.weekStartIso}: ${d.totalRunMin}min - ${d.easyPct}% easy / ${d.greyPct}% grey / ${d.hardPct}% hard`
    : `${week.weekStartIso}: no running`;

  if (!d) {
    return (
      <div
        className="flex-1 h-full border border-dashed border-ink-line/60 bg-ink-shadow/20"
        title={tooltip}
      />
    );
  }

  // Stack from bottom: easy -> grey -> hard
  return (
    <div className="flex-1 h-full flex flex-col-reverse" title={tooltip}>
      <div
        className="w-full bg-signal-ok"
        style={{ height: `${d.easyPct}%` }}
      />
      <div
        className="w-full bg-signal-warn"
        style={{ height: `${d.greyPct}%` }}
      />
      <div
        className="w-full bg-signal-miss"
        style={{ height: `${d.hardPct}%` }}
      />
    </div>
  );
}

function formatShort(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}
