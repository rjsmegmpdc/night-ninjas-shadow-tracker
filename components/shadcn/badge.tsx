/**
 * shadcn/ui "badge" — kiero-2. Fetched verbatim from the canonical registry
 * (https://ui.shadcn.com/r/styles/new-york/badge.json) on 2026-07-18, style
 * "new-york".
 *
 * DELIBERATE DEVIATIONS from the fetched source (nothing else changed):
 *   - rounded-md   -> rounded-sh-md
 *   - bare `border` -> `border-sh-border` (see card.tsx doc - same reasoning)
 *   - bg-primary/text-primary-foreground, bg-secondary/text-secondary-foreground,
 *     bg-destructive/text-destructive-foreground, text-foreground -> sh- equivalents
 *   - focus:ring-ring -> focus:ring-sh-ring
 * Reason: same token-collision avoidance as button.tsx/card.tsx.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sh-md border border-sh-border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-sh-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-sh-primary text-sh-primary-foreground shadow hover:bg-sh-primary/80',
        secondary: 'border-transparent bg-sh-secondary text-sh-secondary-foreground hover:bg-sh-secondary/80',
        destructive: 'border-transparent bg-sh-destructive text-sh-destructive-foreground shadow hover:bg-sh-destructive/80',
        outline: 'text-sh-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
