import { TopNav } from '@/components/nav/topnav';
import { BottomNav } from '@/components/nav/bottom-nav';
import { getStreakState } from '@/lib/analysis/streak';

/**
 * VELOCITY app layout - top horizontal nav over the page content.
 *
 * Replaces the previous Sidebar + main-flex layout. The TopNav is
 * sticky to the viewport top with a backdrop blur. Page content
 * flows underneath in a single full-width column constrained by
 * each page's own max-width container.
 *
 * Fetches the live streak here (server) and passes the count into the
 * client TopNav so the nav flame shows the real number.
 *
 * kiero-1: BottomNav is additive, mobile-only (its own `sm:hidden`) - TopNav
 * is untouched and keeps rendering on every breakpoint. `pb-20 sm:pb-0` on
 * `<main>` keeps page content clear of the fixed bottom bar on small screens.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let streakCount: number | null = null;
  try {
    const s = await getStreakState();
    streakCount = s && !s.isBroken ? s.count : null;
  } catch {
    streakCount = null;
  }

  return (
    <div className="min-h-screen bg-ink">
      <TopNav streakCount={streakCount} />
      <main className="min-w-0 pb-20 sm:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
