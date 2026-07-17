import { asc } from 'drizzle-orm';
import { Trophy, Flag } from 'lucide-react';
import { getDb, schema } from '@/lib/db';
import { createRace } from '@/lib/actions/races';
import { Card, CardLabel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { GoalRaceEditor } from './goal-race-editor';
import { TuneUpRow } from './tune-up-row';

/**
 * RaceSection — goal race + tune-up races, with full CRUD inline.
 *
 * Server component: queries DB directly, renders into client editor
 * components (GoalRaceEditor, TuneUpRow) that own their own toggle
 * state. Server actions (createRace, updateRace, deleteRace) handle
 * persistence and revalidation.
 *
 * Anchor: the goal race card has id="goal-race" so the Patrol race
 * countdown header link can deep-link to it.
 */
export async function RaceSection() {
  const races = await (await getDb())
    .select()
    .from(schema.races)
    .orderBy(asc(schema.races.raceDate))
    .all();

  const goalRace = races.find((r) => r.isGoal);
  const tuneUps = races.filter((r) => !r.isGoal);

  return (
    <div className="space-y-6">
      {/* Goal race — single, prominent. Anchored for deep-links. */}
      <Card id="goal-race" className="space-y-5 border-accent/40 scroll-mt-6">
        <CardLabel className="text-accent flex items-center gap-2">
          <Trophy size={14} strokeWidth={1.5} />
          goal race · A-race
        </CardLabel>

        {goalRace ? (
          <GoalRaceEditor race={goalRace} />
        ) : (
          /* Goal race not yet set — full create form */
          <form action={createRace} className="space-y-4">
            <input type="hidden" name="isGoal" value="true" />
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="goal-name">Race name</Label>
                <Input
                  id="goal-name"
                  name="name"
                  required
                  placeholder="Auckland Marathon"
                />
              </div>
              <div>
                <Label htmlFor="goal-date">Race date</Label>
                <Input
                  id="goal-date"
                  name="raceDate"
                  type="date"
                  required
                />
              </div>
              <div>
                <Label htmlFor="goal-distance">Distance (km)</Label>
                <Input
                  id="goal-distance"
                  name="distanceKm"
                  type="number"
                  step="0.001"
                  defaultValue="42.195"
                  required
                />
              </div>
              <div>
                <Label htmlFor="goal-time">Target time</Label>
                <Input
                  id="goal-time"
                  name="targetTime"
                  type="text"
                  placeholder="3:30:00"
                  required
                />
                <p className="font-mono text-[10px] text-bone-mute mt-1">
                  ↳ required — pace zones derive from goal pace
                </p>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="goal-level">Experience level</Label>
                <select
                  id="goal-level"
                  name="level"
                  defaultValue="intermediate"
                  className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone focus-visible:outline-none focus-visible:border-accent"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>
            <Button variant="critical" size="md" type="submit">
              Set goal race
            </Button>
          </form>
        )}
      </Card>

      {/* Tune-up races */}
      <Card id="tune-ups" className="space-y-5 scroll-mt-6">
        <div className="flex items-center justify-between">
          <CardLabel className="flex items-center gap-2">
            <Flag size={14} strokeWidth={1.5} />
            tune-up races
          </CardLabel>
          <span className="font-mono text-xs text-bone-mute">
            {tuneUps.length} scheduled
          </span>
        </div>

        {tuneUps.length > 0 && (
          <div className="divide-y divide-ink-line border-y border-ink-line">
            {tuneUps.map((r) => (
              <TuneUpRow key={r.id} race={r} />
            ))}
          </div>
        )}

        <form action={createRace} className="space-y-3 pt-2">
          <input type="hidden" name="isGoal" value="false" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Input name="name" placeholder="Round the Bays" required className="md:col-span-2" />
            <Input name="raceDate" type="date" required />
            <Input name="distanceKm" type="number" step="0.1" placeholder="km" required />
            <Input name="targetTime" type="text" placeholder="time (opt)" />
          </div>
          <Button variant="outline" size="sm" type="submit">
            + Add tune-up
          </Button>
        </form>
      </Card>
    </div>
  );
}
