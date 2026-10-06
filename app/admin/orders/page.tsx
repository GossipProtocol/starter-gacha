'use client';

/* ORDERS — every pull, its decision, ship-to, and tracking. The USPS button
   downloads a Click-N-Ship bulk-import CSV of ship-decided orders that have
   an address and no tracking number yet. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, useAdminKey } from '../ui';
import type { AdminOrder } from '../types';

function shortWallet(w: string): string {
  return w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

export default function OrdersPage() {
  const key = useAdminKey();
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'shipped' | 'soldback'>('all');
  const [trackingDraft, setTrackingDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await adminFetch<{ orders: AdminOrder[] }>('/api/admin/orders', key);
      setOrders(res.orders);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [key]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(
    () => (orders ?? []).filter((o) => filter === 'all' || o.decision === filter),
    [orders, filter]
  );
  const toShip = useMemo(
    () => (orders ?? []).filter((o) => o.decision === 'shipped' && !o.tracking && o.ship_address1),
    [orders]
  );

  async function saveTracking(id: string) {
    const tracking = (trackingDraft[id] ?? '').trim();
    if (!tracking) return;
    try {
      await adminFetch('/api/admin/orders', key, { method: 'PATCH', body: JSON.stringify({ id, tracking }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-bold text-3xl tracking-tight">ORDERS</h1>
        <div className="flex gap-1 ml-2">
          {(['all', 'pending', 'shipped', 'soldback'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`border-2 border-ink rounded-lg px-2 py-1 font-mono text-xs press ${filter === f ? 'bg-lime' : 'bg-surface'}`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <a
          href={`/api/admin/orders/export?key=${encodeURIComponent(key)}`}
          className={`ml-auto press shadow-hard bg-lime border-2 border-ink rounded-xl px-4 py-2 font-bold text-sm ${toShip.length === 0 ? 'opacity-45 pointer-events-none' : ''}`}
        >
          EXPORT USPS CSV ({toShip.length})
        </a>
      </div>

      {error && (
        <p className="mt-5 font-mono text-sm text-red-700 bg-surface border-2 border-ink rounded-xl p-3">{error}</p>
      )}

      <div className="mt-5 bg-surface border-2 border-ink rounded-2xl shadow-hard overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-xs text-ink-soft border-b-2 border-ink">
              {['DATE', 'SKU', 'PIECE', 'WALLET', 'DECISION', 'BUYBACK', 'SHIP TO', 'TRACKING'].map((h) => (
                <th key={h} className="px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <tr key={o.id} className="border-b border-heather last:border-0 align-top">
                <td className="px-3 py-2 font-mono whitespace-nowrap">{o.created_at.slice(0, 10)}</td>
                <td className="px-3 py-2 font-mono">{o.tee?.sku ?? ''}</td>
                <td className="px-3 py-2 font-bold">{o.tee?.name ?? ''}</td>
                <td className="px-3 py-2 font-mono">{shortWallet(o.wallet)}</td>
                <td className="px-3 py-2 font-mono">{o.decision}</td>
                <td className="px-3 py-2 font-mono">${o.buyback_value}</td>
                <td className="px-3 py-2">
                  {o.ship_address1
                    ? `${o.ship_name ?? ''} · ${o.ship_city}, ${o.ship_state}`
                    : o.decision === 'shipped'
                      ? <span className="text-red-700 font-mono">no address</span>
                      : ''}
                </td>
                <td className="px-3 py-2">
                  {o.tracking ? (
                    <span className="font-mono">{o.tracking}</span>
                  ) : o.decision === 'shipped' ? (
                    <span className="flex gap-1">
                      <input
                        value={trackingDraft[o.id] ?? ''}
                        onChange={(e) => setTrackingDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                        placeholder="tracking #"
                        className="w-36 bg-paper border-2 border-ink rounded-lg px-2 py-1 font-mono text-xs outline-none"
                      />
                      <button
                        onClick={() => saveTracking(o.id)}
                        className="border-2 border-ink rounded-lg px-2 font-bold text-xs bg-lime press"
                      >
                        SAVE
                      </button>
                    </span>
                  ) : ''}
                </td>
              </tr>
            ))}
            {orders !== null && visible.length === 0 && (
              <tr><td className="px-3 py-6 text-ink-soft" colSpan={8}>No orders{filter !== 'all' ? ` (${filter})` : ''} yet.</td></tr>
            )}
            {orders === null && !error && (
              <tr><td className="px-3 py-6 text-ink-soft" colSpan={8}>Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
