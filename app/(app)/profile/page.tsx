import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { logPageView } from '@/lib/store/instrument';
import {
  getAthleteProfile,
  getNsHrCalibration,
  getStrengthPreferences,
  getUserTimezone,
  getPromptDefaults,
} from '@/lib/store/settings';
import { getAdapterStatuses } from '@/lib/actions/adapter-status';
import { Vo2ProfileForm } from '@/components/vo2max/vo2-profile-form';
import { NsCalibrationCard } from '@/components/vo2max/ns-calibration-card';
import { StrengthPrefsForm } from '@/components/profile/strength-prefs-form';
import { InjuryLedger } from '@/components/profile/injury-ledger';
import { ConnectionsPanel, type AdapterDisplayRow } from '@/components/profile/connections-panel';

/**
 * Phase 5 - athlete profile. The single place the athlete tells the system who
 * they are: body & calibration (reused from R2.5), HR caps, strength
 * preference, the injury/illness ledger, and (Stage 5) every source
 * Connection the coach can read from. Where generic gives way to personal.
 * Daily wellness check-in moved to the Journal page (Stage 3 - interruption
 * log + wellness merged into one surface).
 */
export default async function ProfilePage() {
  logPageView('/profile');
  const [profile, nsCalibration, strength, adapterStatuses, promptDefaults, timezone] = await Promise.all([
    getAthleteProfile(),
    getNsHrCalibration(),
    getStrengthPreferences(),
    getAdapterStatuses(),
    getPromptDefaults(),
    getUserTimezone(),
  ]);

  // Format each adapter's last-sync in the athlete's local timezone here
  // (server component) since ConnectionsPanel is a client component and
  // getUserTimezone()/formatInTimeZone-against-settings is server-only —
  // same NZ-local convention as the Journal page's refine.
  const adapterRows: AdapterDisplayRow[] = adapterStatuses.map((a) => ({
    id: a.id,
    status: a.status,
    lastSyncLocal: a.lastSyncIso ? formatInTimeZone(new Date(a.lastSyncIso), timezone, 'd MMM yyyy, HH:mm') : null,
    detail: a.detail,
  }));

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

      <section className="space-y-3 pt-2 border-t border-ink-line">
        <div className="space-y-1">
          <span className="nn-caps">profile - connections</span>
          <h2 className="font-display tracking-wide-display text-2xl uppercase text-bone">
            Connections
          </h2>
          <p className="font-mono text-bone-mute text-xs max-w-2xl">
            Every source the coach can read from - status, last sync, and the
            defaults applied when a source stays silent. No nutrition
            importer yet; that research is parked.
          </p>
        </div>
        <ConnectionsPanel adapters={adapterRows} defaults={promptDefaults} />
      </section>
    </div>
  );
}
