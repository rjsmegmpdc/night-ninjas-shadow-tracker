'use client';

import { useRef, useState, useTransition } from 'react';
import { HeartPulse, Info } from 'lucide-react';
import { saveNsCalibration } from '@/lib/actions/vo2max';
import type { NsHrCalibration } from '@/lib/store/settings';

/**
 * NS HR calibration editor. Shows the athlete's sub-threshold and easy HR
 * caps - seeded from their own worked-out values as editable defaults - and
 * the confidence flag. While confidence is 'estimated', a prompt nudges
 * toward a hill-sprint max test.
 */
const inputClass =
  'w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none';

export function NsCalibrationCard({ calibration }: { calibration: NsHrCalibration }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [measured, setMeasured] = useState(calibration.confidence === 'measured');

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set('confidence', measured ? 'measured' : 'estimated');
    setSaved(false);
    startTransition(async () => {
      await saveNsCalibration(fd);
      setSaved(true);
    });
  };

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <HeartPulse size={16} strokeWidth={1.5} className="text-accent" />
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          norwegian singles - hr caps
        </div>
      </div>

      <p className="text-sm text-bone-dim leading-relaxed">
        These absolute HR caps drive the NS discipline guards. Easy runs should
        stay under the easy cap; sub-threshold reps under the sub-threshold cap.
        They're seeded from your own calibration - edit if you re-test.
      </p>

      {calibration.confidence === 'estimated' && (
        <div className="flex items-start gap-2 bg-signal-warn/10 border border-signal-warn/40 rounded-lg p-3">
          <Info size={14} strokeWidth={1.5} className="text-signal-warn shrink-0 mt-0.5" />
          <span className="text-sm text-bone-dim leading-relaxed">
            Marked estimated - your max HR (166) was medium-confidence pending a
            hill-sprint test. Run one, set a measured max above, then tick
            "measured" here to lock these in.
          </span>
        </div>
      )}

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">easy HR cap (bpm)</span>
            <input name="easy_hr_cap" type="number" className={inputClass} defaultValue={calibration.easyHrCap ?? ''} placeholder="128" />
          </label>
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">sub-threshold HR cap (bpm)</span>
            <input name="subt_hr_cap" type="number" className={inputClass} defaultValue={calibration.subThresholdHrCap ?? ''} placeholder="141" />
          </label>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={measured} onChange={(e) => setMeasured(e.target.checked)} className="accent-accent" />
          <span className="text-sm text-bone-dim">Max HR is measured (field-tested), not estimated</span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone hover:border-ink-line-bold disabled:opacity-50 font-display tracking-wide-display uppercase text-sm"
          >
            {isPending ? 'Saving...' : 'Save caps'}
          </button>
          {saved && <span className="font-mono text-xs text-signal-ok">Saved.</span>}
        </div>
      </form>
    </div>
  );
}
