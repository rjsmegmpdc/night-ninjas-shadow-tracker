import 'server-only';

/* ----------------------------------------------------------------------------
 * AES-GCM encrypt/decrypt via WebCrypto — the workerd half of the
 * dual-runtime secrets adapter (lib/store/secrets.ts).
 *
 * Never used on the Node path (keytar/OS keychain handles that there).
 * WebCrypto (`globalThis.crypto.subtle`) is available natively in both
 * workerd and Node 20+, so this file needs no runtime branching itself —
 * only its caller does.
 *
 * Key material: SECRETS_ENC_KEY, a base64-encoded 256-bit (32-byte) raw AES
 * key, provided as a Worker secret (`wrangler secret put SECRETS_ENC_KEY`).
 * Generate one with e.g. `openssl rand -base64 32`. The key is imported
 * fresh per call (non-extractable, encrypt/decrypt only) rather than cached
 * — these are low-frequency operations (token read/refresh, not hot-path).
 * -------------------------------------------------------------------------- */

const IV_BYTES = 12; // AES-GCM standard nonce size

export interface EncryptedPayload {
  /** base64-encoded 12-byte nonce. */
  iv: string;
  /** base64-encoded ciphertext (WebCrypto AES-GCM output includes the auth tag). */
  ciphertext: string;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function importAesKey(rawKeyB64: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(rawKeyB64);
  if (keyBytes.length !== 32) {
    throw new Error(
      `SECRETS_ENC_KEY must decode to 32 bytes (256-bit AES key); got ${keyBytes.length}.`
    );
  }
  return crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptValue(plaintext: string, rawKeyB64: string): Promise<EncryptedPayload> {
  const key = await importAesKey(rawKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  };
}

export async function decryptValue(payload: EncryptedPayload, rawKeyB64: string): Promise<string> {
  const key = await importAesKey(rawKeyB64);
  const iv = base64ToBytes(payload.iv);
  const cipherBytes = base64ToBytes(payload.ciphertext);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipherBytes as BufferSource
  );
  return new TextDecoder().decode(plainBuf);
}
