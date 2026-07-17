import 'server-only';
import type { Retailer } from './retailer-types';
import { RETAILERS } from './shoe-retailers-data';

// Re-export so server-side callers can import { Retailer, buildSearchUrl }
// from a single module without thinking about the split.
export type { Retailer } from './retailer-types';
export { buildSearchUrl } from './retailer-types';

/**
 * Retailer directory — server-only. Backed by a build-time literal (see
 * `shoe-retailers-data.ts`, generated from `data/shoe-retailers.csv`).
 * Pure types + URL helpers live in `./retailer-types` so they can be
 * imported from client components without bundling this module.
 *
 * cloud-3: this used to `fs.readFileSync` the CSV at first call — moved to
 * a build-time import so the module has no runtime filesystem dependency
 * and works identically on the node and workerd (Cloudflare) paths.
 */

export function listRetailers(): Retailer[] {
  return RETAILERS;
}
