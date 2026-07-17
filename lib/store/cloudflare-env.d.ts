/**
 * Augments @opennextjs/cloudflare's ambient `CloudflareEnv` interface with
 * the Worker secret the dual-runtime secrets adapter (lib/store/secrets.ts)
 * needs on the workerd path. Kept separate from lib/db/cloudflare-env.d.ts
 * (the `DB` binding) since that file is outside this wave's scope —
 * declaration merging combines both into one CloudflareEnv regardless.
 *
 * SECRETS_ENC_KEY: base64-encoded 256-bit (32-byte) raw AES key, e.g.
 *   openssl rand -base64 32
 * Set via `wrangler secret put SECRETS_ENC_KEY` — never committed, never
 * read from anywhere but lib/store/crypto.ts's key import.
 */
declare global {
  interface CloudflareEnv {
    SECRETS_ENC_KEY: string;
  }
}

export {};
