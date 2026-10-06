/* ─────────────────────────────────────────────────────────────────────────
   DEFAULT MACHINE: the odds, prices, value bands and buyback percentages
   of the first machine. This file seeds the `machines` row (bun
   scripts/seed-machine.ts) and drives the no-env demo in the browser.

   On the server the machine row is the only source of odds: the public
   odds route serves the row and the roll reads the row, so what the API
   publishes is what it rolls with. Nothing under lib/server or app/api may
   import TIER_TABLE, TIER_META or BUYBACK_PCT directly (test/odds-source
   .test.ts enforces that); they take a MachineConfig instead.
   ───────────────────────────────────────────────────────────────────────── */

import { keccak256 } from 'js-sha3';
import type {
  BuybackConfig, Category, MachineConfig, Rarity, Size, Tier, TierMeta, TierTable,
} from './types';

export type { RarityBand } from './types';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'grail'];
export const SIZES: Size[] = ['S', 'M', 'L', 'XL', 'XXL'];
export const PULL_COUNTS = [1, 2, 5, 10] as const;
export type PullCount = (typeof PULL_COUNTS)[number];

export const CATEGORY_META: Record<Category, { label: string; blurb: string }> = {
  surprise: { label: 'Surprise Me', blurb: 'Mixed bin. Single-stitch, promo, souvenir, whatever the machine grabs.' },
  music:    { label: 'Music',       blurb: 'Band & tour tees. Grunge, metal, hip-hop, classic rock.' },
  sports:   { label: 'College / Sports', blurb: 'Teams & schools. Champion, Starter, championship runs.' },
  designer: { label: 'Designer',    blurb: 'Archive & runway. Higher value ranges, higher buyback.' },
};

export const CATEGORY_ORDER: Category[] = ['surprise', 'music', 'sports', 'designer'];

export const TIER_META: TierMeta = {
  starter:   { label: 'Starter',   price: 17.99, blurb: 'Dip in. Mostly commons, real chances up top.' },
  standard:  { label: 'Standard',  price: 39,    blurb: 'The sweet spot. Better odds, bigger value bands.' },
  legendary: { label: 'Legendary', price: 99,    blurb: 'Grails live here. Best odds, highest value bands.' },
};

export const TIER_ORDER: Tier[] = ['starter', 'standard', 'legendary'];

/* Per-tier odds (chance, 0–100) and value range ($) per rarity. Treated as
   DATA, not hardcoded UI. Starting points straight from the spec table. */
export const TIER_TABLE: TierTable = {
  starter: {
    common:   { chance: 75,  min: 13,  max: 30 },
    uncommon: { chance: 19,  min: 30,  max: 60 },
    rare:     { chance: 5,   min: 60,  max: 140 },
    epic:     { chance: 0.8, min: 140, max: 320 },
    grail:    { chance: 0.2, min: 320, max: 900 },
  },
  standard: {
    common:   { chance: 70,  min: 30,  max: 60 },
    uncommon: { chance: 21,  min: 60,  max: 120 },
    rare:     { chance: 7,   min: 120, max: 300 },
    epic:     { chance: 1.6, min: 300, max: 700 },
    grail:    { chance: 0.4, min: 700, max: 2000 },
  },
  legendary: {
    common:   { chance: 60,  min: 80,   max: 160 },
    uncommon: { chance: 26,  min: 160,  max: 340 },
    rare:     { chance: 11,  min: 340,  max: 800 },
    epic:     { chance: 2.4, min: 800,  max: 1800 },
    grail:    { chance: 0.6, min: 1800, max: 6000 },
  },
};

/* Buyback: % of the price assigned at intake. Varies by rarity; the Designer
   category buys back +4, capped at 95. One number per rarity keeps the offer
   easy to explain on the reveal screen. */
export const BUYBACK_PCT: Record<Rarity, number> = {
  common: 78,
  uncommon: 80,
  rare: 84,
  epic: 88,
  grail: 90,
};
export const DESIGNER_BUYBACK_BONUS = 4;
export const BUYBACK_CAP = 95;

export const DEFAULT_BUYBACK: BuybackConfig = {
  pct: BUYBACK_PCT,
  designerBonus: DESIGNER_BUYBACK_BONUS,
  cap: BUYBACK_CAP,
};

/** Buyback percentage for a piece under a given buyback config. The server
 *  passes the machine row's config; the demo passes DEFAULT_BUYBACK. */
export function buybackPctUnder(cfg: BuybackConfig, rarity: Rarity, category: Category): number {
  const base = cfg.pct[rarity];
  const bonus = category === 'designer' ? cfg.designerBonus : 0;
  return Math.min(base + bonus, cfg.cap);
}

export function buybackValueUnder(cfg: BuybackConfig, estValue: number, rarity: Rarity, category: Category): number {
  return Math.round(estValue * (buybackPctUnder(cfg, rarity, category) / 100));
}

/** Demo-mode helpers bound to the default machine. Client use only. */
export function buybackPctFor(rarity: Rarity, category: Category): number {
  return buybackPctUnder(DEFAULT_BUYBACK, rarity, category);
}

export function buybackValueFor(estValue: number, rarity: Rarity, category: Category): number {
  return buybackValueUnder(DEFAULT_BUYBACK, estValue, rarity, category);
}

/* The first machine. `bun scripts/seed-machine.ts` writes this to the
   machines table and prints the operator key once. The sandbox
   (GACHA_SANDBOX=1) serves it from memory. */
export const DEFAULT_MACHINE_ID = 'default';

/** The 32-byte seed a machine's config PDA and treasury derive from:
 *  keccak256 of the machine id. Stored on the row so a renamed machine
 *  keeps its treasury. */
export function treasurySeedFor(machineId: string): string {
  return keccak256(machineId);
}

export const DEFAULT_MACHINE: MachineConfig = {
  id: DEFAULT_MACHINE_ID,
  name: 'Thrift Machine',
  tierTable: TIER_TABLE,
  tierMeta: TIER_META,
  buyback: DEFAULT_BUYBACK,
  treasurySeed: treasurySeedFor(DEFAULT_MACHINE_ID),
  status: 'active',
};

/* Rarity presentation. Colors match the approved tokens in globals.css. */
export const RARITY_META: Record<Rarity, { label: string; color: string; rank: number }> = {
  common:   { label: 'Common',   color: 'var(--color-common)',   rank: 0 },
  uncommon: { label: 'Uncommon', color: 'var(--color-uncommon)', rank: 1 },
  rare:     { label: 'Rare',     color: 'var(--color-rare)',     rank: 2 },
  epic:     { label: 'Epic',     color: 'var(--color-epic)',     rank: 3 },
  grail:    { label: 'Grail',    color: 'var(--color-grail)',    rank: 4 },
};

/** Hex (not CSS var) for canvas/SVG/confetti that can't resolve var(). */
export const RARITY_HEX: Record<Rarity, string> = {
  common: '#5C5B54',
  uncommon: '#6FA84A',
  rare: '#5B8CFF',
  epic: '#C46BFF',
  grail: '#FFD23F',
};

export const STARTING_DEMO_BALANCE = 0;
export const FUND_PRESETS = [50, 100, 250, 500];
