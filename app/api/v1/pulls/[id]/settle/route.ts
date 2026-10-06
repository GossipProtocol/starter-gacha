import { NextRequest, NextResponse } from 'next/server';
import { requirePlayer } from '@/lib/server/privy';
import { loadMachine } from '@/lib/server/machines';
import { getIntent, markIntentOpened, markIntentPaid, rollAndReserve } from '@/lib/server/ledger';
import { submitPull, verifyPullTx } from '@/lib/server/settlement';
import { emitWebhook } from '@/lib/server/webhooks';
import { pullView, slotView } from '@/lib/server/api';
import { apiError, errorResponse, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';

/**
 * POST /v1/pulls/:id/settle. Step 2 of a pull. The client returns the
 * signed transaction. The server:
 *   1. loads the pull for this player (price and count come from the row)
 *   2. verifies the signed tx is byte-for-byte the one it prepared
 *   3. co-signs as fee payer and submits
 *   4. marks the pull paid exactly once
 *   5. rolls every slot server-side from the machine row and reserves a
 *      piece per slot
 *   6. posts pull.opened to the operator's webhooks
 *
 * The roll never runs in the browser. A replayed call after step 4 returns
 * already_settled instead of opening more slots.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const player = await requirePlayer(req);
    if (!player) return apiError('unauthorized', 'Sign in first');

    const { id } = await ctx.params;
    const { signedTxB64 } = await readJson<{ signedTxB64?: string }>(req);
    if (!signedTxB64) return apiError('invalid_request', 'signedTxB64 required');

    const intent = await getIntent(id, player.wallet);
    if (intent.status !== 'quoted') return apiError('already_settled', 'Pull already settled');

    const machine = await loadMachine(intent.machine_id);
    if (!machine) return apiError('unknown_machine', `No machine ${intent.machine_id}`);

    const tx = verifyPullTx(signedTxB64, {
      machine,
      owner: player.wallet,
      intentId: intent.id,
      totalUsdc: Number(intent.total),
    });

    const { signature } = await submitPull(tx, intent.id);

    const first = await markIntentPaid(intent.id, signature);
    if (!first) return apiError('already_settled', 'Pull already settled');

    const slots = [];
    for (let i = 0; i < intent.count; i++) {
      slots.push(await rollAndReserve(machine, intent));
    }
    await markIntentOpened(intent.id);

    const view = pullView({ ...intent, status: 'opened', tx_sig: signature }, slots);
    await emitWebhook(machine.id, 'pull.opened', {
      pullId: intent.id,
      wallet: player.wallet,
      tier: intent.tier,
      totalUsdc: Number(intent.total),
      signature,
      slots: slots.map(({ pull, tee }) => slotView(pull, tee)),
    });

    return NextResponse.json(view);
  } catch (e) {
    return errorResponse(e);
  }
}
