import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Chip / ChipLink — redesign spec §2.3 primitives for Patrol's ambient
 * chips row (patrol.html §1): plan-position, sync-freshness, goal-race,
 * and the diagnostic secondary chips (form/intensity/compliance/adherence/
 * streak). Presentational only — content (icons, dots, values) is entirely
 * caller-supplied via `children`; these two components only own sizing,
 * tone colouring, and the clickable hover affordance.
 *
 * Two sizes, matching the mockup's two visual weights: `primary` for the
 * orientation cluster (plan position, sync freshness, goal-race), `sm` for
 * the denser diagnostic cluster. Both default to a neutral border/text
 * treatment; pass `tone` to colour a chip the same way FreshnessChip/
 * IntensityChip already do elsewhere in the app.
 *
 * Row/divider layout (grouping the two clusters with a vertical divider)
 * is page-specific composition, not part of this primitive pair — that's
 * built directly in app/(app)/patrol/page.tsx in the next milestone.
 */

export type ChipTone = 'neutral' | 'ok' | 'warn' | 'miss' | 'accent';
export type ChipSize = 'primary' | 'sm';

const SIZE_CLASS: Record<ChipSize, string> = {
  primary: 'text-xs px-[13px] py-2 border-ink-line-bold text-bone',
  sm: 'text-[10px] px-2.5 py-1.5 border-ink-line text-bone-dim',
};

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: '',
  ok: 'border-signal-ok/50 bg-signal-ok/[0.08] text-signal-ok',
  warn: 'border-signal-warn/50 bg-signal-warn/[0.08] text-signal-warn',
  miss: 'border-signal-miss/50 bg-signal-miss/[0.08] text-signal-miss',
  accent: 'border-accent/50 bg-accent/[0.08] text-accent',
};

const CHIP_BASE =
  'inline-flex items-center gap-1.5 font-mono rounded-md border bg-ink-shadow whitespace-nowrap transition-colors';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  size?: ChipSize;
}

export function Chip({ tone = 'neutral', size = 'primary', className, children, ...props }: ChipProps) {
  return (
    <span className={cn(CHIP_BASE, SIZE_CLASS[size], TONE_CLASS[tone], className)} {...props}>
      {children}
    </span>
  );
}

export interface ChipLinkProps {
  href: string;
  tone?: ChipTone;
  size?: ChipSize;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Clickable chip variant — used for the goal-race chip (spec §2.5), which
 * folds race name/distance/countdown/on-track verdict into one line-1 item
 * linking to `/calendar#tune-ups`. Hover affordance matches the app's
 * existing link idiom: border brightens to accent, text underlines.
 */
export function ChipLink({ href, tone = 'neutral', size = 'primary', title, className, children }: ChipLinkProps) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        CHIP_BASE,
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        'no-underline hover:border-accent hover:underline decoration-accent/50 underline-offset-[3px]',
        className
      )}
    >
      {children}
    </Link>
  );
}
