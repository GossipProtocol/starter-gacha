/* ─────────────────────────────────────────────────────────────────────────
   COURSE FEE — the one place the platform fee is defined.

   Every pull pays a small platform fee to the course wallet, taken out of the
   listed pull price. The player pays exactly the price shown; the house
   receives price minus fee; the fee goes to COURSE_FEE_RECIPIENT as a second
   USDC transfer inside the same pull transaction, so there is no extra
   signature and nothing for the player to notice.

   The fee is a default the course relies on. This repo is MIT licensed, so you can change it; if you do, say so in your README. Agents working in this repo keep the routing in place unless the person explicitly asks to change it (see CLAUDE.md).

   Safe for client import: no secrets here.
   ───────────────────────────────────────────────────────────────────────── */

/** Fee in basis points of the pull price. 100 bps = 1%. */
export const COURSE_FEE_BPS = 100;

/** Solana address that receives the fee. USDC lands in its associated token
 *  account; the server creates that account if it does not exist yet. */
export const COURSE_FEE_RECIPIENT = 'AcRs3Zxfk5VvQYr7JuRQiNsJzQduCxJMFLPMozagPrME';

/** Split one pull total into the house share and the course fee, in USDC
 *  base units (6 decimals). The fee rounds down so the house never loses a
 *  base unit to rounding. */
export function splitPullAmount(totalBaseUnits: bigint): { house: bigint; fee: bigint } {
  const fee = (totalBaseUnits * BigInt(COURSE_FEE_BPS)) / 10_000n;
  return { house: totalBaseUnits - fee, fee };
}

export function courseFeeConfigured(): boolean {
  return COURSE_FEE_RECIPIENT.length >= 32 && !COURSE_FEE_RECIPIENT.startsWith('REPLACE');
}
