import { Card, CardLabel } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { logPageView } from '@/lib/store/instrument';
import { getAllShoesWithStats } from '@/lib/shoes/queries';
import { getDb, schema } from '@/lib/db';
import { listAllShoes } from '@/lib/shoes/database';
import { ShoeQuickAdd } from '@/components/shoes/shoe-quick-add';
import { ShoeTable } from '@/components/shoes/shoe-table';

/**
 * /shoes — table-style gear inventory.
 *
 * Layout (top to bottom):
 *   1. Header
 *   2. Quick-add hero strip
 *   3. Active rotation — table
 *   4. Retired — collapsed by default (<details>)
 *
 * Strava-tracked shoes appear automatically via the sync's gear ingest
 * pipeline. The hero is for off-Strava shoes (manual entry) — anything
 * pre-Strava history, off-Strava boutique gear, or shoes you walk in.
 *
 * Retire is the only destructive action — same as Strava. Once activities
 * are tagged to a shoe, deleting would orphan that history.
 */
export default async function ShoesPage() {
  logPageView('/shoes');

  const activityCount = await (await getDb()).$count(schema.activities);
  const allShoes = await getAllShoesWithStats();
  const active = allShoes.filter((s) => s.status === 'active');
  const retired = allShoes.filter((s) => s.status === 'retired');

  // Sort active by urgency: highest pctUsed first so over-80% shoes
  // float to the top of the table
  const activeSorted = [...active].sort((a, b) => b.pctUsed - a.pctUsed);

  // Build catalog for autocomplete — server-side load, pass to client
  const catalogRaw = listAllShoes();
  const catalog = catalogRaw
    .filter((m) => m.brand && m.model)
    .map((m) => ({
      brand: m.brand,
      model: m.model,
      recommendedKm: m.recommendedKm ?? 800,
    }));

  const hasNoActivities = activityCount === 0;
  const hasNoShoes = allShoes.length === 0;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">profile - equipment</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Equipment
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Strava-mirrored ·{' '}
          <span className="text-bone tabular-nums">{active.length}</span> active
          {retired.length > 0 && (
            <>
              {' · '}
              <span className="text-bone tabular-nums">{retired.length}</span> retired
            </>
          )}
        </div>
      </header>

      {hasNoActivities && (
        <EmptyState
          label="shoes · no data yet"
          title="No activities synced"
          reason="Shoes are pulled automatically from your Strava gear when activities sync. Run an initial sync first to populate this page."
          action={{ href: '/setup/sync', label: 'Run initial sync' }}
        />
      )}

      {!hasNoActivities && (
        <>
          {/* Hero: quick-add */}
          <ShoeQuickAdd catalog={catalog} />

          {hasNoShoes ? (
            <Card className="space-y-3 max-w-2xl border-bone-mute/30">
              <CardLabel>no shoes yet</CardLabel>
              <p className="text-bone-dim text-sm leading-relaxed">
                Activities synced, but no shoes detected. Either none of your
                activities have a gear assigned in Strava, or you haven't run
                the gear backfill yet. On{' '}
                <a href="/settings" className="text-accent underline">
                  Settings
                </a>
                , click "Backfill shoe data" to fetch gear info for historical
                activities — or use the quick-add above for off-Strava shoes.
              </p>
            </Card>
          ) : (
            <>
              {/* Active rotation table */}
              {active.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-baseline justify-between border-b border-ink-line pb-2">
                    <span className="nn-caps">active rotation</span>
                    <span className="font-mono text-[10px] text-bone-mute uppercase tracking-widest tabular-nums">
                      {active.length} shoe{active.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ShoeTable shoes={activeSorted} />
                </section>
              )}

              {/* Retired — collapsed by default */}
              {retired.length > 0 && (
                <section className="space-y-3">
                  <details className="group">
                    <summary className="cursor-pointer flex items-baseline justify-between border-b border-ink-line pb-2 list-none">
                      <span className="nn-caps text-bone-mute group-hover:text-bone transition-colors">
                        ▸ retired
                      </span>
                      <span className="font-mono text-[10px] text-bone-mute uppercase tracking-widest tabular-nums">
                        {retired.length} shoe{retired.length === 1 ? '' : 's'} · click to expand
                      </span>
                    </summary>
                    <div className="pt-3">
                      <ShoeTable shoes={retired} />
                    </div>
                  </details>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
