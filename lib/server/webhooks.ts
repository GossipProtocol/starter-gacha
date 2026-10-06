/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY webhooks.

   An operator registers a URL and a secret for their machine. The server
   posts three events: `pull.opened` (slots revealed), `buyback.paid` (the
   chain paid a sell-back) and `pull.shipped` (a slot was kept). Every
   delivery carries:

     x-gacha-event:      the event name
     x-gacha-delivery:   the delivery id (retries reuse it; dedupe on it)
     x-gacha-signature:  t=<unix seconds>,v1=<hex HMAC-SHA256>

   The signature is HMAC-SHA256 over `${t}.${rawBody}` with the secret, the
   same pattern as a Stripe webhook. Verify it on the raw request body,
   before parsing, with a constant-time compare:

     import { createHmac, timingSafeEqual } from 'crypto';
     const [t, v1] = header.split(',').map((p) => p.split('=')[1]);
     const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
     const ok = expected.length === v1.length
       && timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))
       && Math.abs(Date.now() / 1000 - Number(t)) < 300;

   Delivery is three attempts with backoff (1s, 4s, 16s), after the HTTP
   response has been sent (`after()` from next/server), and every attempt
   is recorded in webhook_deliveries. A 2xx is delivered; anything else
   after the third try is failed and stays in the table for the operator
   to replay by hand.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import { createHmac } from 'crypto';
import { after } from 'next/server';
import { db, type DeliveryRow } from './db';

export type WebhookEvent = 'pull.opened' | 'buyback.paid' | 'pull.shipped';

const ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 4_000, 16_000];
const TIMEOUT_MS = 8_000;

export function signWebhook(secret: string, timestamp: number, rawBody: string): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** Queue an event for every active endpoint of the machine. Returns the
 *  delivery ids so a route can include them in its response for debugging. */
export async function emitWebhook(machineId: string, event: WebhookEvent, data: unknown): Promise<string[]> {
  const store = db();
  const endpoints = await store.listWebhooks(machineId);
  if (endpoints.length === 0) return [];

  const payload = { event, machineId, createdAt: new Date().toISOString(), data };
  const ids: string[] = [];
  for (const endpoint of endpoints) {
    const delivery = await store.insertDelivery({
      machine_id: machineId,
      webhook_id: endpoint.id,
      event,
      payload,
      attempts: 0,
      status: 'pending',
      last_status: null,
      last_error: null,
      delivered_at: null,
    });
    ids.push(delivery.id);
    const job = () => deliver(delivery, endpoint.url, endpoint.secret);
    // Run after the response is flushed so a slow endpoint never slows a pull.
    try { after(job); } catch { void job(); }
  }
  return ids;
}

async function deliver(delivery: DeliveryRow, url: string, secret: string): Promise<void> {
  const store = db();
  const body = JSON.stringify({ id: delivery.id, ...(delivery.payload as object) });

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const timestamp = Math.floor(Date.now() / 1000);
    let status: number | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-gacha-event': delivery.event,
          'x-gacha-delivery': delivery.id,
          'x-gacha-signature': signWebhook(secret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      if (res.ok) {
        await store.updateDelivery(delivery.id, {
          attempts: attempt, status: 'delivered', last_status: status, last_error: null,
          delivered_at: new Date().toISOString(),
        });
        return;
      }
      error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'fetch failed';
    }
    await store.updateDelivery(delivery.id, {
      attempts: attempt, status: attempt === ATTEMPTS ? 'failed' : 'pending',
      last_status: status, last_error: error,
    });
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
  }
}
