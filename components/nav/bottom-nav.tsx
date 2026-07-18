'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Dumbbell, BarChart3, User } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * BottomNav — kiero-1. Mobile-only (`sm:hidden`) bottom bar, additive to
 * TopNav (components/nav/topnav.tsx), which stays completely unchanged and
 * still renders on every breakpoint including mobile — this is a second,
 * thumb-reachable nav surface for small screens, not a replacement.
 *
 * Same 4 buckets as TopNav minus Club (locked scope: Patrol/Training/
 * Analytics/Profile only). Routes/match logic are intentionally duplicated
 * from TopNav's NAV array rather than importing it, to avoid modifying that
 * shared file just to export something only this new component needs.
 *
 * No center "+" action - no single existing action maps cleanly to one
 * global tap target (manual logging lives inside the prompt queue / journal
 * flows, not a standalone route), so it's omitted per the "never a dead
 * button" rule rather than faked.
 */

interface NavBucket {
  label: string;
  href: string;
  match: string[];
  icon: typeof Compass;
}

const NAV: NavBucket[] = [
  { label: 'Patrol', href: '/patrol', match: ['/patrol'], icon: Compass },
  { label: 'Training', href: '/dojo', match: ['/dojo', '/calendar', '/race'], icon: Dumbbell },
  { label: 'Analytics', href: '/strike', match: ['/strike', '/recon', '/vo2max', '/coach-log'], icon: BarChart3 },
  { label: 'Profile', href: '/profile', match: ['/profile', '/settings', '/help', '/shoes', '/journal'], icon: User },
];

export function BottomNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-ink-shadow/95 backdrop-blur-sm border-t border-ink-line"
      aria-label="Primary"
    >
      <div className="flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {NAV.map((item) => {
          const active = item.match.some((m) => pathname.startsWith(m));
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 px-3 min-w-[64px] transition-colors',
                active ? 'text-k-accent' : 'text-bone-dim hover:text-bone'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.5} />
              <span className="font-mono text-[10px] uppercase tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
