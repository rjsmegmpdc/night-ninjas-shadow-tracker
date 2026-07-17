import 'server-only';

/**
 * Phase 4 - interruptions read layer.
 *
 * Reads athlete-logged interruptions from the DB and assembles the view the
 * Journal/Wellness page and Patrol indicator need: the active list, the
 * automatic-suppression flag, the injury-risk read, and any return-to-training
 * phases. Pure logic lives in interruptions-pure.ts; this only does I/O and
 * degrades to empty when the table is absent (migration 0009 not yet run).
 *
 * Note: getAcwrNow is imported dynamically inside getInterruptionsView to
 * avoid a static import cycle (state-aware-week.ts imports
 * hasActiveInjuryOrIllnessNow from here for the 3b suppression gate).
 */

import { getDb, schema } from '@/lib/db';
import {
  isActive,
  hasActiveInjuryOrIllness,
  returnToTraining,
  assessInjuryRisk,
  type Interruption,
  type InterruptionType,
  type InterruptionSeverity,
  type ReturnPhase,
  type InjuryRisk,
} from './interruptions-pure';

export type {
  Interruption,
  InterruptionType,
  InterruptionSeverity,
  ReturnPhase,
  InjuryRisk,
  RiskLevel,
} from './interruptions-pure';

function isMissingTable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /no such table/i.test(m);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readInterruptions(): Promise<Interruption[]> {
  const db = (await getDb());
  try {
    const rows = await db.select().from(schema.interruptions).all();
    return rows.map((r) => ({
      id: r.id,
      type: r.type as InterruptionType,
      bodyRegion: r.bodyRegion,
      severity: r.severity as InterruptionSeverity,
      startDate: r.startDate,
      endDate: r.endDate,
      note: r.note,
    }));
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export interface InterruptionsView {
  all: Interruption[];
  active: Interruption[];
  /** True when an injury or illness is active - the 3b automatic-mode gate. */
  suppressAutomatic: boolean;
  risk: InjuryRisk;
  returns: { interruption: Interruption; phase: ReturnPhase }[];
}

/** Full Journal/Wellness view: active list, suppression flag, risk, returns. */
export async function getInterruptionsView(
  asOfIso: string = todayIso()
): Promise<InterruptionsView> {
  const all = await readInterruptions();
  const active = all.filter(isActive);
  const suppressAutomatic = hasActiveInjuryOrIllness(all);

  let acwr: number | null = null;
  try {
    const { getAcwrNow } = await import('@/lib/plans/state-aware-week');
    acwr = await getAcwrNow();
  } catch {
    acwr = null;
  }
  const risk = assessInjuryRisk({ acwr, interruptions: all, todayIso: asOfIso });

  const returns: { interruption: Interruption; phase: ReturnPhase }[] = [];
  for (const i of all) {
    const phase = returnToTraining(i, asOfIso);
    if (phase) returns.push({ interruption: i, phase });
  }

  return { all, active, suppressAutomatic, risk, returns };
}

/**
 * Cheap suppression check for the 3b pipeline: true when an injury or illness
 * is currently active. Degrades to false if the table is absent so a
 * pre-migration DB never blocks coach adjustments.
 */
export async function hasActiveInjuryOrIllnessNow(): Promise<boolean> {
  const all = await readInterruptions();
  return hasActiveInjuryOrIllness(all);
}

/**
 * Raw interruption list for callers that apply their own pure filters - e.g.
 * the 3b part 2 per-week window-overlap checks (windowsOverlapping) and the
 * automatic-suppression gate (hasActiveInjuryOrIllness), computed from one
 * read. Degrades to [] when the table is absent (pre-migration).
 */
export async function listInterruptions(): Promise<Interruption[]> {
  return readInterruptions();
}
