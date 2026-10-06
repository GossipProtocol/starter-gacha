/* Admin orders: GET = all pulls (joined with tee), PATCH = tracking/decision. */

import { adminAuthorized, adminDb, errorResponse, unauthorized } from '@/lib/server/admin';

export async function GET(req: Request) {
  if (!adminAuthorized(req)) return unauthorized();
  try {
    const { data, error } = await adminDb()
      .from('pulls')
      .select('*, tee:tees(sku, name, brand, size, quality)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return Response.json({ orders: data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  if (!adminAuthorized(req)) return unauthorized();
  try {
    const body = (await req.json()) as { id?: string; tracking?: string; decision?: string };
    if (!body.id) return Response.json({ error: 'Missing id' }, { status: 400 });
    const patch: Record<string, string> = {};
    if (typeof body.tracking === 'string') patch.tracking = body.tracking.trim();
    if (typeof body.decision === 'string') patch.decision = body.decision;
    if (Object.keys(patch).length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });

    const { data, error } = await adminDb()
      .from('pulls')
      .update(patch)
      .eq('id', body.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ order: data });
  } catch (e) {
    return errorResponse(e);
  }
}
