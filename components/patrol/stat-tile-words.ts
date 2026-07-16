import type { WeekCompliance } from '@/lib/analysis/compliance';
import type { FormClass } from '@/lib/analysis/athlete-state';
import type { StatTileTone } from '@/components/ui/stat-tile';

/**
 * Deterministic interpretation words for Patrol's week StatTile grid
 * (redesign spec §2.2/§3.1 point 7). Presentation-layer only — every word
 * is derived from numbers/flags Patrol already computes (volumePct,
 * longRunKm bands, this week's session compliance flags, athlete
 * formClass). No new lib/analysis module, per the spec's "derive from
 * existing pct bands only" instruction.
 */

export function volumeWord(totalKmActual: number, volumePct: number): { word: string; tone: StatTileTone } {
  if (totalKmActual === 0) return { word: 'pending', tone: 'neutral' };
  if (volumePct > 110) return { word: 'over', tone: 'warn' };
  if (volumePct >= 90) return { word: 'on-target', tone: 'ok' };
  if (volumePct >= 70) return { word: 'under', tone: 'warn' };
  return { word: 'under', tone: 'miss' };
}

/** Mirrors the existing longLabel() bands (page.tsx) verbatim, just mapped to StatTile's word/tone shape. */
export function longRunWord(actual: number, pct: number): { word: string; tone: StatTileTone } {
  if (actual === 0) return { word: 'pending', tone: 'neutral' };
  if (pct >= 90) return { word: 'on target', tone: 'ok' };
  if (pct >= 70) return { word: 'short', tone: 'warn' };
  return { word: 'well short', tone: 'miss' };
}

/**
 * Pace: no existing pace-trend metric exists on Patrol to compare against,
 * so this reads the compliance flags already computed for the week instead
 * — if any completed session ran fast/slow of its prescribed band, that's
 * "drifting"; otherwise "steady" once at least one session is in, or
 * "pending" before anything's logged.
 */
export function paceWord(compliance: WeekCompliance): { word: string; tone: StatTileTone } {
  const sessions = compliance.days.flatMap((d) => d.sessions).filter((s) => s.target.type !== 'rest');
  const logged = sessions.filter((s) => s.flag !== 'none');
  if (logged.length === 0) return { word: 'pending', tone: 'neutral' };
  const drifting = logged.some((s) => s.flag === 'fast' || s.flag === 'slow');
  return drifting ? { word: 'drifting', tone: 'warn' } : { word: 'steady', tone: 'neutral' };
}

/**
 * HR: reuses the athlete's existing FormClass (already computed for
 * FreshnessChip) rather than inventing a new raw-HR threshold — a loaded
 * or overreached form is read as "elevated", everything else "nominal".
 */
export function hrWord(formClass: FormClass | null): { word: string; tone: StatTileTone } {
  if (formClass === null) return { word: 'pending', tone: 'neutral' };
  if (formClass === 'overreached') return { word: 'elevated', tone: 'miss' };
  if (formClass === 'loaded') return { word: 'elevated', tone: 'warn' };
  return { word: 'nominal', tone: 'ok' };
}
