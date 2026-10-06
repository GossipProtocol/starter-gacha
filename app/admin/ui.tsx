'use client';

/* Admin shell: password gate + nav + fetch helper. The password is only a
   session unlock for the ops pages; every API call re-verifies it server-side
   against ADMIN_PASSWORD. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';

const KEY_STORAGE = 'tm-admin-key';

const AdminKeyContext = createContext<string>('');
export function useAdminKey(): string {
  return useContext(AdminKeyContext);
}

export async function adminFetch<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-admin-key': key, ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

const NAV = [
  { href: '/admin', label: 'STOCK' },
  { href: '/admin/orders', label: 'ORDERS' },
  { href: '/admin/labels', label: 'LABELS' },
];

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setKey(sessionStorage.getItem(KEY_STORAGE) ?? '');
    setLoaded(true);
  }, []);

  async function unlock() {
    setChecking(true);
    setError('');
    const res = await fetch('/api/admin/stock', { headers: { 'x-admin-key': input } });
    setChecking(false);
    // 401 = wrong password. Anything else (including a DB config error)
    // means the password was accepted; let the pages surface their errors.
    if (res.status === 401) {
      setError('Wrong password');
      return;
    }
    sessionStorage.setItem(KEY_STORAGE, input);
    setKey(input);
  }

  if (!loaded) return null;

  if (!key) {
    return (
      <div className="max-w-sm mx-auto px-4 py-24">
        <div className="bg-surface border-2 border-ink rounded-2xl shadow-hard p-6">
          <h1 className="font-bold text-2xl tracking-tight">BACK OF HOUSE</h1>
          <p className="text-ink-soft text-sm mt-1">Ops password to continue.</p>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            className="mt-4 w-full bg-paper border-2 border-ink rounded-xl px-3 py-2 outline-none font-mono"
            placeholder="password"
            autoFocus
          />
          {error && <p className="mt-2 text-sm font-mono text-red-700">{error}</p>}
          <button
            onClick={unlock}
            disabled={checking || input.length === 0}
            className="press shadow-hard mt-4 w-full bg-lime border-2 border-ink rounded-xl px-4 py-2 font-bold"
          >
            {checking ? '…' : 'ENTER'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminKeyContext.Provider value={key}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="no-print flex items-center gap-2 mb-6">
          <span className="font-bold tracking-tight mr-2">BACK OF HOUSE</span>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`border-2 border-ink rounded-xl px-3 py-1 font-bold text-sm press shadow-hard-sm ${
                pathname === n.href ? 'bg-lime' : 'bg-surface'
              }`}
            >
              {n.label}
            </Link>
          ))}
          <button
            onClick={() => {
              sessionStorage.removeItem(KEY_STORAGE);
              setKey('');
            }}
            className="ml-auto font-mono text-xs text-ink-soft underline"
          >
            lock
          </button>
        </div>
        {children}
      </div>
    </AdminKeyContext.Provider>
  );
}
