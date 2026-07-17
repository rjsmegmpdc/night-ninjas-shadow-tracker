import 'server-only';

/**
 * True when executing inside a Cloudflare Workers (workerd) runtime.
 *
 * `navigator.userAgent === 'Cloudflare-Workers'` is workerd's documented
 * self-identification and is the mechanism @opennextjs/cloudflare itself
 * relies on. Same idiom as `lib/db/index.ts`'s private `isWorkerd()` —
 * duplicated here (rather than importing from lib/db/index.ts, which is
 * off-limits for this change set) so cloud-3/cloud-4 storage and sync
 * surfaces can share one small runtime-detection helper.
 */
export function isWorkerd(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}
