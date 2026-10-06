/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY ledger. The business rules of a pull, written once over the
   storage seam in lib/server/db.ts (Supabase live, memory in the sandbox).

   Rules this file enforces, so the routes do not have to:
     - a pull is priced here, from the machine row, never from the client
     - the roll reads the machine row, the same table the odds route serves
     - a piece is reserved atomically (one call, one row lock)
     - a buyback amount is the value frozen on the pull row at roll time
     - a buyback or ship resolves only for the wallet that owns the slot,
       and only while the decision is still pending

   Vocabulary: the API calls an intent a "pull" (one purchase of `count`
   slots) and calls each revealed piece a "slot". The tables keep their
   names (intents, pulls) so the schema matches the original product.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import { randomUUID } from 'crypto';
import { buybackPctUnder, buybackValueUnder } from '../config';
import { rollRarityFrom } from '../rng';
import { db, type IntentRow, type PullRow, type TeeRow } from './db';
import { ApiError } from './http';
import type { Category, MachineConfig, Rarity, Size, Tier } from '../types';

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'grail'];
const TIERS: Tier[] = ['starter', 'standard', 'legendary'];
const CATEGORIES: Category[] = ['surprise', 'music', 'sports', 'designer'];
const SIZES: Size[] = ['S', 'M', 'L', 'XL', 'XXL'];

/** Quote and record an intent. The price comes from the machine row. */
export async function createIntent(machine: MachineConfig, args: {
  wallet: string; tier: Tier; category: Category; size: Size; count: number;
}): Promise<IntentRow> {
  const { wallet, tier, category, size } = args;
  const count = Math.floor(Number(args.count));
  if (!TIERS.includes(tier)) throw new ApiError('invalid_request', `tier must be one of ${TIERS.join(', ')}`);
  if (!CATEGORIES.includes(category)) throw new ApiError('invalid_request', `category must be one of ${CATEGORIES.join(', ')}`);
  if (!SIZES.includes(size)) throw new ApiError('invalid_request', `size must be one of ${SIZES.join(', ')}`);
  if (!Number.isFinite(count) || count < 1 || count > 10) throw new ApiError('invalid_request', 'count must be 1 to 10');
  if (machine.status !== 'active') throw new ApiError('machine_paused', 'This machine is not taking pulls right now');

  const unitPrice = machine.tierMeta[tier].price;
  const total = Math.round(unitPrice * count * 100) / 100;

  const row: IntentRow = {
    id: randomUUID(),
    machine_id: machine.id,
    wallet, tier, category, size, count,
    unit_price: unitPrice, total,
    status: 'quoted', tx_sig: null,
    created_at: new Date().toISOString(),
  };
  await db().insertIntent(row);
  return row;
}

/** Load an intent for its owner. Unknown and not-yours look the same. */
export async function getIntent(id: string, wallet: string): Promise<IntentRow> {
  const row = await db().getIntent(id);
  if (!row || row.wallet !== wallet) throw new ApiError('unknown_pull', 'Unknown pull');
  return row;
}

/** Mark paid exactly once. Returns false if the intent was already paid, so a
 *  replayed settle call cannot open a second set of slots. */
export function markIntentPaid(id: string, txSig: string): Promise<boolean> {
  return db().markIntentPaid(id, txSig);
}

export function markIntentOpened(id: string): Promise<void> {
  return db().setIntentStatus(id, 'opened');
}

/** Roll one slot server-side from the machine's table, reserve a piece
 *  atomically, write the pull row with the buyback value frozen. The
 *  empty-bucket rule upgrades the rarity, never downgrades it. */
export async function rollAndReserve(machine: MachineConfig, intent: IntentRow): Promise<{ pull: PullRow; tee: TeeRow }> {
  const store = db();
  const rolled = rollRarityFrom(machine.tierTable, intent.tier);

  let tee: TeeRow | null = null;
  for (let i = RARITY_ORDER.indexOf(rolled); i < RARITY_ORDER.length && !tee; i++) {
    const rarity = RARITY_ORDER[i];
    const band = machine.tierTable[intent.tier][rarity];
    tee = await store.reserveTee({
      machineId: machine.id,
      category: intent.category === 'surprise' ? null : intent.category,
      size: intent.size,
      rarity,
      min: band.min,
      max: band.max,
    });
  }
  if (!tee) {
    throw new ApiError('out_of_stock', 'No stock left for this size and category. The pull stays paid; refund or restock.');
  }

  const pull: PullRow = {
    id: randomUUID(),
    machine_id: machine.id,
    intent_id: intent.id,
    tee_id: tee.id,
    wallet: intent.wallet,
    tier: intent.tier,
    price_paid: intent.unit_price,
    buyback_pct: buybackPctUnder(machine.buyback, tee.rarity, tee.category),
    buyback_value: buybackValueUnder(machine.buyback, Number(tee.price), tee.rarity, tee.category),
    decision: 'pending',
    tracking: null,
    buyback_sig: null,
    created_at: new Date().toISOString(),
  };
  await store.insertPull(pull);
  return { pull, tee };
}

/** The slots of an intent with their pieces, in roll order. */
export async function listSlots(intentId: string): Promise<{ pull: PullRow; tee: TeeRow }[]> {
  const store = db();
  const pulls = await store.listPullsByIntent(intentId);
  const out: { pull: PullRow; tee: TeeRow }[] = [];
  for (const pull of pulls) {
    const tee = await store.getTee(pull.tee_id);
    if (tee) out.push({ pull, tee });
  }
  return out;
}

/** Resolve which slot a buyback or ship names. A pull with one slot needs
 *  no slot id; a pull with several must name one. Scoped to the owner. */
export async function resolveSlot(intent: IntentRow, slotId: string | undefined): Promise<PullRow> {
  if (intent.status === 'quoted') throw new ApiError('not_settled', 'This pull has not been paid and rolled yet');
  const pulls = await db().listPullsByIntent(intent.id);
  if (pulls.length === 0) throw new ApiError('not_settled', 'This pull has no slots yet');
  if (!slotId) {
    if (pulls.length > 1) throw new ApiError('invalid_request', 'slot is required when a pull has more than one slot');
    return pulls[0];
  }
  const slot = pulls.find((p) => p.id === slotId);
  if (!slot || slot.wallet !== intent.wallet) throw new ApiError('unknown_pull', 'Unknown slot');
  return slot;
}

/** The buyback amount for a slot: the value frozen at roll time, only while
 *  the decision is pending. */
export function resolveBuyback(slot: PullRow): number {
  if (slot.decision !== 'pending') throw new ApiError('already_decided', 'Already decided');
  return Number(slot.buyback_value);
}

/** After the chain paid: mark sold back and return the piece to the pool.
 *  The conditional update means a second call finds no pending row. */
export async function markSoldBack(slot: PullRow, sig: string): Promise<PullRow> {
  const store = db();
  const row = await store.decidePull(slot.id, slot.wallet, 'soldback', { buyback_sig: sig });
  if (!row) throw new ApiError('already_decided', 'Already decided');
  await store.setTeeStatus(slot.tee_id, 'available');
  return row;
}

export async function markShipped(slot: PullRow): Promise<PullRow> {
  const store = db();
  const row = await store.decidePull(slot.id, slot.wallet, 'shipped', {});
  if (!row) throw new ApiError('already_decided', 'Already decided');
  await store.setTeeStatus(slot.tee_id, 'shipped');
  return row;
}
