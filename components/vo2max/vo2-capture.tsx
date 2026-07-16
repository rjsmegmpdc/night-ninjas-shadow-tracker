'use client';

import { useState, useRef, useTransition } from 'react';
import { Activity, FlaskConical, Footprints, Plus } from 'lucide-react';
import { addLabVo2, addCooperVo2, addRockportVo2, type AddVo2Result } from '@/lib/actions/vo2max';
import type { AthleteProfile } from '@/lib/store/settings';

/**
 * R2.5 - VO2 max capture. Three test entry methods as tabs:
 *   cooper   - enter 12-min distance, formula computes
 *   rockport - weight/age/sex/time/HR, regression computes
 *   lab      - type the measured number
 *
 * Profile (weight/age/sex) prefills the Rockport form when present. Each
 * form is a real <form>; we read it with a ref and hand a FormData to the
 * server action.
 */

type Tab = 'cooper' | 'rockport' | 'lab';

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'cooper', label: 'Cooper 12-min', icon: Activity },
  { id: 'rockport', label: 'Rockport walk', icon: Footprints },
  { id: 'lab', label: 'Lab result', icon: FlaskConical },
];

const inputClass =
  'w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none';

export function Vo2Capture({ profile }: { profile: AthleteProfile }) {
  const [tab, setTab] = useState<Tab>('cooper');
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<AddVo2Result | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  const submit = (action: (fd: FormData) => Promise<AddVo2Result>) => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => {
      const r = await action(fd);
      setResult(r);
      if (r.ok) formRef.current?.reset();
    });
  };

  const actionForTab: Record<Tab, (fd: FormData) => Promise<AddVo2Result>> = {
    cooper: addCooperVo2,
    rockport: addRockportVo2,
    lab: addLabVo2,
  };

  return (
    <div className="nn-card p-6 space-y-5">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
        record a test
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setResult(null); }}
              className={
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ' +
                (tab === t.id
                  ? 'border-accent text-accent bg-accent-faint'
                  : 'border-ink-line text-bone-dim hover:border-ink-line-bold hover:text-bone')
              }
            >
              <Icon size={14} strokeWidth={1.5} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* key forces a fresh form (and reset) when switching tabs */}
      <form ref={formRef} key={tab} onSubmit={(e) => { e.preventDefault(); submit(actionForTab[tab]); }} className="space-y-4">
        {tab === 'cooper' && (
          <>
            <p className="text-sm text-bone-dim leading-relaxed">
              Run as far as possible in exactly 12 minutes on a flat course or
              track. Enter the distance covered.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="distance (m)" hint="e.g. 3000">
                <input name="distance_m" type="number" inputMode="numeric" className={inputClass} placeholder="3000" />
              </Field>
              <Field label="date">
                <input name="date" type="date" className={inputClass} defaultValue={today} />
              </Field>
            </div>
          </>
        )}

        {tab === 'rockport' && (
          <>
            <p className="text-sm text-bone-dim leading-relaxed">
              Walk 1 mile (1609 m) as briskly as you can. Enter your time and
              the heart rate measured immediately on finishing.
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="weight (kg)">
                <input name="weight_kg" type="number" step="0.1" className={inputClass} defaultValue={profile.weightKg ?? ''} placeholder="70" />
              </Field>
              <Field label="age">
                <input name="age" type="number" className={inputClass} defaultValue={profile.age ?? ''} placeholder="40" />
              </Field>
              <Field label="sex">
                <select name="sex" className={inputClass} defaultValue={profile.sex ?? ''}>
                  <option value="">--</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </Field>
              <Field label="walk time (min)" hint="e.g. 13.5">
                <input name="time_min" type="number" step="0.01" className={inputClass} placeholder="13.5" />
              </Field>
              <Field label="finishing HR">
                <input name="end_hr" type="number" className={inputClass} placeholder="140" />
              </Field>
              <Field label="date">
                <input name="date" type="date" className={inputClass} defaultValue={today} />
              </Field>
            </div>
          </>
        )}

        {tab === 'lab' && (
          <>
            <p className="text-sm text-bone-dim leading-relaxed">
              Enter a VO2 max measured in a lab (graded treadmill / gas
              exchange). Treated as ground truth - outranks all estimates.
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="VO2 max" hint="ml/kg/min">
                <input name="value" type="number" step="0.1" className={inputClass} placeholder="58.0" />
              </Field>
              <Field label="date">
                <input name="date" type="date" className={inputClass} defaultValue={today} />
              </Field>
              <Field label="note (optional)">
                <input name="note" type="text" className={inputClass} placeholder="Lab / protocol" />
              </Field>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} strokeWidth={1.5} />
          {isPending ? 'Saving...' : 'Record'}
        </button>
      </form>

      {result && (
        <div
          className={
            'rounded-lg p-3 text-sm ' +
            (result.ok ? 'bg-signal-ok/10 border border-signal-ok/40 text-signal-ok'
                       : 'bg-signal-miss/10 border border-signal-miss/40 text-signal-miss')
          }
        >
          {result.ok ? `Recorded VO2 max ${result.value} ml/kg/min.` : result.error}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="space-y-1.5 block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">{label}</span>
      {children}
      {hint && <span className="font-mono text-[10px] text-bone-mute block">{hint}</span>}
    </label>
  );
}
