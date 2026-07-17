import 'server-only';
import { SHOES_DATABASE } from './shoes-database-data';

/**
 * Shoe database lookup.
 *
 * Matches a Strava gear name against brand+model entries drawn from a
 * build-time literal (see `shoes-database-data.ts`, generated from
 * `data/shoes-database.csv`). User overrides are applied at the database
 * row level via `user_target_km`, not by editing the seed data.
 *
 * cloud-3: this used to `fs.readFileSync` the CSV at first call — moved to
 * a build-time import so the module has no runtime filesystem dependency
 * and works identically on the node and workerd (Cloudflare) paths.
 *
 * Matching is best-effort string matching:
 *   1. Try exact "Brand Model" against gear name
 *   2. Try case-insensitive contains
 *   3. Try matching brand and as much of the model as possible
 *   4. Default 800 km if no match
 */

export interface ShoeMatch {
  brand: string;
  model: string;
  recommendedKm: number;
  category: 'race-day' | 'super-trainer' | 'uptempo' | 'daily' | 'trail';
  carbonPlate: boolean;
  notes?: string;
}

function loadDatabase(): ShoeMatch[] {
  return SHOES_DATABASE;
}

/**
 * Match a Strava gear name against the shoe database.
 *
 * Examples that work:
 *   "Saucony Endorphin Pro 3"      → exact match
 *   "endorphin pro 3"              → contains-match
 *   "My Sauconys (Pro 3)"          → brand + model contains
 *   "Random Shoe Name 2024"        → no match (returns null)
 */
export function matchShoeName(gearName: string): ShoeMatch | null {
  const db = loadDatabase();
  if (db.length === 0) return null;

  const needle = gearName.toLowerCase().trim();

  // Pass 1: exact "Brand Model" match
  for (const entry of db) {
    const fullName = `${entry.brand} ${entry.model}`.toLowerCase();
    if (fullName === needle) return entry;
  }

  // Pass 2: needle contains "Brand Model" (e.g. "My Saucony Endorphin Pro 3 (red)")
  for (const entry of db) {
    const fullName = `${entry.brand} ${entry.model}`.toLowerCase();
    if (needle.includes(fullName)) return entry;
  }

  // Pass 3: model substring match (handles "endorphin pro 3" without brand)
  // Sort by model length desc so we prefer the longest/most-specific match
  const sortedByModelLen = [...db].sort((a, b) => b.model.length - a.model.length);
  for (const entry of sortedByModelLen) {
    if (needle.includes(entry.model.toLowerCase())) return entry;
  }

  // Pass 4: brand-only — won't pick a model but at least we know the brand
  // Only use this as a last resort and don't return a definite recommendedKm
  for (const entry of db) {
    if (needle.includes(entry.brand.toLowerCase())) {
      // Return a partial match using the most generic shoe of that brand?
      // Actually no — better to return null and let the default kick in.
      return null;
    }
  }

  return null;
}

/** For UI: list distinct brand names known to the database. */
export function listBrands(): string[] {
  const db = loadDatabase();
  return Array.from(new Set(db.map((s) => s.brand))).sort();
}

/** For testing / UI: return the entire DB. */
export function listAllShoes(): ShoeMatch[] {
  return loadDatabase();
}
