import { NextRequest, NextResponse } from 'next/server';
import { requireOperator } from '@/lib/server/operator';
import { db } from '@/lib/server/db';
import { apiError, errorResponse, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';

/** GET /v1/webhooks. Operator. Registered endpoints (secrets omitted) and
 *  the last 50 deliveries. */
export async function GET(req: NextRequest) {
  try {
    const row = await requireOperator(req);
    if (!row) return apiError('unauthorized', 'x-api-key missing or invalid');
    const store = db();
    const endpoints = await store.listWebhooks(row.id);
    const deliveries = await store.listDeliveries(row.id, 50);
    return NextResponse.json({
      machineId: row.id,
      endpoints: endpoints.map((w) => ({ id: w.id, url: w.url, status: w.status, createdAt: w.created_at })),
      deliveries: deliveries.map((d) => ({
        id: d.id, webhookId: d.webhook_id, event: d.event, status: d.status,
        attempts: d.attempts, lastStatus: d.last_status, lastError: d.last_error,
        deliveredAt: d.delivered_at, createdAt: d.created_at,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /v1/webhooks. Operator registers a URL and a secret. The secret
 *  signs every delivery (see lib/server/webhooks.ts for verification). */
export async function POST(req: NextRequest) {
  try {
    const row = await requireOperator(req);
    if (!row) return apiError('unauthorized', 'x-api-key missing or invalid');
    const body = await readJson<{ url?: string; secret?: string }>(req);
    let url: URL;
    try { url = new URL(body.url ?? ''); } catch { return apiError('invalid_request', 'url must be an absolute http(s) URL'); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return apiError('invalid_request', 'url must be http or https');
    if (!body.secret || body.secret.length < 16) return apiError('invalid_request', 'secret must be at least 16 characters');
    const w = await db().insertWebhook({ machine_id: row.id, url: url.toString(), secret: body.secret, status: 'active' });
    return NextResponse.json({ id: w.id, url: w.url, status: w.status, createdAt: w.created_at }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
