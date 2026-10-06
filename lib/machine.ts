/* ─────────────────────────────────────────────────────────────────────────
   THRIFT MACHINE — service interface.

   This is THE boundary. The UI only ever talks to `machine`. In demo mode it
   is backed by the in-memory mock (store.ts + rng.ts). In live mode the
   money-moving methods call the server routes under app/api instead
   (generate -> submit -> open -> buyback), and the signatures stay the same
   so the swap is a body change, not a UI change.

   Flow:  generatePull → submitPull (settle USDC) → openPull ×count → reveal
          then per piece: shipPull  |  buyback
   ───────────────────────────────────────────────────────────────────────── */

import {
  TIER_META, TIER_TABLE, buybackPctFor, buybackValueFor,
} from './config';
import { mockId, rollRarity } from './rng';
import * as store from './store';
import type {
  Category, OddsRow, OpenResult, Pull, PullEvent, PullIntent, Rarity,
  Size, StockFilter, StockInfo, Tier,
} from './types';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MachineError extends Error {
  constructor(message: string) { super(message); this.name = 'MachineError'; }
}

export interface GenerateArgs {
  category: Category;
  tier: Tier;
  size: Size;
  count: number;
}

export const machine = {
  // Sync read — the UI uses it reactively in render. The real version would
  // hydrate stock counts from a cache/subscription rather than awaiting.
  getStock(filter: StockFilter = {}): StockInfo {
    return store.stock(filter);
  },

  getOdds(tier: Tier): OddsRow[] {
    const table = TIER_TABLE[tier];
    return (Object.keys(table) as Rarity[]).map((rarity) => {
      const band = table[rarity];
      return {
        rarity,
        chancePct: band.chance,
        rangeLabel: `$${band.min.toLocaleString()} – $${band.max.toLocaleString()}`,
      };
    });
  },

  getBalance(wallet: string): number { return store.getBalance(wallet); },

  async addFunds(wallet: string, amount: number): Promise<number> {
    await wait(200);
    return store.addFunds(wallet, amount);
  },

  /** Step 1 — quote + reserve intent slots. No money moves yet. */
  async generatePull(wallet: string, args: GenerateArgs): Promise<PullIntent> {
    await wait(180);
    const { category, tier, size, count } = args;
    if (!wallet) throw new MachineError('Connect a wallet first.');

    const avail = store.stock({ category, size }).available;
    if (avail < count) {
      throw new MachineError(
        avail === 0
          ? `No ${size} stock in this crate right now.`
          : `Only ${avail} ${size} piece${avail === 1 ? '' : 's'} left in this crate. Drop your count.`
      );
    }

    const unitPrice = TIER_META[tier].price;
    const totalCost = Math.round(unitPrice * count * 100) / 100;
    const intentId = mockId('intent');
    const memos = Array.from({ length: count }, () => mockId('memo'));

    store.saveSlots(memos.map((memo) => ({
      intentId, memo, wallet, category, tier, size, unitPrice, settled: false,
    })));

    return {
      intentId, wallet, category, tier, size, count, unitPrice, totalCost, memos,
      transaction: `mock_tx_${intentId}`,
    };
  },

  /** Step 2 — "sign + submit": settle USDC and mark the intent paid. */
  async submitPull(intent: PullIntent): Promise<{ success: boolean; signature: string }> {
    await wait(420);
    const ok = store.debit(intent.wallet, intent.totalCost);
    if (!ok) throw new MachineError('Not enough USDC. Add funds to pull.');
    store.settleMemos(intent.memos);
    return { success: true, signature: `mock_sig_${intent.intentId}` };
  },

  /** Step 3 — open one slot: roll (server-side in prod), reserve the piece,
   *  write the pull record. Idempotent per memo. */
  async openPull(memo: string): Promise<OpenResult> {
    await wait(620);
    const slot = store.getSlot(memo);
    if (!slot) throw new MachineError('Unknown pull.');
    if (!slot.settled) throw new MachineError('Pull not settled yet.');

    if (slot.openedPullId) {
      const existing = store.getInventory(slot.wallet).find((i) => i.pull.id === slot.openedPullId);
      if (existing?.tee) return { tee: existing.tee, pull: existing.pull };
    }

    const rarity = rollRarity(slot.tier);
    const tee = store.reservePick(rarity, slot.category, slot.size, slot.tier);
    if (!tee) throw new MachineError('That piece just got pulled. Out of stock for this size.');

    const pull: Pull = {
      id: mockId('pull'),
      teeId: tee.id,
      wallet: slot.wallet,
      tier: slot.tier,
      pricePaid: slot.unitPrice,
      buybackPct: buybackPctFor(tee.rarity, tee.category),
      buybackValue: buybackValueFor(tee.estValue, tee.rarity, tee.category),
      decision: 'pending',
      createdAt: new Date().toISOString(),
    };
    store.recordPull(pull);
    store.setSlotOpened(memo, pull.id);

    const ev: PullEvent = {
      id: mockId('ev'),
      walletShort: shortKey(slot.wallet),
      teeName: tee.name,
      rarity: tee.rarity,
      tier: slot.tier,
      estValue: tee.estValue,
      at: pull.createdAt,
    };
    store.pushEvent(ev);

    return { tee, pull };
  },

  /** SHIP IT — keep it. Piece leaves the pool. */
  async shipPull(pullId: string): Promise<Pull> {
    await wait(260);
    const p = store.shipPull(pullId);
    if (!p) throw new MachineError('Pull not found.');
    return p;
  },

  /** SELL BACK — instant buyback to store credit. Piece returns to the pool. */
  async buyback(pullId: string): Promise<{ pull: Pull; newBalance: number }> {
    await wait(320);
    const res = store.buybackPull(pullId);
    if (!res) throw new MachineError('Already decided on this piece.');
    return res;
  },

  getRecentPulls(): PullEvent[] { return store.getEvents(); },

  getInventory(wallet: string): store.InventoryItem[] { return store.getInventory(wallet); },

  /** Full house pool for the marketplace browser. */
  getPool() { return store.getPool(); },
};

function shortKey(addr: string): string {
  if (!addr || addr.length < 8) return addr || '…';
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
