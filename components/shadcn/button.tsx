/**
 * shadcn/ui "button" — kiero-2. Fetched verbatim from the canonical registry
 * (https://ui.shadcn.com/r/styles/new-york/button.json) on 2026-07-18, style
 * "new-york". Placed under components/shadcn/ (not components/ui/) because
 * components/ui/button.tsx already exists and is used app-wide (21 files) —
 * this is a separate, additive component, not a replacement.
 *
 * DELIBERATE DEVIATIONS from the fetched source (nothing else changed):
 *   - rounded-md            -> rounded-sh-md
 *   - bg-primary / text-primary-foreground -> bg-sh-primary / text-sh-primary-foreground
 *   - text-primary (link variant)          -> text-sh-primary
 *   - bg-destructive / text-destructive-foreground -> sh- equivalents
 *   - border-input          -> border-sh-input
 *   - bg-background          -> bg-sh-background
 *   - hover:bg-accent / hover:text-accent-foreground -> sh- equivalents
 *   - bg-secondary / text-secondary-foreground -> sh- equivalents
 *   - focus-visible:ring-ring -> focus-visible:ring-sh-ring
 * Reason: shadcn's classic bare token names (primary, accent, background...)
 * collide with existing app-wide tailwind.config.ts keys (notably `accent`,
 * the brand orange/k-accent colour). Renamed to the `sh-*` namespace defined
 * in tailwind.config.ts / app/globals.css instead of overwriting them.
 */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sh-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sh-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-sh-primary text-sh-primary-foreground shadow hover:bg-sh-primary/90',
        destructive: 'bg-sh-destructive text-sh-destructive-foreground shadow-sm hover:bg-sh-destructive/90',
        outline: 'border border-sh-input bg-sh-background shadow-sm hover:bg-sh-accent hover:text-sh-accent-foreground',
        secondary: 'bg-sh-secondary text-sh-secondary-foreground shadow-sm hover:bg-sh-secondary/80',
        ghost: 'hover:bg-sh-accent hover:text-sh-accent-foreground',
        link: 'text-sh-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-sh-md px-3 text-xs',
        lg: 'h-10 rounded-sh-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
