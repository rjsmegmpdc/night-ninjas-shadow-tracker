import { Gauge } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { getDb, schema } from '@/lib/db';
import { saveCapacity } from '@/lib/actions/capacity';
import { SETTINGS_KEYS } from '@/lib/constants/settings-keys';

async function readCapacity(): Promise<{ weeklyKm: string; longKm: string }> {
  const db = (await getDb());
  const rows = await db.select().from(schema.settings).all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    weeklyKm: map[SETTINGS_KEYS.CAPACITY_WEEKLY] ?? '',
    longKm: map[SETTINGS_KEYS.CAPACITY_LONG] ?? '',
  };
}

/**
 * CapacitySection — weekly volume + long run caps.
 * The plan engine respects these instead of using dojo defaults.
 */
export async function CapacitySection() {
  const { weeklyKm, longKm } = await readCapacity();

  return (
    <Card className="space-y-5">
      <CardLabel className="flex items-center gap-2">
        <Gauge size={14} strokeWidth={1.5} />
        capacity caps · know your limits
      </CardLabel>

      <p className="text-bone-dim text-sm leading-relaxed max-w-xl">
        Most plans assume infinite durability. Yours doesn't. Cap below the
        threshold where your body breaks down — the plan engine will respect
        these instead of pushing toward dojo defaults.
      </p>

      <form action={saveCapacity} className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4 max-w-xl">
          <div>
            <Label htmlFor="cap-weekly">Weekly volume cap (km)</Label>
            <Input
              id="cap-weekly"
              name="weeklyVolumeCapKm"
              type="number"
              step="1"
              defaultValue={weeklyKm}
              placeholder="80"
            />
            <p className="text-bone-mute text-xs mt-2 font-mono">
              ↳ leave blank to use the dojo default
            </p>
          </div>
          <div>
            <Label htmlFor="cap-long">Long run cap (km)</Label>
            <Input
              id="cap-long"
              name="longRunCapKm"
              type="number"
              step="1"
              defaultValue={longKm}
              placeholder="26"
            />
            <p className="text-bone-mute text-xs mt-2 font-mono">
              ↳ Hansons defaults to 26, Lydiard to 35
            </p>
          </div>
        </div>
        <Button variant="outline" size="md" type="submit">
          Save caps
        </Button>
      </form>
    </Card>
  );
}
