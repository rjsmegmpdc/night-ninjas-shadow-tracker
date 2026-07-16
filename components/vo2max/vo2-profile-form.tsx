'use client';

import { useRef, useState, useTransition } from 'react';
import { User } from 'lucide-react';
import { saveProfile } from '@/lib/actions/vo2max';
import type { AthleteProfile } from '@/lib/store/settings';

/**
 * R2.5 - athlete profile. Physical attributes the VO2 estimators and HR
 * calibration use. Saved to settings; also consumed by the load engine's
 * calibration once wired (max HR / resting HR feed HR-reserve zones).
 */
const inputClass =
  'w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none';

export function Vo2ProfileForm({ profile }: { profile: AthleteProfile }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setSaved(false);
    startTransition(async () => {
      await saveProfile(fd);
      setSaved(true);
    });
  };

  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <User size={16} strokeWidth={1.5} className="text-bone-mute" />
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          athlete profile
        </div>
      </div>
      <p className="text-sm text-bone-dim leading-relaxed">
        Used by the Rockport estimate and, where set, to calibrate heart-rate
        zones. A measured max HR turns estimated zones into calibrated ones.
      </p>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <div className="grid sm:grid-cols-5 gap-3">
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">age</span>
            <input name="age" type="number" className={inputClass} defaultValue={profile.age ?? ''} placeholder="40" />
          </label>
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">weight (kg)</span>
            <input name="weight_kg" type="number" step="0.1" className={inputClass} defaultValue={profile.weightKg ?? ''} placeholder="70" />
          </label>
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">sex</span>
            <select name="sex" className={inputClass} defaultValue={profile.sex ?? ''}>
              <option value="">--</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">max HR</span>
            <input name="max_hr" type="number" className={inputClass} defaultValue={profile.maxHr ?? ''} placeholder="185" />
          </label>
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">resting HR</span>
            <input name="resting_hr" type="number" className={inputClass} defaultValue={profile.restingHr ?? ''} placeholder="48" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone hover:border-ink-line-bold disabled:opacity-50 font-display tracking-wide-display uppercase text-sm"
          >
            {isPending ? 'Saving...' : 'Save profile'}
          </button>
          {saved && <span className="font-mono text-xs text-signal-ok">Saved.</span>}
        </div>
      </form>
    </div>
  );
}
