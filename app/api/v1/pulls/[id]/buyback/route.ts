import { NextRequest, NextResponse } from 'next/server';
import { requirePlayer } from '@/lib/server/privy';
import { loadMachine } from '@/lib/server/machines';
import { getIntent, markSoldBack, resolveBuyback, resolveSlot } from '@/lib/server/ledger';
import { payBuyback } from '@/lib/server/settlement';
import { emitWebhook } from '@/lib/server/webhooks';
import { apiError, errorResponse, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';

/**
 * POST /v1/pulls/:id/buyback. Sell a slot back. The body names a slot and
 * nothing else (and nothing at all when the pull has one slot). The owner
 * comes from the bearer token, the amount comes from the slot row frozen
 * at roll time, and the on-chain receipt PDA guarantees at-most-once
 * payout even if this route is retried after a crash.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const player = await requirePlayer(req);
    if (!player) return apiError('unauthorized', 'Sign in first');

    const { id } = await ctx.params;
    const body = await readJson<{ slot?: string }>(req).catch(() => ({ slot: undefined }));

    const intent = await getIntent(id, player.wallet);
    const machine = await loadMachine(intent.machine_id);
    if (!machine) return apiError('unknown_machine', `No machine ${intent.machine_id}`);

    const slot = await resolveSlot(intent, body.slot);
    const amountUsdc = resolveBuyback(slot);
    const paid = await payBuyback({ machine, owner: player.wallet, pullId: slot.id, amountUsdc });
    const row = await markSoldBack(slot, paid.signature);

    await emitWebhook(machine.id, 'buyback.paid', {
      pullId: intent.id,
      slotId: slot.id,
      wallet: player.wallet,
      amountUsdc: paid.amountUsdc,
      signature: paid.signature,
    });

    return NextResponse.json({
      pullId: intent.id,
      slotId: slot.id,
      amountUsdc: paid.amountUsdc,
      signature: paid.signature,
      decision: row.decision,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
