/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY storage seam.

   Every table access goes through the `Db` interface below. There are two
   implementations and one set of business rules (lib/server/ledger.ts):

     - supabaseDb: the live ledger. Service role key, RLS on with no
       policies, schema in docs/schema.sql.
     - memoryDb:   the sandbox (GACHA_SANDBOX=1). The default machine from
       lib/config.ts and the seed pool from lib/seed.ts, held in memory for
       the life of the process. No keys, no chain, same routes.

   The rules the ledger enforces do not care which one is underneath: the
   price comes from the machine row, the roll reads the machine row, the
   reservation is one atomic call, the buyback value is frozen on the pull
   row. Keep this file to storage only.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import { randomUUID } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Category, Decision, MachineConfig, Rarity, Size, Tier } from '../types';

/* ── row shapes ───────────────────────────────────────────────────────── */

export interface MachineRow {
  id: string;
  name: string;
  operator_key_hash: string;
  tier_table: MachineConfig['tierTable'];
  tier_meta: MachineConfig['tierMeta'];
  buyback: MachineConfig['buyback'];
  treasury_seed: string;
  status: MachineConfig['status'];
}

export interface IntentRow {
  id: string;
  machine_id: string;
  wallet: string;
  tier: Tier;
  category: Category;
  size: Size;
  count: number;
  unit_price: number;
  total: number;
  status: 'quoted' | 'paid' | 'opened' | 'expired';
  tx_sig: string | null;
  created_at: string;
}

export interface PullRow {
  id: string;
  machine_id: string;
  intent_id: string;
  tee_id: string;
  wallet: string;
  tier: Tier;
  price_paid: number;
  buyback_pct: number;
  buyback_value: number;
  decision: Decision;
  tracking: string | null;
  buyback_sig: string | null;
  created_at: string;
}

export interface TeeRow {
  id: string;
  machine_id: string;
  sku: string;
  name: string;
  brand: string;
  era: string;
  category: Category;
  size: Size;
  rarity: Rarity;
  quality: number | null;
  price: number;
  images: string[];
  status: 'available' | 'reserved' | 'shipped';
  created_at: string;
}

export type TeeInsert = Omit<TeeRow, 'id' | 'created_at'>;

export interface WebhookRow {
  id: string;
  machine_id: string;
  url: string;
  secret: string;
  status: 'active' | 'disabled';
  created_at: string;
}

export interface DeliveryRow {
  id: string;
  machine_id: string;
  webhook_id: string;
  event: string;
  payload: unknown;
  attempts: number;
  status: 'pending' | 'delivered' | 'failed';
  last_status: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface ReserveArgs {
  machineId: string;
  category: Category | null;
  size: Size;
  rarity: Rarity;
  min: number;
  max: number;
}

export interface Db {
  readonly kind: 'supabase' | 'memory';

  getMachine(id: string): Promise<MachineRow | null>;
  getMachineByKeyHash(hash: string): Promise<MachineRow | null>;

  insertIntent(row: IntentRow): Promise<void>;
  getIntent(id: string): Promise<IntentRow | null>;
  /** quoted -> paid, exactly once. Returns false when the row was not quoted. */
  markIntentPaid(id: string, txSig: string): Promise<boolean>;
  setIntentStatus(id: string, status: IntentRow['status']): Promise<void>;

  /** One atomic reservation: picks, locks and flips one piece, or null. */
  reserveTee(args: ReserveArgs): Promise<TeeRow | null>;
  getTee(id: string): Promise<TeeRow | null>;
  setTeeStatus(id: string, status: TeeRow['status']): Promise<void>;
  listTees(machineId: string): Promise<TeeRow[]>;
  insertTees(rows: TeeInsert[]): Promise<TeeRow[]>;
  /** Highest numeric SKU suffix in use for this machine's prefix, or 0. */
  lastSkuNumber(machineId: string, prefix: string): Promise<number>;
  poolDepth(machineId: string): Promise<Record<Rarity, number>>;

  insertPull(row: PullRow): Promise<void>;
  getPull(id: string): Promise<PullRow | null>;
  listPullsByIntent(intentId: string): Promise<PullRow[]>;
  /** pending -> decision, only for the owner, exactly once. Returns the row or null. */
  decidePull(id: string, wallet: string, decision: Decision, patch: Partial<PullRow>): Promise<PullRow | null>;

