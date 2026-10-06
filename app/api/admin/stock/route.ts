/* Back-of-house stock for the default machine. A thin alias over the same
   code as GET and POST /v1/inventory; the only difference is the credential
   (x-admin-key instead of x-api-key). GET = full inventory, POST = intake. */

import { adminAuthorized, adminMachine, errorResponse, unauthorized } from '@/lib/server/admin';
import { intakeInventory, listInventory, type IntakeRow } from '@/lib/server/inventory';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!adminAuthorized(req)) return unauthorized();
  try {
    const machine = await adminMachine();
    const tees = await listInventory(machine.id);
    return Response.json({ tees });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  if (!adminAuthorized(req)) return unauthorized();
  try {
    const machine = await adminMachine();
    const body = (await req.json()) as { rows?: IntakeRow[] };
    const tees = await intakeInventory(machine, body.rows ?? []);
    return Response.json({ tees });
  } catch (e) {
    return errorResponse(e);
  }
}
