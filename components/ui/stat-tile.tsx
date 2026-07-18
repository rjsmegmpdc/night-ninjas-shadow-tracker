import { cn } from '@/lib/utils';

/**
 * StatTile — redesign spec §2.2. A single cell in the "cockpit spreadsheet"
 * hairline grid pattern already used on Patrol's top row (§1.2): label,
 * tabular value+unit, a target/context line, and a deterministic one-word
 * interpretation, colour-coded like `FormClass` — engine-owned vocabulary,
 * never free text. Optional sparkline slot.
 *
 * Presentational only — this component renders numbers/words callers give
 * it; it does not compute anything. Replaces the raw four-Stat grid on
 * Patrol/Strike/VO2max/Recon (one shared implementation instead of three
 * divergent ad hoc ones — see spec §2.2/§3.9/§3.13).
 *
 * Background is deliberately just `bg-ink` with no border/shadow of its own
 * — the caller supplies the hairline grid wrapper (`grid gap-px bg-ink-line
 * border border-ink-line`, cells `bg-ink`), the same pattern Patrol's stats
 * row already uses. `Stat` (components/ui/stat.tsx) stays for simpler
 * one-off numbers that have no trend to interpret.
 *
 * `dotClassName` (kiero-1, additive, optional): a small colour-coded dot
 * next to the label, matching the Kiero stat-tile grid's per-metric colour
 * key (e.g. `bg-k-data-teal`). Undefined by default — Recon/Strike/VO2max
 * never pass it, so their tiles render exactly as before. Patrol is the
 * only current caller that sets it.
 */

export type StatTileTone = 'ok' | 'warn' | 'miss' | 'neutral';

const WORD_TONE_CLASS: Record<StatTileTone, string> = {
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  // Mirrors the approved mockup exactly (patrol.html §6): a "miss"
  // interpretation word uses the brand accent, not signal-miss red —
  // signal-miss stays reserved for actual errors/alerts elsewhere.
  miss: 'text-accent',
  neutral: 'text-bone-dim',
};

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  /** Secondary line under the value, e.g. "target 55 · 77%" or "5 sessions this week". */
  target?: string;
  /** Deterministic, engine-owned interpretation word (e.g. "under", "on target", "steady", "elevated"). */
  word: string;
  tone: StatTileTone;
  /**
   * Convenience sparkline: a raw numeric series, auto-normalized to the
   * tile's tone colour. Ignored when `sparkline` is also supplied.
   */
  points?: number[];
  /** Full override — pass any ReactNode (e.g. a richer existing Sparkline) instead of `points`. */
  sparkline?: React.ReactNode;
  /** Optional colour-dot className next to the label (e.g. `bg-k-data-teal`). See file doc. */
  dotClassName?: string;
  className?: string;
}

function DefaultSparkline({ points, toneClass }: { points: number[]; toneClass: string }) {
  if (points.length < 2) return null;
  const W = 100;
  const H = 26;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = W / (points.length - 1);
  const coords = points
    .map((p, i) => `${(i * stepX).toFixed(1)},${(H - ((p - min) / range) * H).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[26px]" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className={toneClass}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function StatTile({ label, value, unit, target, word, tone, points, sparkline, dotClassName, className }: StatTileProps) {
  const toneClass = WORD_TONE_CLASS[tone];

  return (
    <div className={cn('bg-ink p-5 flex flex-col gap-2', className)}>
      <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute flex items-center gap-1.5">
        {dotClassName && <span className={cn('inline-block w-1.5 h-1.5 rounded-full', dotClassName)} />}
        {label}
      </span>
      <div className="font-mono text-[34px] tabular-nums text-bone leading-none">
        {value}
        {unit && <span className="text-sm text-bone-mute ml-1">{unit}</span>}
      </div>
      {target && <span className="font-mono text-xs text-bone-mute">{target}</span>}
      <span className={cn('font-mono text-[11px] lowercase tracking-wide font-semibold', toneClass)}>{word}</span>
      {sparkline !== undefined ? (
        sparkline
      ) : points ? (
        <DefaultSparkline points={points} toneClass={toneClass} />
      ) : null}
    </div>
  );
}
