import { NextRequest, NextResponse } from 'next/server';
import { requireOperator } from '@/lib/server/operator';
import { machineFromRow } from '@/lib/server/machines';
import { intakeInventory, listInventory, type IntakeRow } from '@/lib/server/inventory';
import { pieceView } from '@/lib/server/api';
import { apiError, errorResponse, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';

/** GET /v1/inventory. Operator. Every piece of the key's machine with status. */
export async function GET(req: NextRequest) {
  try {
    const row = await requireOperator(req);
    if (!row) return apiError('unauthorized', 'x-api-key missing or invalid');
    const tees = await listInventory(row.id);
    return NextResponse.json({
      machineId: row.id,
      pieces: tees.map((t) => ({ ...pieceView(t), status: t.status, createdAt: t.created_at })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /v1/inventory. Operator intake. Rows in, SKUs out, rarity derived
 *  from price against the machine's bands. */
export async function POST(req: NextRequest) {
  try {
    const row = await requireOperator(req);
    if (!row) return apiError('unauthorized', 'x-api-key missing or invalid');
    const machine = machineFromRow(row);
    const body = await readJson<{ pieces?: IntakeRow[] }>(req);
    const tees = await intakeInventory(machine, body.pieces ?? []);
    return NextResponse.json({
      machineId: row.id,
      pieces: tees.map((t) => ({ ...pieceView(t), status: t.status, createdAt: t.created_at })),
    }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
