/* ─────────────────────────────────────────────────────────────────────────
   RNG.

   HOUSE-EDGE BOUNDARY. In live mode this module runs ONLY on the server.
   The client must never roll its own outcome, because a client that rolls
   can grind for grails. The demo runs it in-process in the browser; the API
   runs it inside the settle route after the payment is confirmed.

   The roll takes the odds table as an argument on purpose. The server
   passes the machine row's table, so the odds the API publishes are the
   odds it rolls with. Only the demo binds the default table.
   ───────────────────────────────────────────────────────────────────────── */

import { TIER_TABLE } from './config';
import type { Rarity, Tier, TierTable } from './types';

export function randInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Weighted pick over [item, weight] pairs. Weight units are arbitrary. */
export function pickWeighted<T>(entries: Array<[T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return entries[entries.length - 1][0];
}

/** Roll a rarity from a given odds table. This is the function the server
 *  calls, with the table read from the machine row. */
export function rollRarityFrom(table: TierTable, tier: Tier): Rarity {
  const row = table[tier];
  const entries = (Object.keys(row) as Rarity[]).map(
    (r) => [r, row[r].chance] as [Rarity, number]
  );
  return pickWeighted(entries);
}

/** Demo-only roll bound to the default machine's table. Never call this
 *  from lib/server or app/api. */
export function rollRarity(tier: Tier): Rarity {
  return rollRarityFrom(TIER_TABLE, tier);
}

/** Short, opaque, sortable-ish id for memos / pull ids in the mock. */
export function mockId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