  listWebhooks(machineId: string): Promise<WebhookRow[]>;
  insertWebhook(row: Omit<WebhookRow, 'id' | 'created_at'>): Promise<WebhookRow>;
  insertDelivery(row: Omit<DeliveryRow, 'id' | 'created_at'>): Promise<DeliveryRow>;
  updateDelivery(id: string, patch: Partial<DeliveryRow>): Promise<void>;
  listDeliveries(machineId: string, limit: number): Promise<DeliveryRow[]>;
}

export function isSandbox(): boolean {
  return process.env.GACHA_SANDBOX === '1';
}

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'grail'];

/* ── Supabase ─────────────────────────────────────────────────────────── */

let client: SupabaseClient | null = null;

export function supabaseClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('PASTE')) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, ' +
      'or run the sandbox with GACHA_SANDBOX=1.'
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const supabaseDb: Db = {
  kind: 'supabase',

  async getMachine(id) {
    const { data, error } = await supabaseClient().from('machines').select('*').eq('id', id).maybeSingle();
    fail(error);
    return (data as MachineRow | null) ?? null;
  },
  async getMachineByKeyHash(hash) {
    const { data, error } = await supabaseClient()
      .from('machines').select('*').eq('operator_key_hash', hash).maybeSingle();
    fail(error);
    return (data as MachineRow | null) ?? null;
  },

  async insertIntent(row) {
    const { error } = await supabaseClient().from('intents').insert(row);
    fail(error);
  },
  async getIntent(id) {
    const { data, error } = await supabaseClient().from('intents').select('*').eq('id', id).maybeSingle();
    fail(error);
    return (data as IntentRow | null) ?? null;
  },
  async markIntentPaid(id, txSig) {
    const { data, error } = await supabaseClient()
      .from('intents').update({ status: 'paid', tx_sig: txSig })
      .eq('id', id).eq('status', 'quoted').select('id');
    fail(error);
    return (data?.length ?? 0) === 1;
  },
  async setIntentStatus(id, status) {
    const { error } = await supabaseClient().from('intents').update({ status }).eq('id', id);
    fail(error);
  },

  async reserveTee(a) {
    const { data, error } = await supabaseClient().rpc('reserve_tee', {
      p_machine: a.machineId, p_category: a.category, p_size: a.size,
      p_rarity: a.rarity, p_min: a.min, p_max: a.max,
    });
    fail(error);
    const rows = (data ?? []) as TeeRow[];
    return rows[0] ?? null;
  },
  async getTee(id) {
    const { data, error } = await supabaseClient().from('tees').select('*').eq('id', id).maybeSingle();
    fail(error);
    return (data as TeeRow | null) ?? null;
  },
  async setTeeStatus(id, status) {
    const { error } = await supabaseClient().from('tees').update({ status }).eq('id', id);
    fail(error);
  },
  async listTees(machineId) {
    const { data, error } = await supabaseClient()
      .from('tees').select('*').eq('machine_id', machineId).order('sku', { ascending: true });
    fail(error);
    return (data ?? []) as TeeRow[];
  },
  async insertTees(rows) {
    const { data, error } = await supabaseClient().from('tees').insert(rows).select('*');
    fail(error);
    return (data ?? []) as TeeRow[];
  },
  async lastSkuNumber(machineId, prefix) {
    const { data, error } = await supabaseClient()
      .from('tees').select('sku').eq('machine_id', machineId)
      .like('sku', `${prefix}%`).order('sku', { ascending: false }).limit(1);
    fail(error);
    const sku = data?.[0]?.sku as string | undefined;
    return sku ? parseInt(sku.slice(prefix.length), 10) || 0 : 0;
  },
  async poolDepth(machineId) {
    const { data, error } = await supabaseClient().rpc('pool_depth', { p_machine: machineId });
    fail(error);
    const out = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const row of (data ?? []) as { rarity: Rarity; available: number }[]) {
      if (row.rarity in out) out[row.rarity] = Number(row.available);
    }
    return out;
  },

  async insertPull(row) {
    const { error } = await supabaseClient().from('pulls').insert(row);
    fail(error);
  },
  async getPull(id) {
    const { data, error } = await supabaseClient().from('pulls').select('*').eq('id', id).maybeSingle();
    fail(error);
    return (data as PullRow | null) ?? null;
  },
  async listPullsByIntent(intentId) {
    const { data, error } = await supabaseClient()
      .from('pulls').select('*').eq('intent_id', intentId).order('created_at', { ascending: true });
    fail(error);
    return (data ?? []) as PullRow[];
  },
  async decidePull(id, wallet, decision, patch) {
    const { data, error } = await supabaseClient()
      .from('pulls').update({ ...patch, decision })
      .eq('id', id).eq('wallet', wallet).eq('decision', 'pending').select('*');
    fail(error);
    return ((data ?? [])[0] as PullRow | undefined) ?? null;
  },

  async listWebhooks(machineId) {
    const { data, error } = await supabaseClient()
      .from('webhooks').select('*').eq('machine_id', machineId).eq('status', 'active');
    fail(error);
    return (data ?? []) as WebhookRow[];
  },
  async insertWebhook(row) {
    const { data, error } = await supabaseClient().from('webhooks').insert(row).select('*').single();
    fail(error);
    return data as WebhookRow;
  },
  async insertDelivery(row) {
    const { data, error } = await supabaseClient().from('webhook_deliveries').insert(row).select('*').single();
    fail(error);
    return data as DeliveryRow;
  },
  async updateDelivery(id, patch) {
    const { error } = await supabaseClient().from('webhook_deliveries').update(patch).eq('id', id);
    fail(error);
  },
  async listDeliveries(machineId, limit) {
    const { data, error } = await supabaseClient()
      .from('webhook_deliveries').select('*').eq('machine_id', machineId)
      .order('created_at', { ascending: false }).limit(limit);
    fail(error);
    return (data ?? []) as DeliveryRow[];
  },
};

