'use client';

import { useState, useTransition } from 'react';
import {
  User,
  Lock,
  Github,
  Share2,
  Clock,
  FileJson,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  generateClubShare,
  saveParkrunId,
  saveWindowDefault,
  saveAthleteId,
  saveSchedulePassword,
  saveGitHubPat,
  clearGitHubPatAction,
  type GenerateShareResult,
} from '@/lib/actions/generate-club-share';
import { ClubShareTermsModal } from './terms-modal';
import { VerdictCard } from '@/components/ui/verdict-card';
import type { ClubWindowDefault } from '@/lib/store/settings';

interface Props {
  /** Numeric parkrun athlete ID (e.g. "1210722"), null if not set */
  athleteId: string | null;
  /** True if a schedule password hash is stored */
  passwordIsSet: boolean;
  /** True if a GitHub PAT is stored in the keychain */
  gitHubPatIsSet: boolean;
  initialParkrunId: string | null;
  initialWindow: ClubWindowDefault;
  termsAcceptedAt: string | null;
  lastGeneratedAt: string | null;
}

const WINDOW_LABELS: Record<ClubWindowDefault, string> = {
  '1w': '1 week',
  '2w': '2 weeks (default)',
  '4w': '4 weeks',
  'next-race': 'Until next race',
  'program-end': 'Until program ends',
};

function isStale(lastIso: string | null): boolean {
  if (!lastIso) return false;
  const last = new Date(lastIso);
  const now = new Date();
  const days = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return days > 5;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toISOString().slice(0, 10);
}

function SectionCard({
  icon: Icon,
  label,
  title,
  children,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nn-card p-6 space-y-5">
      <div className="flex items-start gap-3">
        <Icon size={20} strokeWidth={1.5} className="text-accent shrink-0 mt-1" />
        <div className="flex-1">
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
            {label}
          </div>
          <h3 className="font-display tracking-wide-display uppercase text-xl text-bone mt-0.5">
            {title}
          </h3>
        </div>
      </div>
      {children}
    </div>
  );
}

