import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { encryptValue, decryptValue } from './crypto';

/* ----------------------------------------------------------------------------
 * Secrets layer — Strava client_secret, access_token, refresh_token, Garmin
 * session tokens, GitHub PAT.
 *
 * Dual-runtime (cloud-2): every exported function below keeps its original
 * signature — only the internal setSecret/getSecret/deleteSecret dispatch
 * on runtime.
 *
 * Node (local dev): OS keychain via `keytar`.
 *   Windows : Windows Credential Manager
 *   macOS   : Keychain
 *   Linux   : libsecret (gnome-keyring / kwallet)
 * keytar is dynamically imported so its native .node addon never enters the
 * workerd bundle (same pattern as better-sqlite3 in lib/db/index.ts).
 *
 * Workerd (Cloudflare): AES-GCM encrypted (WebCrypto, see lib/store/crypto.ts)
 * values in the `secrets` D1 table, scoped to the default athlete
 * (schema.DEFAULT_ATHLETE_ID — real per-athlete resolution lands with auth).
 * Encryption key comes from the SECRETS_ENC_KEY Worker secret.
 *
 * Secrets are NEVER persisted to:
 *   - the SQLite database (Node path)
 *   - plaintext, anywhere (Workerd path)
 *   - logs
 *   - the .env file
 *   - any sync/backup-friendly path
 * -------------------------------------------------------------------------- */

const SERVICE = 'NightNinjas-ShadowTracker';

const KEY = {
  STRAVA_CLIENT_SECRET: 'strava-client-secret',
  STRAVA_ACCESS_TOKEN: 'strava-access-token',
  STRAVA_REFRESH_TOKEN: 'strava-refresh-token',
  STRAVA_EXPIRES_AT: 'strava-expires-at',
  GARMIN_SESSION_TOKENS: 'garmin-session-tokens',
  GITHUB_PAT: 'github-pat',
} as const;

/**
 * True when executing inside a Cloudflare Workers (workerd) runtime — same
 * signal as lib/db/index.ts's isWorkerd(), duplicated here (not imported)
 * to keep lib/store and lib/db decoupled.
 */
function isWorkerd(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}

/**
 * Indirect dynamic import for keytar, built from a source string via
 * `new Function` rather than written as a literal `import('keytar')`.
 *
 * A literal specifier isn't safe here even behind `await import(...)`:
 * OpenNext's Cloudflare build re-bundles the Next server output with
 * esbuild, and esbuild statically resolves `import()` calls whose
 * argument is a string literal — including ones built from a `const`
 * (esbuild's constant folding can trace `const NAME = 'keytar'; import(NAME)`
 * right back to the literal). Resolving 'keytar' pulls in its own
 * `require('../build/Release/keytar.node')`, a native addon esbuild has
 * no loader for and workerd can't execute regardless — a hard build
 * failure, not just dead code.
 *
 * Wrapping the specifier inside a function compiled from a string is
 * opaque to every bundler's static analyzer (esbuild, webpack, turbopack):
 * the string 'keytar' only exists as a runtime argument, never as an
 * AST-visible import target. This function is only ever called on the
 * Node path (isWorkerd() gates every caller), so the runtime dynamic
 * import always resolves against the real, installed keytar package.
 */
type KeytarModule = typeof import('keytar');
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<{ default: KeytarModule }>;

// Lazy-load keytar — it's a native module and we want to gracefully
// handle environments where it isn't available. Never called on workerd.
async function loadKeytar(): Promise<KeytarModule | null> {
  try {
    return (await dynamicImport('keytar')).default;
  } catch (err) {
    console.warn(
      '[shadow-tracker] keytar unavailable; secrets layer will refuse writes. ' +
        'On Linux, install libsecret-1-dev and rebuild.'
    );
    return null;
  }
}

async function getEncKey(): Promise<string> {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const { env } = getCloudflareContext();
  const key = env.SECRETS_ENC_KEY;
  if (!key) {
    throw new Error(
      'SECRETS_ENC_KEY Worker secret is not set — run `wrangler secret put SECRETS_ENC_KEY`.'
    );
  }
  return key;
}

async function setSecretD1(key: string, value: string): Promise<void> {
  const encKey = await getEncKey();
  const { iv, ciphertext } = await encryptValue(value, encKey);
  const db = await getDb();
  await db
    .insert(schema.secrets)
    .values({ athleteId: schema.DEFAULT_ATHLETE_ID, key, iv, ciphertext })
    .onConflictDoUpdate({
      target: [schema.secrets.athleteId, schema.secrets.key],
      set: { iv, ciphertext, updatedAt: new Date() },
    });
}

