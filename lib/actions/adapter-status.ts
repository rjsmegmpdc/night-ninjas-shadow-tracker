'use server';

/**
 * Adapter status — read layer for the Connections panel (PRD §8.5, PHASES
 * Phase 11). "One surface listing every adapter (Strava, Garmin, COROS,
 * Polar) with status/last-sync."
 *
 * Status meanings:
 *   'connected'   — live, adapter is the source of truth for its data today.
 *   'wired'       — code path exists and can pull data (manually triggered),
 *                   but isn't part of the automatic daily-loop sync yet.
 *   'placeholder' — no adapter built at all.
 *   'error'       — adapter should be connected/syncing but isn't right now
 *                   (auth missing, last sync failed, rate limited).
 *
 * Garmin is always reported 'wired', per PHASES Phase 11 ("Garmin wired,
 * COROS/Polar placeholders") — even when the athlete has connected their
 * account, Garmin sync is a manual Settings-page trigger
 * (lib/actions/garmin.ts's garminSyncAction), not an ambient/ automatic pull
 * like Strava's. `detail` carries the finer-grained connected/not-connected
 * state so the UI doesn't have to invent wording.
 */

import {
  getStravaClientId,
  getLastSyncAt,
  getGarminSyncEnabled,
  getGarminLastSyncAt,
} from '@/lib/store/settings';
import { getStravaTokens } from '@/lib/store/secrets';
import { getMostRecentJob } from '@/lib/sources/sync-runner';

export type AdapterId = 'strava' | 'garmin' | 'coros' | 'polar';
export type AdapterStatusValue = 'connected' | 'wired' | 'placeholder' | 'error';

export interface AdapterStatusEntry {
  id: AdapterId;
  status: AdapterStatusValue;
  lastSyncIso: string | null;
  detail: string;
}

async function getStravaStatus(): Promise<AdapterStatusEntry> {
  const [clientId, tokens, lastSyncAt, mostRecentJob] = await Promise.all([
    getStravaClientId(),
    getStravaTokens(),
    getLastSyncAt(),
    getMostRecentJob(),
  ]);
  const lastSyncIso = lastSyncAt ? lastSyncAt.toISOString() : null;

  if (!clientId || !tokens) {
    return {
      id: 'strava',
      status: 'error',
      lastSyncIso: null,
      detail: 'Not connected — authorise in Settings.',
    };
  }

  if (mostRecentJob?.status === 'failed') {
    return {
      id: 'strava',
      status: 'error',
      lastSyncIso,
      detail: mostRecentJob.errorMessage ?? 'Last sync failed.',
    };
  }
  if (mostRecentJob?.status === 'rate_limited') {
    return {
      id: 'strava',
      status: 'error',
      lastSyncIso,
      detail: 'Rate limited by Strava — will resume automatically.',
    };
  }

  return {
    id: 'strava',
    status: 'connected',
    lastSyncIso,
    detail: lastSyncIso ? `Last synced ${lastSyncIso}.` : 'Connected — no sync has completed yet.',
  };
}

async function getGarminStatus(): Promise<AdapterStatusEntry> {
  const [enabled, lastSyncIso] = await Promise.all([getGarminSyncEnabled(), getGarminLastSyncAt()]);

  if (!enabled) {
    return {
      id: 'garmin',
      status: 'wired',
      lastSyncIso: null,
      detail: 'Not connected — connect in Settings.',
    };
  }

  return {
    id: 'garmin',
    status: 'wired',
    lastSyncIso,
    detail: lastSyncIso
      ? `Connected — manual sync only, last pulled ${lastSyncIso}.`
      : 'Connected — manual sync only, no pull run yet.',
  };
}

function placeholderAdapter(id: Extract<AdapterId, 'coros' | 'polar'>, label: string): AdapterStatusEntry {
  return {
    id,
    status: 'placeholder',
    lastSyncIso: null,
    detail: `${label} integration is not built yet.`,
  };
}

/** All four adapters, in display order: Strava, Garmin, COROS, Polar. */
export async function getAdapterStatuses(): Promise<AdapterStatusEntry[]> {
  const [strava, garmin] = await Promise.all([getStravaStatus(), getGarminStatus()]);
  return [strava, garmin, placeholderAdapter('coros', 'COROS'), placeholderAdapter('polar', 'Polar')];
}