/* ── Memory (sandbox) ─────────────────────────────────────────────────── */

interface MemoryState {
  machines: MachineRow[];
  intents: Map<string, IntentRow>;
  tees: Map<string, TeeRow>;
  pulls: Map<string, PullRow>;
  webhooks: Map<string, WebhookRow>;
  deliveries: Map<string, DeliveryRow>;
}

let memory: MemoryState | null = null;

/** Seeded lazily from lib/config.ts and lib/seed.ts, so importing this
 *  file never pulls the seed pool into a live deployment's memory. */
async function memoryState(): Promise<MemoryState> {
  if (memory) return memory;
  const { DEFAULT_MACHINE } = await import('../config');
  const { SEED_TEES } = await import('../seed');
  const { sha256Hex } = await import('./operator');
  const { sandboxOperatorKey } = await import('./operator');

  const machine: MachineRow = {
    id: DEFAULT_MACHINE.id,
    name: DEFAULT_MACHINE.name,
    operator_key_hash: sha256Hex(sandboxOperatorKey()),
    tier_table: DEFAULT_MACHINE.tierTable,
    tier_meta: DEFAULT_MACHINE.tierMeta,
    buyback: DEFAULT_MACHINE.buyback,
    treasury_seed: DEFAULT_MACHINE.treasurySeed,
    status: DEFAULT_MACHINE.status,
  };
  const tees = new Map<string, TeeRow>();
  SEED_TEES.forEach((t, i) => {
    const id = randomUUID();
    tees.set(id, {
      id,
      machine_id: machine.id,
      sku: `TM-${String(i + 1).padStart(4, '0')}`,
      name: t.name, brand: t.brand, era: t.era,
      category: t.category, size: t.size, rarity: t.rarity,
      quality: t.grade, price: t.estValue, images: t.images,
      status: 'available', created_at: new Date().toISOString(),
    });
  });
  memory = {
    machines: [machine],
    intents: new Map(), tees, pulls: new Map(), webhooks: new Map(), deliveries: new Map(),
  };
  return memory;
}