async function getSecretD1(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.secrets)
    .where(and(eq(schema.secrets.athleteId, schema.DEFAULT_ATHLETE_ID), eq(schema.secrets.key, key)))
    .get();
  if (!row) return null;
  const encKey = await getEncKey();
  return decryptValue({ iv: row.iv, ciphertext: row.ciphertext }, encKey);
}

async function deleteSecretD1(key: string): Promise<void> {
  const db = await getDb();
  await db
    .delete(schema.secrets)
    .where(and(eq(schema.secrets.athleteId, schema.DEFAULT_ATHLETE_ID), eq(schema.secrets.key, key)));
}

async function setSecret(key: string, value: string): Promise<void> {
  if (isWorkerd()) {
    await setSecretD1(key, value);
    return;
  }
  const keytar = await loadKeytar();
  if (!keytar) {
    throw new Error(
      'Keychain unavailable. Install libsecret on Linux or rebuild keytar for your platform.'
    );
  }
  await keytar.setPassword(SERVICE, key, value);
}

async function getSecret(key: string): Promise<string | null> {
  if (isWorkerd()) return getSecretD1(key);
  const keytar = await loadKeytar();
  if (!keytar) return null;
  return keytar.getPassword(SERVICE, key);
}

async function deleteSecret(key: string): Promise<void> {
  if (isWorkerd()) {
    await deleteSecretD1(key);
    return;
  }
  const keytar = await loadKeytar();
  if (!keytar) return;
  await keytar.deletePassword(SERVICE, key);
}

/* ----------------------------------------------------------------------------
 * Public API — Strava-specific helpers.
 * -------------------------------------------------------------------------- */

export async function setStravaClientSecret(secret: string): Promise<void> {
  await setSecret(KEY.STRAVA_CLIENT_SECRET, secret);
}

export async function getStravaClientSecret(): Promise<string | null> {
  return getSecret(KEY.STRAVA_CLIENT_SECRET);
}

export async function setStravaTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
}): Promise<void> {
  await setSecret(KEY.STRAVA_ACCESS_TOKEN, tokens.accessToken);
  await setSecret(KEY.STRAVA_REFRESH_TOKEN, tokens.refreshToken);
  await setSecret(KEY.STRAVA_EXPIRES_AT, String(tokens.expiresAt));
}

export async function getStravaTokens(): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null> {
  const [accessToken, refreshToken, expiresAtStr] = await Promise.all([
    getSecret(KEY.STRAVA_ACCESS_TOKEN),
    getSecret(KEY.STRAVA_REFRESH_TOKEN),
    getSecret(KEY.STRAVA_EXPIRES_AT),
  ]);
  if (!accessToken || !refreshToken || !expiresAtStr) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: parseInt(expiresAtStr, 10),
  };
}

export async function clearStravaSecrets(): Promise<void> {
  await Promise.all([
    deleteSecret(KEY.STRAVA_CLIENT_SECRET),
    deleteSecret(KEY.STRAVA_ACCESS_TOKEN),
    deleteSecret(KEY.STRAVA_REFRESH_TOKEN),
    deleteSecret(KEY.STRAVA_EXPIRES_AT),
  ]);
}


/* ----------------------------------------------------------------------------
 * Public API - Garmin-specific helpers (Phase 12).
 *
 * We never store the athlete's Garmin password. The password is used once
 * at login; what we persist is the exported OAuth1+OAuth2 session token
 * pair from the garmin-connect library (valid ~1 year, auto-refreshed by
 * the library on use). Stored as a single JSON blob in the OS keychain.
 * -------------------------------------------------------------------------- */

export async function setGarminSessionTokens(tokensJson: string): Promise<void> {
  await setSecret(KEY.GARMIN_SESSION_TOKENS, tokensJson);
}

export async function getGarminSessionTokens(): Promise<string | null> {
  return getSecret(KEY.GARMIN_SESSION_TOKENS);
}

export async function clearGarminSecrets(): Promise<void> {
  await deleteSecret(KEY.GARMIN_SESSION_TOKENS);
}


/* ----------------------------------------------------------------------------
 * Public API - GitHub PAT.
 *
 * Used to publish training schedules to the nightninja-report repo via the
 * GitHub Contents API. Needs `contents: write` scope on the target repo.
 * Never logged; stored only in the OS keychain.
 * -------------------------------------------------------------------------- */

export async function getGitHubPat(): Promise<string | null> {
  return getSecret(KEY.GITHUB_PAT);
}

export async function setGitHubPat(pat: string): Promise<void> {
  await setSecret(KEY.GITHUB_PAT, pat);
}

export async function clearGitHubPat(): Promise<void> {
  await deleteSecret(KEY.GITHUB_PAT);
}
