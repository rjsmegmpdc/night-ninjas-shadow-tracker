import Link from 'next/link';
import { RaceCountdown } from '@/components/patrol/race-countdown';
import type { WeekCompliance } from '@/lib/analysis/compliance';
import type { ProgramPhase } from '@/lib/plans/program-phase';

/**
 * Stage 4 (daily loop) - "goal line": race countdown + a compact on-track
 * read + the race-plan/book-a-race links. No new analysis module - composes
 * numbers PatrolDashboard already has (programPhase, this-week volume %,
 * week compliance) the same way WeekComplianceChip already does inline in
 * the presentation layer, rather than adding another lib/analysis engine
 * for a one-line verdict.
 *
 * `weekCompliancePct` mirrors WeekComplianceChip's own hit-rate maths
 * (days today-or-past, worst-of-day session flags) rather than importing
 * from it - that component doesn't export the calculation, and it's a
 * presentation-layer read, not shared domain logic.
 *
 * The Race plan / Book-a-race links previously lived in the header's own
 * "compact race row" alongside a second RaceCountdown render. PRD 8.5 makes
 * the goal line the countdown's home, so that header row is gone and its
 * links moved here rather than being dropped - see PatrolDashboard.
 */

type Tone = 'ok' | 'warn' | 'miss';
const TONE_RANK: Record<Tone, number> = { ok: 0, warn: 1, miss: 2 };

function bandTone(pct: number): Tone {
  if (pct >= 80) return 'ok';
  if (pct >= 50) return 'warn';
  return 'miss';
}

function worstTone(a: Tone, b: Tone): Tone {
  return TONE_RANK[a] >= TONE_RANK[b] ? a : b;
}

function weekCompliancePct(compliance: WeekCompliance, todayDow: number): number | null {
  let scheduled = 0;
  let hits = 0;
  for (const day of compliance.days) {
    if (day.dow > todayDow) continue; // future day, not due yet
    const real = day.sessions.filter((s) => s.target.type !== 'rest');
    if (real.length === 0) continue; // rest day
    scheduled++;
    if (real.every((s) => s.flag === 'ok')) hits++;
  }
  return scheduled === 0 ? null : Math.round((hits / scheduled) * 100);
}

function onTrackRead(volumePct: number, compliancePct: number | null): { verdict: string; tone: Tone } {
  const tone = compliancePct === null
    ? bandTone(volumePct)
    : worstTone(bandTone(volumePct), bandTone(compliancePct));
  const verdict = tone === 'ok' ? 'On track' : tone === 'warn' ? 'Drifting' : 'Off track';
  return { verdict, tone };
}

const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  miss: 'text-signal-miss',
};

export function GoalLine({
  programPhase,
  compliance,
  todayDow,
  volumePct,
}: {
  programPhase: ProgramPhase;
  compliance: WeekCompliance;
  todayDow: number;
  volumePct: number;
}) {
  const compliancePct = weekCompliancePct(compliance, todayDow);
  const { verdict, tone } = onTrackRead(volumePct, compliancePct);

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <RaceCountdown />
      <div className="flex items-center flex-wrap gap-3">
        <div
          className="font-mono text-xs"
          title={
            compliancePct === null
              ? `${volumePct}% of this week's volume target so far`
              : `${volumePct}% of this week's volume target · ${compliancePct}% of due sessions hit`
          }
        >
          <span className={TONE_CLASS[tone]}>{verdict}</span>
          <span className="text-bone-mute"> · {programPhase.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/race"
            className="inline-flex items-center gap-1.5 font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-accent transition-colors border border-ink-line hover:border-accent px-2.5 py-1"
            title="Race execution plan - pacing, fuelling, carb-load"
          >
            Race plan →
          </Link>
          <Link
            href="/calendar#tune-ups"
            className="inline-flex items-center gap-1.5 font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-accent transition-colors border border-ink-line hover:border-accent px-2.5 py-1"
            title="Book a race on Calendar"
          >
            + Book a race
          </Link>
        </div>
      </div>
    </div>
  );
}
