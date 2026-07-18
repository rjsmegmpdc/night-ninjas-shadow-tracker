/**
 * shadcn/ui "card" — kiero-2. Fetched verbatim from the canonical registry
 * (https://ui.shadcn.com/r/styles/new-york/card.json) on 2026-07-18, style
 * "new-york". Placed under components/shadcn/ (not components/ui/) because
 * components/ui/card.tsx already exists and is used app-wide (19 files) —
 * this is a separate, additive component, not a replacement. Patrol's
 * CardLabel (the mono uppercase eyebrow) is unaffected — it's still
 * imported from @/components/ui/card and composed alongside this Card;
 * shadcn's card has no equivalent export, so no change needed there.
 *
 * DELIBERATE DEVIATIONS from the fetched source (nothing else changed):
 *   - rounded-xl        -> rounded-sh-xl (our own `xl` key is already
 *     claimed at 10px for the existing card system; shadcn's Card wants a
 *     bigger ~24px Kiero radius, so it gets its own namespaced key)
 *   - bare `border`     -> `border-sh-border` (explicit colour rather than
 *     relying on Tailwind's global borderColor.DEFAULT, which we're not
 *     touching - see button.tsx doc for the same reasoning)
 *   - bg-card / text-card-foreground -> sh- equivalents
 *   - text-muted-foreground (CardDescription) -> text-sh-muted-foreground
 */
import * as React from 'react';

import { cn } from '@/lib/utils';

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-sh-xl border border-sh-border bg-sh-card text-sh-card-foreground shadow',
      className
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm text-sh-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
