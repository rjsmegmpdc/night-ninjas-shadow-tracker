/**
 * shadcn/ui "separator" — kiero-2. Fetched verbatim from the canonical
 * registry (https://ui.shadcn.com/r/styles/new-york/separator.json) on
 * 2026-07-18, style "new-york".
 *
 * DELIBERATE DEVIATION from the fetched source (nothing else changed):
 *   - bg-border -> bg-sh-border (same token-collision reasoning as
 *     button.tsx/card.tsx/badge.tsx)
 */
'use client';

import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';

import { cn } from '@/lib/utils';

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-sh-border',
      orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
      className
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
