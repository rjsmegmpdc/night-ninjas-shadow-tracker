import { cn } from '@/lib/utils';

/**
 * VerdictCard — redesign spec §2.1. Unifies CoachReadCard + CoachAdjustment­Card
 * into one shell with two content modes (informational read vs a pending
 * decision with a swap row and Apply/Dismiss). Presentational only — all
 * wiring (which card is today's hero, tone selection, decision handlers)
 * stays with the callers; this component never fetches or computes.
 *
 * Layout, top to bottom: icon + eyebrow/shift row + headline; prose detail;
 * an optional "why" evidence-chip row; an optional children slot (e.g. a
 * session-swap row); an optional decision row (Apply/Dismiss etc).
 *
 * Headline casing: per the locked rule (spec §1.5), punctuated-sentence
 * verdicts stay mixed-case even in the display font, while short state-words
 * are uppercase — this component does not force any text-transform on
 * `headline`, so callers pass text already cased correctly for what it is.
 *
 * Hero elevation (spec §1.4): only one card per screen should be `elevated`
 * at a time — reserved for whichever verdict is Patrol's single visual
 * anchor for that load (usually the coach read, but a safety-rail
 * CoachAdjustmentCard takes the hero slot instead when one fires). The
 * tone-coloured 2px top border only appears on the elevated/hero card,
 * matching the approved mockup exactly (patrol.html §4) — a non-hero
 * instance renders as an ordinary base card with no tone colouring at all,
 * so tone stops doubling as a generic "this is important" signal.
 *
 * `kiero` (kiero-1, additive, default false): opts into the Kiero visual
 * language — larger radius, icon in a tinted chip, sans-serif headline
 * (Kiero doesn't use VELOCITY's condensed display font for verdict prose),
 * a compact single-line "why" instead of a chip row, and a left-aligned
 * decision row. Only Patrol's CoachReadCard/CoachAdjustmentCard pass this;
 * every other caller (components/club-share/club-page.tsx) omits it and
 * renders exactly as before — this prop changes nothing when unset.
 */

export type VerdictTone = 'accent' | 'ok' | 'warn' | 'miss';

const TONE_BORDER_TOP: Record<VerdictTone, string> = {
  accent: 'border-t-accent',
  ok: 'border-t-signal-ok',
  warn: 'border-t-signal-warn',
  miss: 'border-t-signal-miss',
};

const TONE_TEXT: Record<VerdictTone, string> = {
  accent: 'text-accent',
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  miss: 'text-signal-miss',
};

export interface VerdictCardProps {
  tone: VerdictTone;
  icon?: React.ReactNode;
  eyebrow: string;
  /** Optional stat/shift figure on the same top row as the eyebrow, e.g. "6.0 → 8.0 km". */
  shift?: string;
  /** Full-width headline — mixed-case for a sentence verdict, uppercase for a short state-word (caller's call, see file doc). */
  headline: string;
  detail?: string;
  /** Short mono evidence strings, e.g. "HRV ↓11% vs baseline". */
  whyChips?: string[];
  /** Rendered between the why-block and the decision row — e.g. a session-swap row. */
  children?: React.ReactNode;
  /** Rendered as a right-aligned row at the bottom — e.g. Dismiss/Apply buttons. Omit when there's no decision to make. */
  decisionRow?: React.ReactNode;
  /** Hero-card treatment (spec §1.4). Default false — caller decides which single card on the screen earns it. */
  elevated?: boolean;
  /** Kiero visual language opt-in (kiero-1). Default false — see file doc. */
  kiero?: boolean;
  className?: string;
}

export function VerdictCard({
  tone,
  icon,
  eyebrow,
  shift,
  headline,
  detail,
  whyChips,
  children,
  decisionRow,
  elevated = false,
  kiero = false,
  className,
}: VerdictCardProps) {
  return (
    <div
      className={cn(
        elevated ? cn('nn-card-elevated border-t-2', TONE_BORDER_TOP[tone]) : 'nn-card',
        kiero ? 'rounded-[22px] p-7 space-y-5' : 'p-6 space-y-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        {icon && (
          kiero ? (
            <span className={cn('shrink-0 rounded-lg p-2 bg-k-accent/15 text-k-accent')}>{icon}</span>
          ) : (
            <span className={cn('shrink-0 mt-0.5', TONE_TEXT[tone])}>{icon}</span>
          )
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-mute">{eyebrow}</span>
            {shift && <span className="font-mono text-xs text-bone-dim whitespace-nowrap shrink-0">{shift}</span>}
          </div>
          <div
            className={
              kiero
                ? 'font-sans font-semibold text-xl leading-[1.4] text-bone'
                : 'font-display text-[27px] leading-[1.3] tracking-[0.01em] text-bone'
            }
          >
            {headline}
          </div>
        </div>
      </div>

      {detail && <p className="text-bone-dim text-base leading-[1.7]">{detail}</p>}

      {whyChips && whyChips.length > 0 && (
        kiero ? (
          <div className="border-t border-ink-line pt-3.5">
            <p className="font-mono text-[11px] text-bone-mute leading-relaxed">
              <span className="uppercase tracking-[0.14em]">why:</span> {whyChips.join(' · ')}
            </p>
          </div>
        ) : (
          <div className="border-t border-ink-line pt-3.5 space-y-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-bone-mute">why</span>
            <div className="flex flex-wrap gap-2">
              {whyChips.map((chip, i) => (
                <span
                  key={i}
                  className="font-mono text-[11px] text-bone-dim border border-ink-line rounded-md px-2.5 py-1.5 bg-ink-shadow"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        )
      )}

      {children}

      {decisionRow && (
        <div className={cn('flex items-center gap-2.5', kiero ? 'justify-start' : 'justify-end')}>{decisionRow}</div>
      )}
    </div>
  );
}
