import Link from 'next/link';
import { logPageView } from '@/lib/store/instrument';
import { getAthleteProfile, getNsHrCalibration, getStrengthPreferences } from '@/lib/store/settings';
import { Vo2ProfileForm } from '@/components/vo2max/vo2-profile-form';
import { NsCalibrationCard } from '@/components/vo2max/ns-calibration-card';
import { StrengthPrefsForm } from '@/components/profile/strength-prefs-form';
import { InjuryLedger } from '@/components/profile/injury-ledger';

/**
 * Phase 5 - athlete profile. The single place the athlete tells the system who
 * they are: body & calibration (reused from R2.5), HR caps, strength
 * preference, and the injury/illness ledger. Where generic gives way to
 * personal. Daily wellness check-in moved to the Journal page (Stage 3 -
 * interruption log + wellness merged into one surface).
 */
export default async function ProfilePage() {
  logPageView('/profile');
  const [profile, nsCalibration, strength] = await Promise.all([
    getAthleteProfile(),
    getNsHrCalibration(),
    getStrengthPreferences(),
  ]);

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-5xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">profile - athlete</span>
        <h1 className="font-display tracking-wide-display text-4xl sm:text-5xl uppercase">Profile</h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Who you are as an athlete - calibration, preferences, and the history the
          plan reads, so generic gives way to personal.
        </div>
      </header>

      <Vo2ProfileForm profile={profile} />
      <NsCalibrationCard calibration={nsCalibration} />
      <StrengthPrefsForm prefs={strength} />

      <div className="border border-ink-line rounded-xl p-6 flex items-center justify-between gap-4">
        <div className="font-mono text-xs text-bone-mute">
          Daily wellness check-in (sleep, energy, work stress) now lives on
          the Journal page, alongside the interruption log.
        </div>
        <Link
          href="/journal"
          className="shrink-0 font-display tracking-wide-display uppercase text-sm text-accent hover:text-accent-hover transition-colors"
        >
          Open Journal →
        </Link>
      </div>

      <InjuryLedger />
    </div>
  );
}
