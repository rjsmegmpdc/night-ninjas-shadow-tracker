import 'server-only';

/**
 * Phase 3b part 2 - overlay coach adjustments onto the program matrix (I/O).
 *
 * The matrix renders many weeks; running the full state-aware pipeline per week
 * would be both expensive and wrong (today's ACWR/TSB/monotony say nothing
 * about a week six weeks out). Instead we use HYBRID semantics:
 *
 *   (a) an already applied / automatic plan_adjustments row is ALWAYS reflected
 *       on its week - it is the real prescription;
 *   (b) for FUTURE weeks only, a logged sickness/travel window overlapping the
 *       week yields a DISPLAY-ONLY adjusted template (no DB write) so the matrix
 *       previews the lighter week the athlete already knows is coming.
 *
 * The current week's live proposal is owned by resolveCoachAdjustment (the
 * Patrol coach card); the matrix only reflects what is already applied for it.
 * The per-week overlay decision is pure (matrix-adjustments-pure.ts); this file
 * batch-loads the context once per render.
 */

import { getDb, schema } from '@/lib/db';
import { listInterruptions } from '@/lib/analysis/interruptions';
import type { Interruption } from '@/lib/analysis/interruptions-pure';
import type { AppliedWeek, MatrixAdjustmentContext } from './matrix-adjustments-pure';

export { overlayWeekAdjustment } from './matrix-adjustments-pure';
export type { MatrixAdjustmentContext, WeekOverlayResult, AppliedWeek } from './matrix-adjustments-pure';

/**
 * Batch-load (ONCE) the applied plan_adjustments + logged interruptions used to
 * overlay a range of matrix weeks. Degrades to empty maps/lists when either
 * table is absent (pre-migration) so the matrix always renders.
 */
export async function loadMatrixAdjustmentContext(): Promise<MatrixAdjustmentContext> {
  const appliedByWeek = new Map<string, AppliedWeek & { proposedAt: string }>();
  try {
    const db = (await getDb());
    const rows = await db.select().from(schema.planAdjustments).all();
    for (const r of rows) {
      if (!r.appliedAt || !r.afterState || !r.weekStartIso) continue;
      const prev = appliedByWeek.get(r.weekStartIso);
      if (!prev || r.proposedAt > prev.proposedAt) {
        appliedByWeek.set(r.weekStartIso, {
          afterState: r.afterState,
          mode: r.mode,
          trigger: r.trigger,
          proposedAt: r.proposedAt,
        });
      }
    }
  } catch {
    // plan_adjustments table absent (pre-migration) -> no applied overlays
  }

  let interruptions: Interruption[] = [];
  try {
    interruptions = await listInterruptions();
  } catch {
    interruptions = [];
  }

  const cleaned = new Map<string, AppliedWeek>();
  for (const [week, v] of appliedByWeek) {
    cleaned.set(week, { afterState: v.afterState, mode: v.mode, trigger: v.trigger });
  }
  return { appliedByWeek: cleaned, interruptions };
}
