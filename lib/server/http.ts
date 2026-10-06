/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY response helpers for the v1 API.

   Every error is `{ error: { code, message } }` with one of the codes
   below, so a storefront can branch on `code` and show `message` as is.
   The codes are listed in openapi.yaml and SKILL.md; add there when you
   add here.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'unauthorized'          // 401: missing or invalid player token / operator key
  | 'invalid_request'       // 400: a field is missing or out of range
  | 'unknown_machine'       // 404: no machine with that id
  | 'machine_paused'        // 423: the machine is not taking pulls
  | 'unknown_pull'          // 404: no pull with that id for this player
  | 'already_settled'       // 409: the pull was already paid and rolled
  | 'not_settled'           // 409: buyback or ship on a pull that never paid
  | 'tx_mismatch'           // 422: the signed tx is not the one the server built
  | 'out_of_stock'          // 409: no piece left for that size / category
  | 'already_decided'       // 409: the slot was already shipped or sold back
  | 'settlement_unconfigured' // 503: chain env missing (and not in sandbox)
  | 'internal';             // 500

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  invalid_request: 400,
  unknown_machine: 404,
  machine_paused: 423,
  unknown_pull: 404,
  already_settled: 409,
  not_settled: 409,
  tx_mismatch: 422,
  out_of_stock: 409,
  already_decided: 409,
  settlement_unconfigured: 503,
  internal: 500,
};

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiError(code: ApiErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] });
}

/** Map any thrown value to a response. Ledger and settlement throw
 *  ApiError for expected cases; anything else is a 500 with the message. */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) return apiError(e.code, e.message);
  const message = e instanceof Error ? e.message : 'Unknown error';
  if (/not configured/i.test(message)) return apiError('settlement_unconfigured', message);
  return apiError('internal', message);
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError('invalid_request', 'Body must be JSON');
  }
}
