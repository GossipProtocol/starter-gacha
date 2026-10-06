import { NextRequest, NextResponse } from 'next/server';
import { requirePlayer } from '@/lib/server/privy';
import { loadMachine } from '@/lib/server/machines';
import { createIntent } from '@/lib/server/ledger';
import { preparePull } from '@/lib/server/settlement';
import { pullView } from '@/lib/server/api';
import { apiError, errorResponse, readJson } from '@/lib/server/http';
import type { Category, Size, Tier } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * POST /v1/pulls. Quote and prepare. The client names what it wants
 * (machineId, tier, count, category, size). The server identifies the
 * player from the bearer token, prices the pull from the machine row,
 * records the intent, and returns the unsigned payment transaction for
 * exactly that amount (house share into the machine's treasury plus the
 * course fee transfer, in one transaction).
 *
 * The request body carries no amount and no wallet address on purpose.
 */
export async function POST(req: NextRequest) {
  try {
    const player = await requirePlayer(req);
    if (!player) return apiError('unauthorized', 'Sign in first');

    const body = await readJson<{ machineId?: string; tier?: Tier; count?: number; category?: Category; size?: Size }>(req);
    if (!body.machineId || !body.tier || !body.count || !body.category || !body.size) {
      return apiError('invalid_request', 'machineId, tier, count, category, size required');
    }

    const machine = await loadMachine(body.machineId);
    if (!machine) return apiError('unknown_machine', `No machine ${body.machineId}`);

    const intent = await createIntent(machine, {
      wallet: player.wallet,
      tier: body.tier,
      count: body.count,
      category: body.category,
      size: body.size,
    });

    const { unsignedTxB64 } = await preparePull({
      machine,
      owner: player.wallet,
      intentId: intent.id,
      totalUsdc: intent.total,
    });

    return NextResponse.json(pullView(intent, [], { unsignedTxB64 }), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
