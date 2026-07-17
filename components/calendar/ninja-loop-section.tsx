import { eq, and, gte } from 'drizzle-orm';
import { Moon, RefreshCw, AlertTriangle } from 'lucide-react';
import { getDb, schema } from '@/lib/db';
import {
  enableNinjaLoopHolidays,
  disableNinjaLoopHolidays,
  createCalendarEvent,
  deleteCalendarEvent,
} from '@/lib/actions/calendar-events';
import {
  refreshNzHolidays,
  getRefreshStatus,
  deleteHoliday,
} from '@/lib/actions/refresh-holidays';
import { Card, CardLabel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { upcomingHolidays } from '@/lib/data/nz-holidays';
import { AddPersonalDayForm } from './add-personal-day-form';

/**
 * NinjaLoopSection — toggle that bulk-creates calendar events for every
 * upcoming NZ public holiday so the plan engine schedules a Ninja Loop
 * group run on each one.
 *
 * Source of truth: sohnemann/New-Zealand-Public-Holidays iCal on GitHub,
 * fetched and cached locally. Manual refresh button + auto-refresh on
 * 1 September each year.
 */
export async function NinjaLoopSection() {
  const today = new Date().toISOString().slice(0, 10);

  const [ninjaLoops, upcoming, personalDays, status] = await Promise.all([
    (await getDb())
      .select()
      .from(schema.calendarEvents)
      .where(
        and(
          eq(schema.calendarEvents.eventType, 'ninja_loop_holiday'),
          gte(schema.calendarEvents.startDate, today)
        )
      )
      .all(),
    upcomingHolidays(50), // pull all upcoming, no longer capped at 6
    // Personal days: birthdays, anniversaries — anything tagged 'birthday'
    // by the user via AddPersonalDayForm
    (await getDb())
      .select()
      .from(schema.calendarEvents)
      .where(
        and(
          eq(schema.calendarEvents.eventType, 'birthday'),
          gte(schema.calendarEvents.startDate, today)
        )
      )
      .all(),
    getRefreshStatus(),
  ]);

  const enabled = ninjaLoops.length > 0;
  const lastRefresh = status.lastRefreshAt
    ? new Date(status.lastRefreshAt)
    : null;
  const lastRefreshLabel = lastRefresh
    ? formatRelative(lastRefresh)
    : 'never';

  return (
    <Card
      className={
        'space-y-5 ' + (enabled ? 'border-accent/40' : 'border-ink-line')
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <CardLabel
            className={
              'flex items-center gap-2 ' + (enabled ? 'text-accent' : '')
            }
          >
            <Moon size={14} strokeWidth={1.5} />
            ninja loop · NZ public holidays
          </CardLabel>
          <p className="text-bone-dim text-sm leading-relaxed max-w-xl">
            When enabled, every NZ public holiday in your training window
            auto-creates a Ninja Loop group run. Tradition since 2016.
          </p>
        </div>

        <form
          action={
            enabled ? disableNinjaLoopHolidays : enableNinjaLoopHolidays
          }
        >
          <Button
            variant={enabled ? 'critical' : 'primary'}
            size="md"
            type="submit"
          >
            {enabled ? 'Disable' : 'Enable'}
          </Button>
        </form>
      </div>

      {/* Holiday source + refresh row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 border-t border-ink-line">
        <div className="flex flex-col gap-0.5">
          <span className="nn-caps">source</span>
          <span className="font-mono text-xs text-bone-dim">
            {status.lastSource ?? 'sohnemann iCal · not yet fetched'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="nn-caps">last refresh</span>
          <span className="font-mono text-xs text-bone-dim tabular-nums">
            {lastRefreshLabel}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="nn-caps">next auto</span>
          <span className="font-mono text-xs text-bone-dim tabular-nums">
            {status.nextAutoRefreshAt}
          </span>
        </div>
        <div className="flex-1" />
        <form action={async () => { 'use server'; await refreshNzHolidays(); }}>
          <Button variant="outline" size="sm" type="submit">
            <RefreshCw size={14} strokeWidth={1.5} className="mr-2" />
            Refresh from GitHub iCal
          </Button>
        </form>
      </div>

      {status.lastError && (
        <div className="flex items-start gap-2 p-3 border border-accent/40 bg-ink-shadow">
          <AlertTriangle
            size={14}
            strokeWidth={1.5}
            className="text-accent mt-0.5 flex-shrink-0"
          />
          <div className="font-mono text-xs text-bone-dim leading-relaxed">
            <div className="text-accent mb-0.5">last refresh failed</div>
            {status.lastError}
          </div>
        </div>
      )}

      {/* Upcoming holidays + personal days */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <CardLabel>upcoming holidays + personal days</CardLabel>
          <span className="font-mono text-[10px] text-bone-mute">
            {upcoming.length} holiday{upcoming.length === 1 ? '' : 's'}
            {personalDays.length > 0 ? ` · ${personalDays.length} personal` : ''}
          </span>
        </div>

        {/* Add personal day */}
        <AddPersonalDayForm />

        {(upcoming.length > 0 || personalDays.length > 0) ? (
          <div className="border border-ink-line divide-y divide-ink-line">
            {/* Merge & sort by date */}
            {mergeAndSort(upcoming, personalDays).map((item) => {
              const isPersonal = item.kind === 'personal';
              const isScheduled = !isPersonal && ninjaLoops.some((l) => l.startDate === item.date);
              return (
                <div
                  key={`${item.kind}-${item.date}-${item.name}`}
                  className="grid grid-cols-[110px_24px_1fr_140px_auto] gap-3 items-center py-2 px-3"
                >
                  <span className="font-mono text-xs text-bone-mute tabular-nums">
                    {item.date}
                  </span>
                  <span className={'font-mono text-[10px] uppercase tracking-widest ' + (isPersonal ? 'text-accent' : 'text-bone-mute')}>
                    {isPersonal ? '★' : '○'}
                  </span>
                  <span className={
                    'font-display tracking-wide-display uppercase text-sm ' +
                    (isPersonal ? 'text-bone' : isScheduled ? 'text-accent' : 'text-bone-dim')
                  }>
                    {item.name}
                  </span>
                  <span className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
                    {isPersonal ? 'personal' : isScheduled ? '◆ scheduled' : '○ not scheduled'}
                  </span>
                  {/* Delete */}
                  {isPersonal ? (
                    <form action={deleteCalendarEvent}>
                      <input type="hidden" name="id" value={item.eventId!} />
                      <button
                        type="submit"
                        className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-accent transition-colors"
                        title="Delete personal day"
                      >
                        Delete
                      </button>
                    </form>
                  ) : (
                    <form action={deleteHoliday}>
                      <input type="hidden" name="date" value={item.date} />
                      <input type="hidden" name="name" value={item.name} />
                      <button
                        type="submit"
                        className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-accent transition-colors"
                        title="Hide holiday (will reappear if Refresh is clicked)"
                      >
                        Hide
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="font-mono text-xs text-bone-mute py-3">
            ↳ no holidays cached yet · click refresh to fetch from sohnemann iCal
          </div>
        )}
      </div>

      <div className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
        ↳ {ninjaLoops.length} ninja loops on the calendar
      </div>
    </Card>
  );
}

function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const iso = date.toISOString().slice(0, 10);
  if (diffDays === 0) return `today (${iso})`;
  if (diffDays === 1) return `1 day ago (${iso})`;
  if (diffDays < 30) return `${diffDays} days ago (${iso})`;
  if (diffDays < 365)
    return `${Math.floor(diffDays / 30)} months ago (${iso})`;
  return `${Math.floor(diffDays / 365)} years ago (${iso})`;
}

interface MergedItem {
  kind: 'holiday' | 'personal';
  date: string;
  name: string;
  eventId?: number; // for personal days only - used for delete
}

/** Merge holidays + personal calendar events and sort by date ascending. */
function mergeAndSort(
  holidays: { date: string; name: string }[],
  personalDays: { id: number; startDate: string; title: string | null }[]
): MergedItem[] {
  const merged: MergedItem[] = [];
  for (const h of holidays) {
    merged.push({ kind: 'holiday', date: h.date, name: h.name });
  }
  for (const p of personalDays) {
    merged.push({
      kind: 'personal',
      date: p.startDate,
      name: p.title || 'Personal day',
      eventId: p.id,
    });
  }
  merged.sort((a, b) => a.date.localeCompare(b.date));
  return merged;
}
