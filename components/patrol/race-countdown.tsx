import Link from 'next/link';
import { eq, and, gte, lte } from 'drizzle-orm';
import { Target } from 'lucide-react';
import { getDb, schema } from '@/lib/db';

/**
 * RaceCountdown — compressed single-line goal-race indicator.
 *
 * Format: 🎯 Auckland Marathon · 26w 3d
 *
 * Race name links to /calendar#goal-race. Tune-ups within 8 weeks
 * appear as a single chip after the goal: "+ 1 tune-up" → /calendar#tune-ups.
 *
 * Renders nothing when no goal race is set or the goal race is in the past.
 *
 * Proximity-aware emphasis (kept intentionally subtle, no animation):
 *   > 12 weeks → muted accent
 *   2-12 weeks → standard accent
 *   < 2 weeks  → bold accent + ring
 */
export async function RaceCountdown() {
  const db = (await getDb());
  const today = new Date().toISOString().slice(0, 10);

  const goalRace = await db
    .select()
    .from(schema.races)
    .where(and(eq(schema.races.isGoal, true), gte(schema.races.raceDate, today)))
    .get();

  if (!goalRace) return null;

  // Tune-ups in next 8 weeks
  const eightWeeksOut = new Date();
  eightWeeksOut.setDate(eightWeeksOut.getDate() + 56);
  const eightWeeksIso = eightWeeksOut.toISOString().slice(0, 10);

  const tuneups = await db
    .select()
    .from(schema.races)
    .where(
      and(
        eq(schema.races.isGoal, false),
        gte(schema.races.raceDate, today),
        lte(schema.races.raceDate, eightWeeksIso)
      )
    )
    .all();

  const goalDays = daysUntil(goalRace.raceDate);
  const goalWeeks = Math.floor(goalDays / 7);
  const goalDaysRem = goalDays % 7;

  // Proximity-aware classes
  const isRaceWeek = goalDays < 14;
  const accentClass = isRaceWeek
    ? 'text-accent ring-1 ring-accent/40 px-2 py-0.5'
    : goalWeeks < 12
    ? 'text-accent'
    : 'text-accent/80';

  return (
    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
      <Link
        href="/calendar#goal-race"
        className={'flex items-center gap-1.5 hover:underline decoration-accent/40 underline-offset-2 ' + accentClass}
        title={`Open ${goalRace.name} on Calendar`}
      >
        <Target size={12} strokeWidth={1.5} />
        <span className="font-display tracking-wide-display uppercase">
          {goalRace.name}
        </span>
        <span className="text-bone-dim">·</span>
        <span className="tabular-nums">
          {goalWeeks > 0 && (
            <>
              <span className={isRaceWeek ? 'text-accent font-semibold' : ''}>
                {goalWeeks}w
              </span>
              {goalDaysRem > 0 && (
                <>
                  {' '}
                  <span>{goalDaysRem}d</span>
                </>
              )}
            </>
          )}
          {goalWeeks === 0 && <span>{goalDays}d</span>}
        </span>
      </Link>

      {tuneups.length > 0 && (
        <Link
          href="/calendar#tune-ups"
          className="text-bone-mute hover:text-bone transition-colors"
          title={tuneups.map((t) => `${t.name} · ${daysUntil(t.raceDate)}d`).join('  ·  ')}
        >
          + {tuneups.length} tune-up{tuneups.length === 1 ? '' : 's'} in 8wk
        </Link>
      )}
    </div>
  );
}

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.round(diffMs / 86400000));
}
