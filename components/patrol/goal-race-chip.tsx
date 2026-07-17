import { and, eq, gte } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { ChipLink } from '@/components/ui/ambient-chips';
import { cn } from '@/lib/utils';
import type { WeekCompliance } from '@/lib/analysis/compliance';

/**
 * GoalRaceChip — redesign spec §2.5 (third revision, "GoalLine retired").
 * Race name, distance, countdown, and the on-track verdict fold into ONE
 * clickable ambient-row chip → /calendar#tune-ups, replacing the retired
 * GoalLine section entirely.
 *
 * The race query mirrors the retired RaceCountdown component's exact
 * pattern (goal race + upcoming-only filter). The on-track verdict maths
 * (bandTone/worstTone/weekCompliancePct/onTrackRead) is moved here
 * verbatim from the retired GoalLine — it's the same presentation-layer
 * composition of numbers Patrol already computes (volumePct, weekly
 * compliance flags), not a new lib/analysis module.
 *
 * Colour discipline (spec §2.5): factual content (name/distance/countdown)
 * stays neutral bone; only the trailing verdict word takes the signal
 * colour. Proximity-aware emphasis (muted >12wk / standard 2-12wk / bold
 * ring <2wk, carried over from RaceCountdown) is expressed as a border/ring
 * treatment rather than text colour, so it doesn't collide with the
 * colour-discipline rule above — the two apply to different visual axes
 * (how urgent is the race vs how well is training going).
 */

type Tone = 'ok' | 'warn' | 'miss';
const TONE_RANK: Record<Tone, number> = { ok: 0, warn: 1, miss: 2 };
const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  miss: 'text-signal-miss',
};

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
  const verdict = tone === 'ok' ? 'on track' : tone === 'warn' ? 'drifting' : 'off track';
  return { verdict, tone };
}

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.round(diffMs / 86400000));
}

export async function GoalRaceChip({
  compliance,
  todayDow,
  volumePct,
}: {
  compliance: WeekCompliance;
  todayDow: number;
  volumePct: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const goalRace = await (await getDb())
    .select()
    .from(schema.races)
    .where(and(eq(schema.races.isGoal, true), gte(schema.races.raceDate, today)))
    .get();

  if (!goalRace) return null;

  const goalDays = daysUntil(goalRace.raceDate);
  const goalWeeks = Math.floor(goalDays / 7);
  const goalDaysRem = goalDays % 7;
  const countdown = goalWeeks > 0 ? `${goalWeeks}W${goalDaysRem > 0 ? ` ${goalDaysRem}D` : ''}` : `${goalDays}D`;

  const compliancePct = weekCompliancePct(compliance, todayDow);
  const { verdict, tone } = onTrackRead(volumePct, compliancePct);

  const isRaceWeek = goalDays < 14;
  const proximityClass = isRaceWeek ? 'ring-1 ring-accent/40' : goalWeeks >= 12 ? 'border-ink-line' : undefined;

  return (
    <ChipLink
      href="/calendar#tune-ups"
      title={`${goalRace.name} · open on Calendar`}
      className={proximityClass}
    >
      <span className="uppercase">
        🎯 {goalRace.name} · {goalRace.distanceKm.toFixed(1)}KM · {countdown} ·{' '}
      </span>
      <span className={cn('uppercase font-semibold', TONE_TEXT[tone])}>{verdict}</span>
    </ChipLink>
  );
}
