import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { selectDojo } from '@/lib/actions/dojo';
import { DojoPicker } from '@/components/dojo/dojo-picker';
import { getHrAvailability } from '@/lib/analysis/hr-availability';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

const STEPS = ['Welcome', 'Strava App', 'Connect', 'Dojo', 'Races', 'Weekly', 'Sync'];

export default async function DojoPage() {
  // Read currently-selected dojo (if user is editing rather than picking fresh)
  const db = (await getDb());
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'plan.dojo'))
    .get();
  const selectedDojo = (row?.value ?? null) as
    | 'lydiard' | 'hansons' | 'norwegian-singles' | 'daniels' | 'pfitzinger' | 'higdon' | 'polarised' | 'ultra' | 'custom' | null;

  // Only the cost of the HR check when NS is the current selection - that's
  // the only dojo whose callout needs it. Also seed Matt's personal HR caps
  // as editable defaults the first time NS is the active choice.
  let hrAvailability = null;
  if (selectedDojo === 'norwegian-singles') {
    const { seedNsDefaultsOnce } = await import('@/lib/store/settings');
    await seedNsDefaultsOnce();
    hrAvailability = await getHrAvailability(42);
  }

  return (
    <div className="space-y-10">
      <Stepper steps={STEPS} current={4} />

      <div className="space-y-3">
        <span className="nn-caps">step 04 - pick your dojo</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Choose your<br />training method
        </h1>
        <p className="text-bone-dim max-w-2xl">
          Each dojo brings a different philosophy. The plan engine derives
          your pace zones, weekly structure, taper, and compliance checks
          from this choice. You can change later.
        </p>
      </div>

      <DojoPicker
        selectedDojo={selectedDojo}
        defaultLevel="intermediate"
        onSelectFormAction={selectDojo}
        hrAvailability={hrAvailability}
      />

      <div className="flex items-center justify-start">
        <Link href="/setup/connect">
          <Button variant="ghost">- Back</Button>
        </Link>
      </div>
    </div>
  );
}
