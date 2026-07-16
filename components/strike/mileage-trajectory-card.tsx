import type { MileageProgression } from '@/lib/analysis/progression';

/**
 * MileageTrajectoryCard - 8-week strip showing weekly km totals as bars,
 * with severity colour for each week.
 *
 * Visual: bar height ~ km. Bar colour matches the progression severity
 * for that week:
 *   - ok      bone (neutral)
 *   - caution signal-warn
 *   - risk    signal-miss
 *
 * Empty weeks render as ghosts.
 */
export function MileageTrajectoryCard({
  history,
}: {
  history: Array<{ weekStartIso: string; progression: MileageProgression | null }>;
}) {
  // Find the max km in the window to scale bars
  const maxKm = Math.max(
    1,
    ...history.map((h) => h.progression?.thisWeekKm ?? 0)
  );

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          mileage trajectory - last {history.length} weeks
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
          peak {maxKm.toFixed(0)}km
        </div>
      </div>

      <div className="flex items-end gap-1.5 h-32">
        {history.map((week, i) => (
          <MileageBar key={i} week={week} maxKm={maxKm} />
        ))}
      </div>

      <div className="font-mono text-[10px] text-bone-mute flex justify-between">
        <span>{formatShort(history[0]?.weekStartIso)}</span>
        <span>{formatShort(history[history.length - 1]?.weekStartIso)}</span>
      </div>
    </div>
  );
}

function MileageBar({
  week,
  maxKm,
}: {
  week: { weekStartIso: string; progression: MileageProgression | null };
  maxKm: number;
}) {
  const p = week.progression;
  const km = p?.thisWeekKm ?? 0;
  const heightPct = maxKm > 0 ? (km / maxKm) * 100 : 0;

  let barColour = 'bg-bone/50';
  if (p?.severity === 'caution') barColour = 'bg-signal-warn';
  if (p?.severity === 'risk') barColour = 'bg-signal-miss';

  const tooltip = p
    ? `${week.weekStartIso}: ${p.thisWeekKm}km (severity: ${p.severity})`
    : `${week.weekStartIso}: no data`;

  return (
    <div className="flex-1 h-full flex flex-col-reverse" title={tooltip}>
      <div
        className={barColour}
        style={{ height: `${heightPct}%` }}
      />
    </div>
  );
}

function formatShort(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}
