import { eq } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { getDb, schema } from '@/lib/db';
import { getUserTimezone } from '@/lib/store/settings';
import { logPageView } from '@/lib/store/instrument';
import { getInterruptionsView } from '@/lib/analysis/interruptions';
import { UnifiedWellnessForm } from '@/components/journal/unified-wellness-form';
import { ActiveInterruptionBanner } from '@/components/journal/active-interruption-banner';
import { ReturnToTrainingCard } from '@/components/journal/return-to-training-card';
import { InjuryRiskCard } from '@/components/journal/injury-risk-card';

/**
 * Journal - Stage 3 unified surface (PHASES Phase 10, PRD 8.5).
 *
 * One place for the context a device can't see: today's wellness check-in
 * and athlete-logged breaks in training (injury, illness, travel, other).
 * Logged injuries NEVER auto-change the plan (the athlete drives recovery);
 * they inform the injury-risk read and pause automatic coach adjustments.
 */
export default async function JournalPage() {
  logPageView('/journal');
  const timezone = await getUserTimezone();
  const todayIso = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
  const [view, todayJournal] = await Promise.all([
    getInterruptionsView(),
    getDb().select().from(schema.journal).where(eq(schema.journal.date, todayIso)).get(),
  ]);

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-5xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">daily loop - journal</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Journal
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Today's wellness check-in and the breaks training plans never
          survive cleanly - injury, illness, travel - in one place. Logged
          injuries never auto-change your plan; they inform the risk read
          and pause automatic adjustments. You drive the recovery.
        </div>
      </header>

      <ActiveInterruptionBanner active={view.active} />

      <ReturnToTrainingCard returns={view.returns} />

      <InjuryRiskCard risk={view.risk} />

      <UnifiedWellnessForm today={todayJournal ?? null} todayIso={todayIso} />
    </div>
  );
}
