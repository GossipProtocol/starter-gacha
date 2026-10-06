/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY operator auth.

   Operator routes (inventory, webhooks) authenticate with an API key in the
   `x-api-key` header. The key identifies the machine: the machines table
   stores sha256(key) in `operator_key_hash` and the lookup is by hash, so a
   leaked database dump does not leak keys. Keys are high-entropy random
   strings (gk_live_ + 32 bytes of hex), which is why a plain sha256 is the
   right hash here; a slow password hash defends short human passwords and
   these are not that.

   Never log the key or the header. Never echo it back after the seed
   script prints it once.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { db, isSandbox, type MachineRow } from './db';

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** A fresh operator key. Printed once by scripts/seed-machine.ts. */
export function newOperatorKey(): string {
  return `gk_live_${randomBytes(32).toString('hex')}`;
}

/** The sandbox accepts one well-known key so a storefront can be built
 *  against the demo API with no database. Override with GACHA_SANDBOX_OPERATOR_KEY. */
export function sandboxOperatorKey(): string {
  return process.env.GACHA_SANDBOX_OPERATOR_KEY || 'gk_sandbox_operator';
}

/** Resolve the machine an operator key belongs to, or null (route answers 401). */
export async function requireOperator(req: Request): Promise<MachineRow | null> {
  const key = req.headers.get('x-api-key')?.trim();
  if (!key) return null;
  if (isSandbox() && key !== sandboxOperatorKey()) return null;
  return db().getMachineByKeyHash(sha256Hex(key));
}
