/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY response shapes for the v1 API. One place to shape a machine
   and a pull, so every route returns the same objects and openapi.yaml has
   one thing to describe.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import type { IntentRow, PullRow, TeeRow } from './db';
import type { MachineConfig, Rarity, Tier } from '../types';

const TIERS: Tier[] = ['starter', 'standard', 'legendary'];
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'grail'];

/** The public view of a machine: odds, prices, tiers, pool depth. No keys,
 *  no pieces, no seed. This is the object the odds panel renders. */
export function machineView(machine: MachineConfig, pool: Record<Rarity, number>) {
  return {
    id: machine.id,
    name: machine.name,
    status: machine.status,
    currency: 'USDC',
    pullCounts: [1, 2, 5, 10],
    categories: ['surprise', 'music', 'sports', 'designer'],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    tiers: TIERS.map((tier) => ({
      id: tier,
      label: machine.tierMeta[tier].label,
      blurb: machine.tierMeta[tier].blurb,
      priceUsdc: machine.tierMeta[tier].price,
      odds: RARITIES.map((rarity) => ({
        rarity,
        chancePct: machine.tierTable[tier][rarity].chance,
        minUsd: machine.tierTable[tier][rarity].min,
        maxUsd: machine.tierTable[tier][rarity].max,
      })),
    })),
    buyback: {
      pctByRarity: machine.buyback.pct,
      designerBonusPct: machine.buyback.designerBonus,
      capPct: machine.buyback.cap,
    },
    pool: { availableByRarity: pool },
    rules: {
      emptyBucket: 'If the rolled rarity has no piece in your size, you are upgraded to the next rarity up, never down.',
      oddsSource: 'These odds are read from the machine record that the roll reads. There is no second copy.',
    },
  };
}

export function pieceView(tee: TeeRow) {
  return {
    id: tee.id,
    sku: tee.sku,
    name: tee.name,
    brand: tee.brand,
    era: tee.era,
    category: tee.category,
    size: tee.size,
    rarity: tee.rarity,
    quality: tee.quality,
    priceUsd: Number(tee.price),
    images: tee.images ?? [],
  };
}

export function slotView(pull: PullRow, tee: TeeRow) {
  return {
    id: pull.id,
    piece: pieceView(tee),
    buybackPct: Number(pull.buyback_pct),
    buybackValueUsdc: Number(pull.buyback_value),
    decision: pull.decision,
    buybackSignature: pull.buyback_sig,
    createdAt: pull.created_at,
  };
}

/** The pull resource: the purchase plus its slots once rolled. */
export function pullView(intent: IntentRow, slots: { pull: PullRow; tee: TeeRow }[], extra: Record<string, unknown> = {}) {
  return {
    id: intent.id,
    machineId: intent.machine_id,
    status: intent.status,
    tier: intent.tier,
    category: intent.category,
    size: intent.size,
    count: intent.count,
    unitPriceUsdc: Number(intent.unit_price),
    totalUsdc: Number(intent.total),
    signature: intent.tx_sig,
    slots: slots.map(({ pull, tee }) => slotView(pull, tee)),
    createdAt: intent.created_at,
    ...extra,
  };
}
