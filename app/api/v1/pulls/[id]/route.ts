import { NextRequest, NextResponse } from 'next/server';
import { requirePlayer } from '@/lib/server/privy';
import { getIntent, listSlots } from '@/lib/server/ledger';
import { pullView } from '@/lib/server/api';
import { apiError, errorResponse } from '@/lib/server/http';

export const runtime = 'nodejs';

/** GET /v1/pulls/:id. The pull and its slots, for the player who owns it. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const player = await requirePlayer(req);
    if (!player) return apiError('unauthorized', 'Sign in first');
    const { id } = await ctx.params;
    const intent = await getIntent(id, player.wallet);
    const slots = await listSlots(intent.id);
    return NextResponse.json(pullView(intent, slots));
  } catch (e) {
    return errorResponse(e);
  }
}