const memoryDb: Db = {
  kind: 'memory',

  async getMachine(id) {
    const s = await memoryState();
    return s.machines.find((m) => m.id === id) ?? null;
  },
  async getMachineByKeyHash(hash) {
    const s = await memoryState();
    return s.machines.find((m) => m.operator_key_hash === hash) ?? null;
  },

  async insertIntent(row) { (await memoryState()).intents.set(row.id, { ...row }); },
  async getIntent(id) { return (await memoryState()).intents.get(id) ?? null; },
  async markIntentPaid(id, txSig) {
    const row = (await memoryState()).intents.get(id);
    if (!row || row.status !== 'quoted') return false;
    row.status = 'paid'; row.tx_sig = txSig;
    return true;
  },
  async setIntentStatus(id, status) {
    const row = (await memoryState()).intents.get(id);
    if (row) row.status = status;
  },

  async reserveTee(a) {
    const s = await memoryState();
    const base = [...s.tees.values()].filter((t) =>
      t.machine_id === a.machineId && t.status === 'available' && t.size === a.size &&
      t.rarity === a.rarity && (a.category === null || t.category === a.category)
    );
    const inBand = base.filter((t) => t.price >= a.min && t.price <= a.max);
    const pool = inBand.length ? inBand : base;
    if (pool.length === 0) return null;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    picked.status = 'reserved';
    return { ...picked };
  },
  async getTee(id) { const t = (await memoryState()).tees.get(id); return t ? { ...t } : null; },
  async setTeeStatus(id, status) {
    const t = (await memoryState()).tees.get(id);
    if (t) t.status = status;
  },
  async listTees(machineId) {
    return [...(await memoryState()).tees.values()]
      .filter((t) => t.machine_id === machineId)
      .sort((x, y) => x.sku.localeCompare(y.sku))
      .map((t) => ({ ...t }));
  },
  async insertTees(rows) {
    const s = await memoryState();
    return rows.map((r) => {
      const row: TeeRow = { ...r, id: randomUUID(), created_at: new Date().toISOString() };
      s.tees.set(row.id, row);
      return { ...row };
    });
  },
  async lastSkuNumber(machineId, prefix) {
    let max = 0;
    for (const t of (await memoryState()).tees.values()) {
      if (t.machine_id !== machineId || !t.sku.startsWith(prefix)) continue;
      max = Math.max(max, parseInt(t.sku.slice(prefix.length), 10) || 0);
    }
    return max;
  },
  async poolDepth(machineId) {
    const out = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const t of (await memoryState()).tees.values()) {
      if (t.machine_id === machineId && t.status === 'available') out[t.rarity] += 1;
    }
    return out;
  },

  async insertPull(row) { (await memoryState()).pulls.set(row.id, { ...row }); },
  async getPull(id) { const p = (await memoryState()).pulls.get(id); return p ? { ...p } : null; },
  async listPullsByIntent(intentId) {
    return [...(await memoryState()).pulls.values()]
      .filter((p) => p.intent_id === intentId)
      .sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map((p) => ({ ...p }));
  },
  async decidePull(id, wallet, decision, patch) {
    const p = (await memoryState()).pulls.get(id);
    if (!p || p.wallet !== wallet || p.decision !== 'pending') return null;
    Object.assign(p, patch, { decision });
    return { ...p };
  },

  async listWebhooks(machineId) {
    return [...(await memoryState()).webhooks.values()]
      .filter((w) => w.machine_id === machineId && w.status === 'active');
  },
  async insertWebhook(row) {
    const w: WebhookRow = { ...row, id: randomUUID(), created_at: new Date().toISOString() };
    (await memoryState()).webhooks.set(w.id, w);
    return { ...w };
  },
  async insertDelivery(row) {
    const d: DeliveryRow = { ...row, id: randomUUID(), created_at: new Date().toISOString() };
    (await memoryState()).deliveries.set(d.id, d);
    return { ...d };
  },
  async updateDelivery(id, patch) {
    const d = (await memoryState()).deliveries.get(id);
    if (d) Object.assign(d, patch);
  },
  async listDeliveries(machineId, limit) {
    return [...(await memoryState()).deliveries.values()]
      .filter((d) => d.machine_id === machineId)
      .sort((x, y) => y.created_at.localeCompare(x.created_at))
      .slice(0, limit)
      .map((d) => ({ ...d }));
  },
};

export function db(): Db {
  return isSandbox() ? memoryDb : supabaseDb;
}
