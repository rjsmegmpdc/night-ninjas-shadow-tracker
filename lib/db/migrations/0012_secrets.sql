-- Secrets table (cloud-2) — workerd side of the dual-runtime secrets adapter.
--
-- Node keeps using the OS keychain (keytar); this table is only written to
-- when running on Cloudflare Workers. Values are AES-GCM encrypted
-- (WebCrypto, key from the SECRETS_ENC_KEY Worker secret) before they land
-- here — iv/ciphertext are base64, never plaintext. See lib/store/secrets.ts
-- and lib/store/crypto.ts.

CREATE TABLE IF NOT EXISTS secrets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL DEFAULT 1,
    key TEXT NOT NULL,
    iv TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS secrets_athlete_key_idx ON secrets(athlete_id, key);