export function ClubPage({
  athleteId: initialAthleteId,
  passwordIsSet: initialPasswordIsSet,
  gitHubPatIsSet: initialGitHubPatIsSet,
  initialParkrunId,
  initialWindow,
  termsAcceptedAt,
  lastGeneratedAt,
}: Props) {
  // Identity
  const [athleteId, setAthleteId] = useState(initialAthleteId ?? '');
  const [savingAthleteId, startSaveAthleteId] = useTransition();

  // Password
  const [password, setPassword] = useState('');
  const [passwordIsSet, setPasswordIsSet] = useState(initialPasswordIsSet);
  const [savingPassword, startSavePassword] = useTransition();

  // GitHub
  const [pat, setPat] = useState('');
  const [patIsSet, setPatIsSet] = useState(initialGitHubPatIsSet);
  const [savingPat, startSavePat] = useTransition();
  const [clearingPat, startClearPat] = useTransition();

  // Generate
  const [parkrunId, setParkrunId] = useState(initialParkrunId ?? '');
  const [windowDefault, setWindow] = useState<ClubWindowDefault>(initialWindow);
  const [showTerms, setShowTerms] = useState(false);
  const [generating, startGenerate] = useTransition();
  const [savingId, startSaveId] = useTransition();
  const [result, setResult] = useState<GenerateShareResult | null>(null);

  const termsAccepted = termsAcceptedAt !== null;
  const canGenerate = termsAccepted && parkrunId.trim().length > 0;
  const stale = isStale(lastGeneratedAt);

  // ---- Identity handlers ----

  const handleSaveAthleteId = () => {
    const fd = new FormData();
    fd.set('athlete_id', athleteId);
    startSaveAthleteId(() => {
      saveAthleteId(fd);
    });
  };

  // ---- Password handlers ----

  const handleSavePassword = () => {
    if (password.trim().length === 0) return;
    const fd = new FormData();
    fd.set('schedule_password', password);
    startSavePassword(async () => {
      await saveSchedulePassword(fd);
      setPassword('');
      setPasswordIsSet(true);
    });
  };

  // ---- GitHub PAT handlers ----

  const handleSavePat = () => {
    if (pat.trim().length === 0) return;
    const fd = new FormData();
    fd.set('github_pat', pat);
    startSavePat(async () => {
      await saveGitHubPat(fd);
      setPat('');
      setPatIsSet(true);
    });
  };

  const handleClearPat = () => {
    startClearPat(async () => {
      await clearGitHubPatAction();
      setPatIsSet(false);
    });
  };

  // ---- Generate handlers ----

  const handleSaveParkrunId = () => {
    const fd = new FormData();
    fd.set('parkrun_id', parkrunId);
    startSaveId(() => {
      saveParkrunId(fd);
    });
  };

  const handleWindowChange = (v: ClubWindowDefault) => {
    setWindow(v);
    const fd = new FormData();
    fd.set('window_default', v);
    startSaveId(() => {
      saveWindowDefault(fd);
    });
  };

  const handleGenerate = () => {
    if (!canGenerate) {
      if (!termsAccepted) setShowTerms(true);
      return;
    }
    const fd = new FormData();
    fd.set('window', windowDefault);
    startGenerate(async () => {
      const r = await generateClubShare(fd);
      setResult(r);
    });
  };

  return (
    <>
      {/* Section 1: Identity */}
      <SectionCard icon={User} label="identity" title="Athlete ID">
        <p className="text-sm text-bone-dim leading-relaxed">
          Your numeric parkrun athlete ID. Found in your parkrun URL —
          e.g. <code className="font-mono text-bone">parkrun.co.nz/parkrunner/1210722/</code>.
          Used to route your schedule on the club site.
        </p>
        <div className="space-y-2">
          <label
            htmlFor="club-athlete-id"
            className="font-display tracking-wide-display uppercase text-xs text-bone-mute block"
          >
            Athlete ID
          </label>
          <div className="flex gap-2">
            <input
              id="club-athlete-id"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              onBlur={handleSaveAthleteId}
              placeholder="e.g. 1210722"
              className="flex-1 bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveAthleteId}
              disabled={savingAthleteId}
              className="px-4 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone-dim hover:text-bone hover:border-ink-line-bold disabled:opacity-50 text-sm"
            >
              {savingAthleteId ? 'Saved' : 'Save'}
            </button>
          </div>
          {athleteId.trim().length > 0 && (
            <p className="font-mono text-[10px] text-signal-ok">
              ↳ schedule will publish to public/schedules/{athleteId}.json
            </p>
          )}
        </div>
      </SectionCard>

      {/* Section 2: Schedule Password */}
      <SectionCard icon={Lock} label="access control" title="Schedule Password">
        <p className="text-sm text-bone-dim leading-relaxed">
          An optional password included as a SHA-256 hash in your published schedule.
          The club site verifies it client-side when displaying your schedule.
          Default suggestion: your parkrun PB time (e.g. <code className="font-mono text-bone">23:45</code>).
        </p>
        <div className="flex items-center gap-2 text-xs">
          {passwordIsSet ? (
            <>
              <CheckCircle2 size={14} strokeWidth={1.5} className="text-signal-ok" />
              <span className="text-bone-dim">Password is set.</span>
            </>
          ) : (
            <>
              <XCircle size={14} strokeWidth={1.5} className="text-bone-mute" />
              <span className="text-bone-mute">No password set — schedule is publicly readable.</span>
            </>
          )}
        </div>
        <div className="space-y-2">
          <label
            htmlFor="club-schedule-password"
            className="font-display tracking-wide-display uppercase text-xs text-bone-mute block"
          >
            {passwordIsSet ? 'Change password' : 'Set password'}
          </label>
          <div className="flex gap-2">
            <input
              id="club-schedule-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="e.g. 23:45"
              autoComplete="off"
              className="flex-1 bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSavePassword}
              disabled={savingPassword || password.trim().length === 0}
              className="px-4 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone-dim hover:text-bone hover:border-ink-line-bold disabled:opacity-50 text-sm"
            >
              {savingPassword ? 'Saved' : 'Save'}
            </button>
          </div>
          <p className="font-mono text-[10px] text-bone-mute">
            ↳ only the SHA-256 hash is stored and published — the raw password never leaves this field.
          </p>
        </div>
      </SectionCard>

      {/* Section 3: GitHub Connection */}
      <SectionCard icon={Github} label="github" title="GitHub Connection">
        <p className="text-sm text-bone-dim leading-relaxed">
          A GitHub Personal Access Token (classic or fine-grained) with{' '}
          <code className="font-mono text-bone">contents: write</code> access to{' '}
          <code className="font-mono text-bone">mttSpierings/nightninja-report</code>.
          Stored in your OS keychain — never logged or synced.
        </p>
        <div className="flex items-center gap-2 text-xs">
          {patIsSet ? (
            <>
              <CheckCircle2 size={14} strokeWidth={1.5} className="text-signal-ok" />
              <span className="text-bone-dim">PAT connected. Schedule will auto-publish on generate.</span>
            </>
          ) : (
            <>
              <XCircle size={14} strokeWidth={1.5} className="text-bone-mute" />
              <span className="text-bone-mute">No PAT set — generate will write local file only.</span>
            </>
          )}
        </div>
        <div className="space-y-2">
          <label
            htmlFor="club-github-pat"
            className="font-display tracking-wide-display uppercase text-xs text-bone-mute block"
          >
            {patIsSet ? 'Replace PAT' : 'Enter PAT'}
          </label>
          <div className="flex gap-2">
            <input
              id="club-github-pat"
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="ghp_..."
              autoComplete="off"
              className="flex-1 bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSavePat}
              disabled={savingPat || pat.trim().length === 0}
              className="px-4 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone-dim hover:text-bone hover:border-ink-line-bold disabled:opacity-50 text-sm"
            >
              {savingPat ? 'Saved' : 'Save'}
            </button>
          </div>
          {patIsSet && (
            <button
              type="button"
              onClick={handleClearPat}
              disabled={clearingPat}
              className="font-mono text-[11px] text-signal-miss hover:underline disabled:opacity-50"
            >
              {clearingPat ? 'Clearing...' : 'Clear PAT from keychain'}
            </button>
          )}
          <p className="font-mono text-[10px] text-bone-mute">
            ↳ needs repo write access to mttSpierings/nightninja-report. Stored in Windows Credential Manager.
          </p>
        </div>
      </SectionCard>

      {/* Section 4: Generate & Publish */}
      <SectionCard icon={Share2} label="generate + publish" title="Club Schedule">
        <p className="text-sm text-bone-dim leading-relaxed">
          Generate your upcoming training schedule and publish it to the Night Ninjas
          club site. The file is also written locally as a belt-and-suspenders backup.
        </p>

        {stale && (
          <div className="flex items-start gap-2 bg-signal-warn/10 border border-signal-warn/40 rounded-lg p-3">
            <AlertTriangle size={16} strokeWidth={1.5} className="text-signal-warn shrink-0 mt-0.5" />
            <div className="text-sm text-bone-dim">
              <span className="text-signal-warn font-medium">Stale</span> — last
              generated {formatRelative(lastGeneratedAt)}. Regenerate before the club site refreshes.
            </div>
          </div>
        )}

        {/* parkrun ID for schedule routing */}
        <div className="space-y-2">
          <label
            htmlFor="gen-parkrun-id"
            className="font-display tracking-wide-display uppercase text-xs text-bone-mute block"
          >
            parkrun ID
          </label>
          <div className="flex gap-2">
            <input
              id="gen-parkrun-id"
              type="text"
              value={parkrunId}
              onChange={(e) => setParkrunId(e.target.value)}
              onBlur={handleSaveParkrunId}
              placeholder="e.g. A1234567"
              className="flex-1 bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveParkrunId}
              disabled={savingId}
              className="px-4 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone-dim hover:text-bone hover:border-ink-line-bold disabled:opacity-50 text-sm"
            >
              {savingId ? 'Saved' : 'Save'}
            </button>
          </div>
          <p className="font-mono text-[10px] text-bone-mute">
            ↳ included in the JSON payload to identify you to the club app
          </p>
        </div>

        {/* Window selector */}
        <div className="space-y-2">
          <label className="font-display tracking-wide-display uppercase text-xs text-bone-mute block">
            Window
          </label>
          <select
            value={windowDefault}
            onChange={(e) => handleWindowChange(e.target.value as ClubWindowDefault)}
            className="w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-sm text-bone focus:border-accent focus:outline-none"
          >
            {(Object.keys(WINDOW_LABELS) as ClubWindowDefault[]).map((k) => (
              <option key={k} value={k}>
                {WINDOW_LABELS[k]}
              </option>
            ))}
          </select>
          <p className="font-mono text-[10px] text-bone-mute">
            ↳ how far forward to publish. Strips completed sessions automatically.
          </p>
        </div>

        {/* Terms status */}
        <div className="flex items-center gap-2 text-xs">
          {termsAccepted ? (
            <>
              <span className="text-signal-ok">●</span>
              <span className="text-bone-dim">
                Privacy terms accepted on {termsAcceptedAt?.slice(0, 10)}.
              </span>
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-accent hover:text-accent-hover underline-offset-2 hover:underline"
              >
                Review
              </button>
            </>
          ) : (
            <>
              <span className="text-signal-warn">●</span>
              <span className="text-bone-dim">Privacy terms not yet accepted.</span>
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-accent hover:text-accent-hover underline-offset-2 hover:underline"
              >
                Review and accept
              </button>
            </>
          )}
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-ink-line">
          <div className="font-mono text-xs text-bone-mute flex items-center gap-1.5">
            <Clock size={12} strokeWidth={1.5} />
            Last generated: <span className="text-bone-dim">{formatRelative(lastGeneratedAt)}</span>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileJson size={16} strokeWidth={1.5} />
            {generating ? 'Publishing...' : patIsSet ? 'Generate & Publish' : 'Generate file'}
          </button>
        </div>

        {/* Result display — shared verdict-card shell (spec §3.11) for visual
            continuity with the rest of the app's decision/status cards. Not
            elevated: Club has no hero card, this is a status readout, not a
            pending decision, so no decisionRow either. */}
        {result && (
          <VerdictCard
            tone={result.ok ? 'ok' : 'miss'}
            icon={
              result.ok
                ? <CheckCircle2 size={22} strokeWidth={1.5} />
                : <XCircle size={22} strokeWidth={1.5} />
            }
            eyebrow="publish result"
            headline={
              result.ok
                ? `Generated ${result.sessionCount} pending session${result.sessionCount === 1 ? '' : 's'}.`
                : result.error ?? 'Unknown error.'
            }
          >
            {result.ok && (
              <div className="space-y-2">
                {result.githubPublished && result.githubUrl && (
                  <div className="flex items-center gap-2 font-mono text-[11px] text-bone-dim">
                    <CheckCircle2 size={12} strokeWidth={1.5} className="text-signal-ok shrink-0" />
                    <span>
                      Published to GitHub:{' '}
                      <a
                        href={result.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent-hover underline-offset-2 hover:underline"
                      >
                        {result.githubUrl}
                      </a>
                    </span>
                  </div>
                )}
                {!result.githubPublished && patIsSet && (
                  <div className="flex items-center gap-2 font-mono text-[11px] text-signal-warn">
                    <AlertTriangle size={12} strokeWidth={1.5} className="shrink-0" />
                    GitHub publish failed — check your PAT and try again. File written locally.
                  </div>
                )}
                <div className="font-mono text-[11px] text-bone-dim space-y-1">
                  <div>
                    <span className="text-bone-mute">latest:</span> {result.latestPath}
                  </div>
                  <div>
                    <span className="text-bone-mute">archived:</span> {result.archivedPath}
                  </div>
                </div>
              </div>
            )}
          </VerdictCard>
        )}
      </SectionCard>

      <ClubShareTermsModal
        open={showTerms}
        onClose={() => setShowTerms(false)}
        alreadyAcceptedAt={termsAcceptedAt}
      />
    </>
  );
}
