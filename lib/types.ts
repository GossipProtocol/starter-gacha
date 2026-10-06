/* ─────────────────────────────────────────────────────────────────────────
   THRIFT MACHINE — core data model.
   Mirrors the build spec. `source` is on every piece so a future
   consignment/seller arm can exist without a migration (OUT OF SCOPE now).
   ───────────────────────────────────────────────────────────────────────── */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'grail';
export type Category = 'surprise' | 'music' | 'sports' | 'designer';
export type Tier = 'starter' | 'standard' | 'legendary';
export type Size = 'S' | 'M' | 'L' | 'XL' | 'XXL';
export type PieceStatus = 'available' | 'reserved' | 'shipped';
export type Decision = 'pending' | 'shipped' | 'soldback';

/* ── Machine config (the odds a machine publishes and rolls with) ────────
   One machine row in the database carries exactly these shapes. The API
   serves them from the row and rolls from the row; lib/config.ts only
   holds the default machine that seeds the first row. */

export interface RarityBand { chance: number; min: number; max: number; }
export type TierTable = Record<Tier, Record<Rarity, RarityBand>>;
export type TierMeta = Record<Tier, { label: string; price: number; blurb: string }>;
export interface BuybackConfig {
  /** Percent of the intake price paid on sell-back, per rarity. */
  pct: Record<Rarity, number>;
  /** Extra points for the designer category. */
  designerBonus: number;
  /** Hard ceiling on the percentage after bonuses. */
  cap: number;
}
export type MachineStatus = 'active' | 'paused';

export interface MachineConfig {
  id: string;
  name: string;
  tierTable: TierTable;
  tierMeta: TierMeta;
  buyback: BuybackConfig;
  /** 32-byte hex seed that derives this machine's config PDA and treasury. */
  treasurySeed: string;
  status: MachineStatus;
}

export interface Tee {
  id: string;
  name: string;        // "Nirvana Smiley Tee"
  brand: string;       // "Giant Tag"
  era: string;         // "'92"
  category: Category;
  size: Size;
  rarity: Rarity;
  grade: number;       // 1.0–10.0, condition grade assigned at intake
  estValue: number;    // appraised value set at intake
  images: string[];    // real photo URLs (front/back/detail); empty -> vector placeholder
  source: 'house';     // future: 'seller'
  status: PieceStatus;
  origin?: string;     // optional flavor: "Made in USA", "Single-stitch"
}

export interface Pull {
  id: string;
  teeId: string;
  wallet: string;
  tier: Tier;
  pricePaid: number;
  buybackPct: number;
  buybackValue: number;
  decision: Decision;
  createdAt: string;
}

/* ── Service-layer shapes (mirror the real Solana/house-RNG API surface) ── */

/** A pull intent: what generatePull() returns before settlement. One memo
 *  per piece so a 10× pull produces 10 independently-openable slots. */
export interface PullIntent {
  intentId: string;
  wallet: string;
  category: Category;
  tier: Tier;
  size: Size;
  count: number;
  unitPrice: number;
  totalCost: number;
  memos: string[];
  /** Mock of a serialized Solana tx the wallet would sign. */
  transaction: string;
}

/** Result of opening one slot — the revealed piece plus its pull record. */
export interface OpenResult {
  tee: Tee;
  pull: Pull;
}

export interface StockFilter {
  category?: Category;
  size?: Size;
  rarity?: Rarity;
}

export interface StockInfo {
  total: number;
  available: number;
  byRarity: Record<Rarity, number>;
}

export interface OddsRow {
  rarity: Rarity;
  chancePct: number;   // 0–100
  rangeLabel: string;  // "$60 – $140"
}

/** Lightweight event for the live "recent pulls" feed. */
export interface PullEvent {
  id: string;
  walletShort: string;
  teeName: string;
  rarity: Rarity;
  tier: Tier;
  estValue: number;
  at: string;
}
