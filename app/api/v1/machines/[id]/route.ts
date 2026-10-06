import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/db';
import { loadMachine } from '@/lib/server/machines';
import { machineView } from '@/lib/server/api';
import { apiError, errorResponse } from '@/lib/server/http';

export const runtime = 'nodejs';

/**
 * GET /v1/machines/:id. Public. The odds, prices, tiers, buyback
 * percentages and pool depth by rarity of one machine, read from the
 * machine row. The settle route rolls from the same row, which is the
 * whole point: the API serves the odds it rolls with.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const machine = await loadMachine(id);
    if (!machine) return apiError('unknown_machine', `No machine ${id}`);
    const pool = await db().poolDepth(machine.id);
    return NextResponse.json(machineView(machine, pool), {
      headers: { 'cache-control': 'public, max-age=5' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
