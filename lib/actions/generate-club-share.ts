'use server';

import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { revalidatePath } from 'next/cache';
import { getDb, schema } from '@/lib/db';
import { getActivePlan, currentWeekRange } from '@/lib/plans/active-plan';
import { resolveWeekContext } from '@/lib/plans/week-context';
import { evaluateWeek } from '@/lib/analysis/compliance';
import { getActivitiesInRange } from '@/lib/analysis/week-queries';
import {
  getClubParkrunId,
  getClubTermsAcceptedAt,
  getClubWindowDefault,
  setClubLastShareGeneratedAt,
  getAthleteId,
  getSchedulePasswordHash,
  type ClubWindowDefault,
} from '@/lib/store/settings';
import { getGitHubPat } from '@/lib/store/secrets';
import { generateSchedulePayload, buildShareFilename, type GenerateInput } from '@/lib/club-share/generator';
import { publishScheduleToGitHub } from '@/lib/github/publish-schedule';
import type { WeekTemplate } from '@/lib/plans/types';

/**
 * Server action result.
 */
export interface GenerateShareResult {
  ok: boolean;
  /** Set when ok=true: path to the latest current.json file */
  latestPath?: string;
  /** Set when ok=true: path to the archived history file */
  archivedPath?: string;
  /** Filename written - useful to display in the UI */
  filename?: string;
  /** Set when ok=false: human-readable error */
  error?: string;
  /** Set when ok=true: number of pending sessions in the output */
  sessionCount?: number;
  /** True when the schedule was successfully pushed to GitHub */
  githubPublished?: boolean;
  /** Set when githubPublished=true: HTML URL of the file on GitHub */
  githubUrl?: string;
}

/**
 * Resolve the number of weeks to include based on the window option.
 *
 * For 'next-race' and 'program-end', we look up race date and program
 * end date respectively to compute the actual number of weeks.
 */
