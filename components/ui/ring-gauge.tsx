import { cn } from '@/lib/utils';

/**
 * RingGauge — kiero-1. Pure SVG thick-arc ring: big center numeral, small
 * unit suffix, mono uppercase tracked label beneath. No chart library.
 *
 * Presentational only — callers resolve `pct` (0-100 fill, already clamped)
 * and `color` (a CSS color, typically a `var(--k-ring-*)` static hue or
 * `var(--nn-signal-warn|miss)` when the underlying metric's tone crosses
 * into caution/risk — see components/patrol/ring-trio.tsx for that mapping).
 * This component never computes or interprets anything.
 */
export interface RingGaugeProps {
  /** Big center numeral, already formatted (e.g. "+12", "0.70", "82"). */
  value: string;
  /** Small suffix after the numeral, e.g. "%". */
  unit?: string;
  /** Mono uppercase tracked label beneath the ring, e.g. "FORM". */
  label: string;
  /** Arc fill, 0-100. */
  pct: number;
  /** Resolved CSS color for the filled arc. */
  color: string;
  size?: number;
  className?: string;
}

export function RingGauge({ value, unit, label, pct, color, size = 96, className }: RingGaugeProps) {
  const stroke = Math.round(size * 0.1);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--nn-ink-line)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 300ms ease-out, stroke 200ms ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono tabular-nums text-bone leading-none" style={{ fontSize: size * 0.26 }}>
            {value}
            {unit && <span className="text-bone-mute" style={{ fontSize: size * 0.14 }}>{unit}</span>}
          </span>
        </div>
      </div>
      <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">{label}</span>
    </div>
  );
}
