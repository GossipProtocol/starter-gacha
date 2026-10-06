/* ─────────────────────────────────────────────────────────────────────────
   THRIFT MACHINE — mock backing store.

   In-memory model of the house vault + balances + pull ledger, persisted to
   localStorage so the demo survives reloads. This is the piece the real
   service replaces: in production the pool + reservations live in a DB with
   row-level locks, balances settle in USDC on Solana, and RNG runs server
   side (see rng.ts). Components never import this directly — they go through
   machine.ts, the swappable service interface.
   ───────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import { SEED_TEES } from './seed';
import { TIER_TABLE } from './config';
import { mockId, pick, randInt } from './rng';
import type {
  Pull, PullEvent, Rarity, StockFilter, StockInfo, Tee, Category, Size, Tier, Decision,
} from './types';

const KEY = 'tm_state_v1';
const SCHEMA = 1;

interface IntentSlot {
  intentId: string;
  memo: string;
  wallet: string;
  category: Category;
  tier: Tier;
  size: Size;
  unitPrice: number;
  settled: boolean;
  openedPullId?: string;
}

interface Persisted {
  v: number;
  pool: Tee[];
  pulls: Pull[];
  balances: Record<string, number>;
  events: PullEvent[];
  slots: Record<string, IntentSlot>;
}

const isBrowser = typeof window !== 'undefined';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

let loaded = false;
let pool: Tee[] = [];
let pulls: Pull[] = [];
let balances: Record<string, number> = {};
let events: PullEvent[] = [];
let slots: Record<string, IntentSlot> = {};
let version = 0;

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function seedEvents(): PullEvent[] {
  const wallets = ['Gx7Q', 'Hn2P', '4kRa', 'Ze9M', 'Vb3T', 'Qp8L'];
  const picks = [...SEED_TEES].sort(() => Math.random() - 0.5).slice(0, 7);
  const tiers: Tier[] = ['starter', 'standard', 'legendary'];
  return picks.map((tee, i) => ({
    id: mockId('ev'),
    walletShort: `${pick(wallets)}…${pick(wallets).toLowerCase()}`,
    teeName: tee.name,
    rarity: tee.rarity,
    tier: pick(tiers),
    estValue: tee.estValue,
    at: new Date(Date.now() - (i * 137 + randInt(20, 90)) * 1000).toISOString(),
  }));
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  pool = SEED_TEES.map(clone);
  pulls = [];
  balances = {};
  events = [];
  slots = {};

  if (isBrowser) {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw) as Persisted;
        if (data.v === SCHEMA && Array.isArray(data.pool)) {
          pool = data.pool;
          pulls = data.pulls ?? [];
          balances = data.balances ?? {};
          events = data.events ?? [];
          slots = data.slots ?? {};
        }
      }
    } catch {
      /* corrupt state — fall back to fresh seed */
    }
  }
  if (events.length === 0) events = seedEvents();
}

function persist() {
  if (!isBrowser) return;
  const data: Persisted = { v: SCHEMA, pool, pulls, balances, events, slots };
  try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* quota */ }
}

function bump() { version += 1; persist(); emit(); }

/* ── Reads ────────────────────────────────────────────────────────────── */

export function getPool(): Tee[] { ensureLoaded(); return pool; }
export function getTee(id: string): Tee | undefined { ensureLoaded(); return pool.find((t) => t.id === id); }

export function stock(filter: StockFilter = {}): StockInfo {
  ensureLoaded();
  const inScope = pool.filter((t) =>
    (!filter.category || filter.category === 'surprise' || t.category === filter.category) &&
    (!filter.size || t.size === filter.size) &&
    (!filter.rarity || t.rarity === filter.rarity)
  );
  const avail = inScope.filter((t) => t.status === 'available');
  const byRarity = { common: 0, uncommon: 0, rare: 0, epic: 0, grail: 0 } as Record<Rarity, number>;
  for (const t of avail) byRarity[t.rarity] += 1;
  return { total: inScope.length, available: avail.length, byRarity };
}

export function getBalance(wallet: string): number { ensureLoaded(); return balances[wallet] ?? 0; }
export function getEvents(): PullEvent[] { ensureLoaded(); return events; }

