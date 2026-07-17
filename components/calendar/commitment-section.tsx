import { asc, ne, and } from 'drizzle-orm';
import { Trash2, CalendarX } from 'lucide-react';
import { getDb, schema } from '@/lib/db';
import {
  createCalendarEvent,
  deleteCalendarEvent,
} from '@/lib/actions/calendar-events';
import { Card, CardLabel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const EVENT_TYPES = [
  { value: 'holiday', label: 'Holiday' },
  { value: 'work_trip', label: 'Work trip' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'sickness', label: 'Sickness' },
  { value: 'caregiving', label: 'Caregiving' },
  { value: 'other', label: 'Other' },
];

const IMPACTS = [
  { value: 'reduced', label: 'Reduced training' },
  { value: 'travel_only', label: 'Travel only · short easy' },
  { value: 'no_training', label: 'No training' },
  { value: 'none', label: 'Tracking only · no impact' },
];

const TYPE_COLORS: Record<string, string> = {
  holiday: 'text-signal-warn',
  work_trip: 'text-bone-dim',
  birthday: 'text-bone',
  sickness: 'text-accent',
  caregiving: 'text-accent',
  other: 'text-bone-dim',
};

/**
 * CommitmentSection — one-off dated events that affect training capacity.
 * Excludes ninja_loop_holiday entries (those are managed by NinjaLoopSection).
 */
export async function CommitmentSection() {
  const events = await (await getDb())
    .select()
    .from(schema.calendarEvents)
    .where(ne(schema.calendarEvents.eventType, 'ninja_loop_holiday'))
    .orderBy(asc(schema.calendarEvents.startDate))
    .all();

  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between">
        <CardLabel className="flex items-center gap-2">
          <CalendarX size={14} strokeWidth={1.5} />
          commitments · holidays · trips · sickness
        </CardLabel>
        <span className="font-mono text-xs text-bone-mute">
          {events.length} on calendar
        </span>
      </div>

      {events.length > 0 && (
        <div className="divide-y divide-ink-line border-y border-ink-line">
          {events.map((e) => (
            <div
              key={e.id}
              className="py-3 grid grid-cols-[100px_140px_1fr_120px_28px] gap-3 items-center"
            >
              <span
                className={
                  'font-display tracking-wide-display uppercase text-xs ' +
                  (TYPE_COLORS[e.eventType] || 'text-bone-dim')
                }
              >
                {e.eventType.replace('_', ' ')}
              </span>
              <span className="font-mono text-xs text-bone-dim tabular-nums">
                {e.startDate}
                {e.endDate && (
                  <>
                    <br />
                    <span className="text-bone-mute">→ {e.endDate}</span>
                  </>
                )}
              </span>
              <div className="min-w-0">
                <div className="text-bone truncate">{e.title || '—'}</div>
                {e.notes && (
                  <div className="font-mono text-xs text-bone-mute truncate mt-0.5">
                    {e.notes}
                  </div>
                )}
              </div>
              <span className="font-mono text-xs text-bone-dim truncate">
                {IMPACTS.find((i) => i.value === e.impact)?.label || e.impact}
              </span>
              <DeleteButton id={e.id} action={deleteCalendarEvent} />
            </div>
          ))}
        </div>
      )}

      <form action={createCalendarEvent} className="space-y-3 pt-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="ev-type">Type</Label>
            <select
              id="ev-type"
              name="eventType"
              defaultValue="holiday"
              className="flex h-10 w-full bg-ink-panel border border-ink-line px-3 text-sm text-bone font-mono focus-visible:outline-none focus-visible:border-accent"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ev-start">Start date</Label>
            <Input id="ev-start" name="startDate" type="date" required />
          </div>
          <div>
            <Label htmlFor="ev-end">End date (optional)</Label>
            <Input id="ev-end" name="endDate" type="date" />
          </div>
          <div>
            <Label htmlFor="ev-impact">Impact</Label>
            <select
              id="ev-impact"
              name="impact"
              defaultValue="reduced"
              className="flex h-10 w-full bg-ink-panel border border-ink-line px-3 text-sm text-bone font-mono focus-visible:outline-none focus-visible:border-accent"
            >
              {IMPACTS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ev-title">Title</Label>
            <Input
              id="ev-title"
              name="title"
              type="text"
              placeholder="Family in Aussie · 4-week absence"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ev-notes">Notes (optional)</Label>
            <Input
              id="ev-notes"
              name="notes"
              type="text"
              placeholder="Will pack running shoes, no long runs"
            />
          </div>
        </div>
        <Button variant="outline" size="sm" type="submit">
          + Add commitment
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
