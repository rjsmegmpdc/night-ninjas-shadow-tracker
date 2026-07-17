import 'server-only';

/**
 * Phase 3b part 2 - proposal history read layer.
 *
 * The plan_adjustments table is the full audit trail of every coach proposal
 * (across all triggers, modes and outcomes). The Patrol coach card only shows
 * the live current-week proposal; this read layer surfaces the rest for the
 * /coach-log view. Degrades to [] when the table is absent (pre-migration).
 */

import { getDb, schema } from '@/lib/db';
import type { WeekTemplate } from './types';

export type AdjustmentStatus = 'pending' | 'applied' | 'auto-applied' | 'dismissed';

export interface AdjustmentHistoryRow {
  id: number;
  weekStartIso: string | null;
  trigger: string;
  rationale: string;
  mode: string;
  status: AdjustmentStatus;
  proposedAt: string;
  /** applied or dismissed timestamp; null while pending. */
  decidedAt: string | null;
  beforeKm: number | null;
  afterKm: number | null;
}

function totalKm(json: string | null): number | null {
  if (!json) return null;
  try {
    return (JSON.parse(json) as WeekTemplate).totalKmTarget ?? null;
  } catch {
    return null;
  }
}

function statusOf(r: typeof schema.planAdjustments.$inferSelect): AdjustmentStatus {
  if (r.dismissedAt) return 'dismissed';
  if (r.appliedAt) return r.mode === 'automatic' ? 'auto-applied' : 'applied';
  return 'pending';
}

/** Full proposal history, newest proposal first. */
export async function getPlanAdjustmentsHistory(limit = 200): Promise<AdjustmentHistoryRow[]> {
  try {
    const db = (await getDb());
    const rows = await db.select().from(schema.planAdjustments).all();
    rows.sort((a, b) => (a.proposedAt < b.proposedAt ? 1 : -1));
    return rows.slice(0, limit).map((r) => ({
      id: r.id,
      weekStartIso: r.weekStartIso,
      trigger: r.trigger,
      rationale: r.rationale,
      mode: r.mode,
      status: statusOf(r),
      proposedAt: r.proposedAt,
      decidedAt: r.dismissedAt ?? r.appliedAt ?? null,
      beforeKm: totalKm(r.beforeState),
      afterKm: totalKm(r.afterState),
    }));
  } catch {
    return [];
  }
}