async function resolveWeekCount(option: ClubWindowDefault): Promise<number> {
  if (option === '1w') return 1;
  if (option === '2w') return 2;
  if (option === '4w') return 4;

  const db = (await getDb());
  const today = new Date();
  const { startIso: thisMondayIso } = currentWeekRange(today);
  const thisMonday = new Date(thisMondayIso + 'T00:00:00');

  if (option === 'next-race') {
    // Find next race after today
    const races = await db
      .select()
      .from(schema.races)
      .all();
    const future = races
      .filter((r) => r.raceDate >= thisMondayIso)
      .sort((a, b) => (a.raceDate < b.raceDate ? -1 : 1));
    if (future.length === 0) return 4; // sensible default if no race scheduled
    const raceDate = new Date(future[0].raceDate + 'T00:00:00');
    const days = Math.ceil((raceDate.getTime() - thisMonday.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(1, Math.min(20, Math.ceil(days / 7)));
  }

  if (option === 'program-end') {
    const periods = await db
      .select()
      .from(schema.planPeriods)
      .all();
    const active = periods.find((p) => p.endDate === null);
    if (!active) return 4;
    // Program-end is startDate + programWeeks*7 days
    const start = new Date(active.startDate + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + active.programWeeks * 7);
    const days = Math.ceil((end.getTime() - thisMonday.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(1, Math.min(20, Math.ceil(days / 7)));
  }

  return 2;
}

/**
 * Resolve and render the weeks to include in the export, in order.
 */
async function buildWeeksForExport(weekCount: number): Promise<
  { weekStartIso: string; template: WeekTemplate }[]
> {
  const today = new Date();
  const { startIso: thisMondayIso } = currentWeekRange(today);
  const thisMonday = new Date(thisMondayIso + 'T00:00:00');

  const mondays: Date[] = [];
  for (let i = 0; i < weekCount; i++) {
    const m = new Date(thisMonday);
    m.setDate(m.getDate() + i * 7);
    mondays.push(m);
  }

  const result: { weekStartIso: string; template: WeekTemplate }[] = [];

  for (const monday of mondays) {
    const weekStartIso = monday.toISOString().slice(0, 10);
    const weekEnd = new Date(monday);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndIso = weekEnd.toISOString().slice(0, 10);

    const weekContext = await resolveWeekContext({ weekStartIso, weekEndIso });

    const activePlan = await getActivePlan();
    let template: WeekTemplate | null = null;

    if (activePlan) {
      const periodStart = new Date(activePlan.params.startDate + 'T00:00:00');
      const diffDays = Math.floor((monday.getTime() - periodStart.getTime()) / 86400000);
      const wkNum = Math.floor(diffDays / 7) + 1;
      if (wkNum >= 1 && wkNum <= (activePlan.params.programWeeks ?? activePlan.engine.defaultProgramWeeks)) {
        template = activePlan.engine.renderWeek(activePlan.params, wkNum, weekContext);
      }
    }

    // Base-maintenance fallback intentionally NOT applied here. The
    // club share publishes program-window training only. Weeks outside
    // the program window contribute nothing (returns no template).
    if (template) {
      result.push({ weekStartIso, template });
    }
  }

  return result;
}

/**
 * Build the set of (date, dow) keys for sessions whose compliance is
 * 'ok' or 'soft' (the hit-or-partial set per our design decisions).
 *
 * Also builds the set of dates that have ANY activity logged - used to
 * decide whether to strip today's session.
 */
async function buildCompletionSets(
  weeks: { weekStartIso: string; template: WeekTemplate }[]
): Promise<{
  completedSessionKeys: Set<string>;
  dayHasActivity: Set<string>;
}> {
  const completedSessionKeys = new Set<string>();
  const dayHasActivity = new Set<string>();

  for (const { weekStartIso, template } of weeks) {
    const weekEnd = new Date(weekStartIso + 'T00:00:00');
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndIso = weekEnd.toISOString().slice(0, 10);

    const activities = await getActivitiesInRange(weekStartIso, weekEndIso);

    // Build day-has-activity set
    for (const a of activities) {
      const d = a.startDateLocal.slice(0, 10);
      dayHasActivity.add(d);
    }

    if (activities.length === 0) continue;

    const compliance = evaluateWeek(template, activities);
    for (const day of compliance.days) {
      // A day is "completed" if it has at least one hit-or-partial session.
      // 'ok' = hit, 'fast' / 'slow' / 'short' / 'warn' = soft / partial.
      // 'miss' = miss, 'none' = nothing logged.
      const isCompleted = day.sessions.some(
        (s) => s.flag === 'ok' || s.flag === 'fast' || s.flag === 'slow' || s.flag === 'short' || s.flag === 'warn'
      );
      if (isCompleted) {
        const date = new Date(weekStartIso + 'T00:00:00');
        date.setDate(date.getDate() + day.dow);
        const dateIso = date.toISOString().slice(0, 10);
        completedSessionKeys.add(`${dateIso}:${day.dow}`);
      }
    }
  }

  return { completedSessionKeys, dayHasActivity };
}

/**
 * Compute the output directory for club share files.
 *
 * Lives under the user's home directory in a 'VELOCITY/exports' folder.
 * Two locations:
 *   - exports/schedule-current.json - latest export (always at this path)
 *   - exports/history/{filename}    - timestamped archive of all exports
 */
function shareExportRoot(): string {
  // Per BRAND.md: codebase keeps Night Ninjas paths under %APPDATA% for
  // existing data, but user-facing exports use VELOCITY naming.
  return join(homedir(), 'VELOCITY', 'exports');
}

/**
 * The server action that:
 *   - Reads athlete settings (parkrun ID, terms acceptance, window default)
 *   - Resolves the weeks to include
 *   - Computes the completed-session strip
 *   - Runs the pure generator
 *   - Writes the JSON to disk (latest + history)
 *   - Updates the last-generated timestamp setting
 *
 * Returns a result object the UI can render.
 */
export async function generateClubShare(formData: FormData): Promise<GenerateShareResult> {
  try {
    // Pre-flight: terms must be accepted
    const termsAt = await getClubTermsAcceptedAt();
    if (!termsAt) {
      return { ok: false, error: 'Terms not accepted. Review and accept the privacy disclosure first.' };
    }

    // Pre-flight: parkrun ID must be set
    const parkrunId = await getClubParkrunId();
    if (!parkrunId || parkrunId.trim().length === 0) {
      return { ok: false, error: 'parkrun ID not set. Enter your ID in the settings card above.' };
    }

    // Read optional GitHub publish settings (non-blocking — absence means local-only)
    const [athleteId, passwordHash, githubPat] = await Promise.all([
      getAthleteId(),
      getSchedulePasswordHash(),
      getGitHubPat(),
    ]);

    // Window: caller can override via form field, otherwise use default setting
    const overrideRaw = formData.get('window')?.toString();
    const validWindows: ClubWindowDefault[] = ['1w', '2w', '4w', 'next-race', 'program-end'];
    let windowOption: ClubWindowDefault;
    if (overrideRaw && validWindows.includes(overrideRaw as ClubWindowDefault)) {
      windowOption = overrideRaw as ClubWindowDefault;
    } else {
      windowOption = await getClubWindowDefault();
    }

    const extensionReason = formData.get('extension_reason')?.toString() || undefined;

    const weekCount = await resolveWeekCount(windowOption);
    const weeks = await buildWeeksForExport(weekCount);

    if (weeks.length === 0) {
      return {
        ok: false,
        error: 'No weeks could be rendered. Check your plan settings and goal race configuration.',
      };
    }

    const { completedSessionKeys, dayHasActivity } = await buildCompletionSets(weeks);

    const generatedAt = new Date();
    const todayIso = generatedAt.toISOString().slice(0, 10);

    const input: GenerateInput = {
      parkrunId,
      windowOption,
      weeks,
      todayIso,
      completedSessionKeys,
      dayHasActivity,
      generatedAt,
      extensionReason,
      passwordHash: passwordHash ?? undefined,
    };

    const payload = generateSchedulePayload(input);
    const json = JSON.stringify(payload, null, 2);

    // Write to disk - latest + history (belt-and-suspenders: always kept)
    const exportDir = shareExportRoot();
    const historyDir = join(exportDir, 'history');
    await mkdir(historyDir, { recursive: true });

    const latestPath = join(exportDir, 'schedule-current.json');
    const filename = buildShareFilename(parkrunId, weeks[0].weekStartIso);
    const archivedPath = join(historyDir, filename);

    await writeFile(latestPath, json, 'utf8');
    await writeFile(archivedPath, json, 'utf8');

    // Update the last-generated setting
    await setClubLastShareGeneratedAt(generatedAt.toISOString());

    // Optional: publish to GitHub if athleteId + PAT are configured
    let githubPublished = false;
    let githubUrl: string | undefined;
    if (athleteId && githubPat) {
      const ghResult = await publishScheduleToGitHub({
        pat: githubPat,
        athleteId,
        content: json,
      });
      githubPublished = ghResult.ok;
      githubUrl = ghResult.url;
    }

    revalidatePath('/settings');
    revalidatePath('/club');

    return {
      ok: true,
      latestPath,
      archivedPath,
      filename,
      sessionCount: payload.schedule.length,
      githubPublished,
      githubUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Smaller server action - just update the persisted parkrun ID setting.
 */
export async function saveParkrunId(formData: FormData): Promise<void> {
  const id = formData.get('parkrun_id')?.toString().trim() ?? '';
  const { setClubParkrunId } = await import('@/lib/store/settings');
  await setClubParkrunId(id);
  revalidatePath('/settings');
}

/**
 * Smaller server action - update default window option.
 */
export async function saveWindowDefault(formData: FormData): Promise<void> {
  const value = formData.get('window_default')?.toString();
  const valid: ClubWindowDefault[] = ['1w', '2w', '4w', 'next-race', 'program-end'];
  if (!value || !valid.includes(value as ClubWindowDefault)) return;
  const { setClubWindowDefault } = await import('@/lib/store/settings');
  await setClubWindowDefault(value as ClubWindowDefault);
  revalidatePath('/settings');
}

/**
 * Accept terms server action - timestamp the acceptance.
 */
export async function acceptClubTerms(): Promise<void> {
  const { setClubTermsAcceptedAt } = await import('@/lib/store/settings');
  await setClubTermsAcceptedAt(new Date().toISOString());
  revalidatePath('/settings');
}

/**
 * Save the athlete ID (numeric parkrun athlete ID, e.g. 1210722).
 */
export async function saveAthleteId(formData: FormData): Promise<void> {
  const id = formData.get('athlete_id')?.toString().trim() ?? '';
  const { setAthleteId } = await import('@/lib/store/settings');
  await setAthleteId(id);
  revalidatePath('/club');
}

/**
 * Hash a plain-text schedule password (SHA-256) and persist only the hash.
 * The raw password is never stored or logged.
 */
export async function saveSchedulePassword(formData: FormData): Promise<void> {
  const raw = formData.get('schedule_password')?.toString() ?? '';
  if (raw.trim().length === 0) return;
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(raw).digest('hex');
  const { setSchedulePasswordHash } = await import('@/lib/store/settings');
  await setSchedulePasswordHash(hash);
  revalidatePath('/club');
}

/**
 * Persist the GitHub PAT to the OS keychain. The PAT is not validated here —
 * validation happens implicitly on the next publish attempt.
 */
export async function saveGitHubPat(formData: FormData): Promise<void> {
  const pat = formData.get('github_pat')?.toString() ?? '';
  if (pat.trim().length === 0) return;
  const { setGitHubPat } = await import('@/lib/store/secrets');
  await setGitHubPat(pat);
  revalidatePath('/club');
}

/**
 * Remove the stored GitHub PAT from the OS keychain.
 */
export async function clearGitHubPatAction(): Promise<void> {
  const { clearGitHubPat } = await import('@/lib/store/secrets');
  await clearGitHubPat();
  revalidatePath('/club');
}
