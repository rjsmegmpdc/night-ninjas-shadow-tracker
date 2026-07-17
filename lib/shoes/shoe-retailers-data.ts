import type { Retailer } from './retailer-types';

/**
 * Retailer directory — generated from `data/shoe-retailers.csv` (cloud-3:
 * converted from a runtime `fs.readFileSync` seed load to a build-time
 * literal so this module has zero filesystem dependency and is safe to
 * import on both the node and workerd runtime paths).
 *
 * Edit `data/shoe-retailers.csv` (kept as the human-editable source of
 * truth) and regenerate this file if the retailer list changes.
 */
export const RETAILERS: Retailer[] = [
  { name: 'Saucony NZ', urlTemplate: 'https://www.saucony.co.nz/search?q={query}', region: 'NZ' },
  { name: 'Hoka NZ', urlTemplate: 'https://www.hoka.com/en/nz/search?q={query}', region: 'NZ' },
  { name: 'Running Warehouse NZ', urlTemplate: 'https://www.runningwarehouse.co.nz/search?keywords={query}', region: 'NZ' },
  { name: 'The Athlete\'s Foot', urlTemplate: 'https://www.athletesfoot.co.nz/search?q={query}', region: 'NZ' },
  { name: 'Sportsmans Warehouse', urlTemplate: 'https://www.sportsmanswarehouse.co.nz/search?q={query}', region: 'NZ' },
  { name: 'Trade Me', urlTemplate: 'https://www.trademe.co.nz/a/marketplace/search?search_string={query}', region: 'NZ' },
  { name: 'TheMarket NZ', urlTemplate: 'https://www.themarket.com/nz/search?q={query}', region: 'NZ' },
  { name: 'Wiggle', urlTemplate: 'https://www.wiggle.co.nz/sw/run/run-shoes/?dwvar_searchTerm={query}', region: 'International' },
  { name: 'Running Warehouse Australia', urlTemplate: 'https://www.runningwarehouse.com.au/search?keywords={query}', region: 'AU' },
  { name: 'SportsShoes UK', urlTemplate: 'https://www.sportsshoes.com/search?keyword={query}', region: 'International' },
];
