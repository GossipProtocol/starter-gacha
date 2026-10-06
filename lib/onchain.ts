/* ─────────────────────────────────────────────────────────────────────────
   Client seam over the v1 API.

   Thin client over the routes under app/api/v1. The browser never holds a
   house key, never builds program instructions, never names a price, and
   never rolls an outcome. It only: (1) asks the API to quote and prepare a
   pull, (2) signs the returned transaction with the embedded wallet,
   (3) hands it back to settle and receives the slots, (4) asks for a
   buyback or a ship by pull id and slot id. Every call carries the Privy
   access token so the server can identify the player itself.

   This is the live swap for the money-moving methods in machine.ts, and it
   is also what any other storefront built on the API does; SKILL.md at the
   repo root describes the same sequence for an agent. Wire it in by
   replacing machine.submitPull / machine.openPull / machine.buyback bodies
   with these calls when Privy is active. See docs/ONCHAIN_SPEC.md.
   ───────────────────────────────────────────────────────────────────────── */

import { Transaction } from '@solana/web3.js';
import { DEFAULT_MACHINE_ID } from './config';
import type { Category, Decision, Rarity, Size, Tier } from './types';

export interface SignTx {
  /** Privy embedded-wallet signer: signs and returns the same tx. */
  (tx: Transaction): Promise<Transaction>;
}

/** usePrivy().getAccessToken, passed in so this file stays framework-free. */
export type GetToken = () => Promise<string | null>;

export const API_BASE = process.env.NEXT_PUBLIC_GACHA_API_BASE ?? '/api/v1';

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body: unknown, getToken: GetToken): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const parsed = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new ApiClientError(parsed?.error?.code ?? 'http_error', parsed?.error?.message ?? `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

export interface ApiPiece {
  id: string; sku: string; name: string; brand: string; era: string;
  category: Category; size: Size; rarity: Rarity; quality: number | null;
  priceUsd: number; images: string[];
}

export interface ApiSlot {
  id: string;
  piece: ApiPiece;
  buybackPct: number;
  buybackValueUsdc: number;
  decision: Decision;
  buybackSignature: string | null;
  createdAt: string;
}

export interface ApiPull {
  id: string;
  machineId: string;
  status: 'quoted' | 'paid' | 'opened' | 'expired';
  tier: Tier; category: Category; size: Size; count: number;
  unitPriceUsdc: number; totalUsdc: number;
  signature: string | null;
  slots: ApiSlot[];
  createdAt: string;
  unsignedTxB64?: string;
}

/** Public odds and pool depth. No token needed. */
export async function getMachine(machineId: string = DEFAULT_MACHINE_ID) {
  const res = await fetch(`${API_BASE}/machines/${encodeURIComponent(machineId)}`);
  if (!res.ok) throw new ApiClientError('unknown_machine', `No machine ${machineId}`, res.status);
  return res.json();
}

/**
 * Pay for a pull and receive the slots.
 *   POST /pulls             -> server prices the pull, records it, builds the tx
 *   sign                    -> embedded wallet signs as the USDC account authority
 *   POST /pulls/:id/settle  -> server verifies the tx, co-signs, submits, rolls, reserves
 */
export async function settlePull(args: {
  machineId?: string; tier: Tier; count: number; category: Category; size: Size;
  signTx: SignTx; getToken: GetToken;
}): Promise<ApiPull> {
  const prepared = await call<ApiPull>('POST', '/pulls', {
    machineId: args.machineId ?? DEFAULT_MACHINE_ID,
    tier: args.tier, count: args.count, category: args.category, size: args.size,
  }, args.getToken);

  const tx = Transaction.from(Buffer.from(prepared.unsignedTxB64!, 'base64'));
  const signed = await args.signTx(tx);
  const signedTxB64 = signed
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');

  return call<ApiPull>('POST', `/pulls/${prepared.id}/settle`, { signedTxB64 }, args.getToken);
}

/** Sell a slot back. The server resolves the owner and the amount. */
export function settleBuyback(args: {
  pullId: string; slotId?: string; getToken: GetToken;
}): Promise<{ pullId: string; slotId: string; amountUsdc: number; signature: string; decision: Decision }> {
  return call('POST', `/pulls/${args.pullId}/buyback`, args.slotId ? { slot: args.slotId } : {}, args.getToken);
}

/** Keep a slot. */
export function settleShip(args: {
  pullId: string; slotId?: string; getToken: GetToken;
}): Promise<{ pullId: string; slotId: string; decision: Decision }> {
  return call('POST', `/pulls/${args.pullId}/ship`, args.slotId ? { slot: args.slotId } : {}, args.getToken);
}

/** Re-read a pull and its slots. */
export function getPull(args: { pullId: string; getToken: GetToken }): Promise<ApiPull> {
  return call('GET', `/pulls/${args.pullId}`, undefined, args.getToken);
}