export interface InventoryItem { pull: Pull; tee: Tee | undefined; }
export function getInventory(wallet: string): InventoryItem[] {
  ensureLoaded();
  return pulls
    .filter((p) => p.wallet === wallet)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((pull) => ({ pull, tee: getTee(pull.teeId) }));
}

/* ── Mutations ────────────────────────────────────────────────────────── */

export function addFunds(wallet: string, amount: number): number {
  ensureLoaded();
  balances[wallet] = (balances[wallet] ?? 0) + amount;
  bump();
  return balances[wallet];
}

export function debit(wallet: string, amount: number): boolean {
  ensureLoaded();
  if ((balances[wallet] ?? 0) < amount) return false;
  balances[wallet] -= amount;
  bump();
  return true;
}

export function saveSlots(list: IntentSlot[]) {
  ensureLoaded();
  for (const s of list) slots[s.memo] = s;
  bump();
}

export function settleMemos(memos: string[]) {
  ensureLoaded();
  for (const m of memos) if (slots[m]) slots[m].settled = true;
  bump();
}

export function getSlot(memo: string): IntentSlot | undefined { ensureLoaded(); return slots[memo]; }

/** Atomically pick an available piece for a rolled rarity and reserve it.
 *  Returns a clone. Honors size + category + the tier value band. This is
 *  the reservation lock — a reserved piece is no longer pull-able. */
export function reservePick(
  rolledRarity: Rarity, category: Category, size: Size, tier: Tier
): Tee | null {
  ensureLoaded();
  const candidates = pool.filter((t) =>
    t.status === 'available' &&
    t.size === size &&
    (category === 'surprise' || t.category === category)
  );
  if (candidates.length === 0) return null;

  const ofRarity = candidates.filter((t) => t.rarity === rolledRarity);
  const tierPool = ofRarity.length ? ofRarity : candidates;

  const band = TIER_TABLE[tier][rolledRarity];
  const inBand = tierPool.filter((t) => t.estValue >= band.min && t.estValue <= band.max);
  const finalPool = inBand.length ? inBand : tierPool;

  const chosen = finalPool[Math.floor(Math.random() * finalPool.length)];
  const live = pool.find((t) => t.id === chosen.id)!;
  live.status = 'reserved';
  bump();
  return clone(live);
}

export function recordPull(pull: Pull) {
  ensureLoaded();
  pulls.push(pull);
  bump();
}

export function pushEvent(ev: PullEvent) {
  ensureLoaded();
  events = [ev, ...events].slice(0, 30);
  bump();
}

export function setSlotOpened(memo: string, pullId: string) {
  ensureLoaded();
  if (slots[memo]) slots[memo].openedPullId = pullId;
  bump();
}

function setPullDecision(pullId: string, decision: Decision): Pull | undefined {
  ensureLoaded();
  const p = pulls.find((x) => x.id === pullId);
  if (p) p.decision = decision;
  return p;
}

function setTeeStatus(teeId: string, status: Tee['status']) {
  const t = pool.find((x) => x.id === teeId);
  if (t) t.status = status;
}

/** SHIP IT — piece leaves the pool for good. */
export function shipPull(pullId: string): Pull | undefined {
  ensureLoaded();
  const p = setPullDecision(pullId, 'shipped');
  if (p) { setTeeStatus(p.teeId, 'shipped'); bump(); }
  return p;
}

/** SELL BACK — credit balance, piece returns to the pool to be pulled again. */
export function buybackPull(pullId: string): { pull: Pull; newBalance: number } | undefined {
  ensureLoaded();
  const p = pulls.find((x) => x.id === pullId);
  if (!p || p.decision !== 'pending') return undefined;
  p.decision = 'soldback';
  setTeeStatus(p.teeId, 'available');
  balances[p.wallet] = (balances[p.wallet] ?? 0) + p.buybackValue;
  bump();
  return { pull: p, newBalance: balances[p.wallet] };
}

export function resetDemo() {
  if (isBrowser) { try { window.localStorage.removeItem(KEY); } catch { /* */ } }
  loaded = false;
  ensureLoaded();
  bump();
}

/* ── React glue ───────────────────────────────────────────────────────── */

/** Re-render on any store mutation. */
export function useStoreTick(): number {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);
  return version;
}

/** True only after client mount — gate store-derived UI to dodge hydration
 *  mismatches (server has no localStorage). */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
