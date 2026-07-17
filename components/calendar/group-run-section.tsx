import { asc, desc } from 'drizzle-orm';
import { Trash2, Users } from 'lucide-react';
import { getDb, schema } from '@/lib/db';
import {
  createRecurringSession,
  deleteRecurringSession,
} from '@/lib/actions/recurring-sessions';
import { Card, CardLabel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const DOW_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const SESSION_TYPES = [
  { value: 'easy', label: 'Easy' },
  { value: 'long', label: 'Long' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'interval', label: 'Interval' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'repetition', label: 'Repetition' },
  { value: 'cross', label: 'Cross-train' },
  { value: 'strength', label: 'Strength' },
];

/**
 * GroupRunSection — recurring weekly group runs.
 * Server component: queries DB, posts via server actions.
 */
export async function GroupRunSection() {
  const sessions = await (await getDb())
    .select()
    .from(schema.recurringSessions)
    .orderBy(asc(schema.recurringSessions.dow))
    .all();

  // Separate weekly vs Ninja Loop entries
  const weekly = sessions.filter((s) => !s.isNinjaLoop);

  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between">
        <CardLabel className="flex items-center gap-2">
          <Users size={14} strokeWidth={1.5} />
          group runs · weekly
        </CardLabel>
        <span className="font-mono text-xs text-bone-mute">
          {weekly.length} scheduled
        </span>
      </div>

      {weekly.length > 0 && (
        <div className="divide-y divide-ink-line border-y border-ink-line">
          {weekly.map((s) => (
            <div
              key={s.id}
              className="py-3 grid grid-cols-[50px_1fr_80px_120px_90px_28px] gap-3 items-center"
            >
              <span className="font-display tracking-wide-display text-bone-dim text-sm">
                {DOW_LABELS[s.dow] || '—'}
              </span>
              <div className="min-w-0">
                <div className="text-bone truncate">{s.name}</div>
                {s.venue && (
                  <div className="font-mono text-xs text-bone-mute truncate">
                    {s.venue}
                  </div>
                )}
              </div>
              <span className="font-display tracking-wide-display uppercase text-xs text-bone-dim">
                {s.sessionType}
              </span>
              <span className="font-mono text-xs text-bone-dim tabular-nums truncate">
                {s.typicalDistanceKmMin && s.typicalDistanceKmMax
                  ? `${s.typicalDistanceKmMin}–${s.typicalDistanceKmMax} km`
                  : '—'}
              </span>
              <span className="font-mono text-xs text-bone-mute tabular-nums truncate">
                {s.paceLabel || '—'}
              </span>
              <DeleteButton id={s.id} action={deleteRecurringSession} />
            </div>
          ))}
        </div>
      )}

      <form action={createRecurringSession} className="space-y-3 pt-2">
        <input type="hidden" name="isNinjaLoop" value="false" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="gr-name">Name</Label>
            <Input id="gr-name" name="name" placeholder="Shoe Science" required />
          </div>
          <div>
            <Label htmlFor="gr-dow">Day</Label>
            <select
              id="gr-dow"
              name="dow"
              defaultValue="1"
              className="flex h-10 w-full bg-ink-panel border border-ink-line px-3 text-sm text-bone font-mono focus-visible:outline-none focus-visible:border-accent"
            >
              {DOW_LABELS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="gr-type">Session type</Label>
            <select
              id="gr-type"
              name="sessionType"
              defaultValue="easy"
              className="flex h-10 w-full bg-ink-panel border border-ink-line px-3 text-sm text-bone font-mono focus-visible:outline-none focus-visible:border-accent"
            >
              {SESSION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="gr-min">Distance min (km)</Label>
            <Input
              id="gr-min"
              name="typicalDistanceKmMin"
              type="number"
              step="0.1"
              placeholder="8"
            />
          </div>
          <div>
            <Label htmlFor="gr-max">Distance max (km)</Label>
            <Input
              id="gr-max"
              name="typicalDistanceKmMax"
              type="number"
              step="0.1"
              placeholder="12"
            />
          </div>
          <div>
            <Label htmlFor="gr-pace">Pace (display)</Label>
            <Input
              id="gr-pace"
              name="paceLabel"
              type="text"
              placeholder="5:30-6:00/km"
            />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="gr-venue">Venue (optional)</Label>
            <Input
              id="gr-venue"
              name="venue"
              type="text"
              placeholder="Mt Eden · 6am"
            />
          </div>
        </div>
        <Button variant="outline" size="sm" type="submit">
          + Add group run
        </Button>
      </form>
    </Card>
  );
}

function DeleteButton({
  id,
  action,
}: {
  id: number;
  action: (fd: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-bone-mute hover:text-accent transition-colors p-1"
        title="Delete"
      >
        <Trash2 size={16} strokeWidth={1.5} />
      </button>
    </form>
  );
}
