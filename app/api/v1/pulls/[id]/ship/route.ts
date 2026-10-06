import { NextRequest, NextResponse } from 'next/server';
import { requirePlayer } from '@/lib/server/privy';
import { getIntent, markShipped, resolveSlot } from '@/lib/server/ledger';
import { emitWebhook } from '@/lib/server/webhooks';
import { apiError, errorResponse, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';

/**
 * POST /v1/pulls/:id/ship. Keep a slot. Marks it shipped and the piece
 * gone from the pool, scoped to the signed-in player's own pull. Address
 * collection is left to you (see README, "What is left for you").
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const player = await requirePlayer(req);
    if (!player) return apiError('unauthorized', 'Sign in first');

    const { id } = await ctx.params;
    const body = await readJson<{ slot?: string }>(req).catch(() => ({ slot: undefined }));

    const intent = await getIntent(id, player.wallet);
    const slot = await resolveSlot(intent, body.slot);
    const row = await markShipped(slot);

    await emitWebhook(intent.machine_id, 'pull.shipped', {
      pullId: intent.id,
      slotId: slot.id,
      wallet: player.wallet,
      pieceId: slot.tee_id,
    });

    return NextResponse.json({ pullId: intent.id, slotId: slot.id, decision: row.decision });
  } catch (e) {
    return errorResponse(e);
  }
}
