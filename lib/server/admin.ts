/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY back-of-house auth.

   The /admin pages and /api/admin/* routes are the operator UI for the
   default machine. They carry the ops password as an `x-admin-key` header
   or a `?key=` query param (the query form exists for browser-native
   downloads like the shipping CSV), compared against ADMIN_PASSWORD. They
   call the same inventory and ledger code the v1 operator routes call;
   the only difference is the credential. Never import this from a client
   component.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import { timingSafeEqual } from 'crypto';
import { DEFAULT_MACHINE_ID } from '../config';
import { supabaseClient } from './db';
import { loadMachine } from './machines';
import type { MachineConfig } from '../types';

export function adminAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? '';
  if (!expected) return false;
  const url = new URL(req.url);
  const supplied = req.headers.get('x-admin-key') ?? url.searchParams.get('key') ?? '';
  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

/** The machine the back of house operates: the one seeded from lib/config.ts.
 *  Set ADMIN_MACHINE_ID to point the admin pages at another machine. */
export async function adminMachine(): Promise<MachineConfig> {
  const id = process.env.ADMIN_MACHINE_ID || DEFAULT_MACHINE_ID;
  const machine = await loadMachine(id);
  if (!machine) throw new Error(`Machine ${id} not found. Run bun scripts/seed-machine.ts.`);
  return machine;
}

/** Raw Supabase client for the admin pages' joins (orders with their piece). */
export const adminDb = supabaseClient;

export function errorResponse(e: unknown): Response {
  const message = e instanceof Error ? e.message : 'Unknown error';
  return Response.json({ error: message }, { status: 500 });
}
