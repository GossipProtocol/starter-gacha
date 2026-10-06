'use client';

/* ─────────────────────────────────────────────────────────────────────────
   THRIFT MACHINE — wallet/auth abstraction.

   The whole app reads identity through useWallet(). Two backends feed the
   same context:
     • Privy  — when NEXT_PUBLIC_PRIVY_APP_ID is set (real auth + embedded
       Solana wallets). Bridge lives in providers.tsx.
     • Demo   — otherwise. A local mock address so the machine is fully
       usable with zero secrets. Clearly not real auth.
   ───────────────────────────────────────────────────────────────────────── */

import React, { createContext, useContext, useEffect, useState } from 'react';

export interface WalletValue {
  ready: boolean;
  connected: boolean;
  address: string | null;
  login: () => void;
  logout: () => void;
  isPrivy: boolean;
}

const noop = () => {};
export const WalletContext = createContext<WalletValue>({
  ready: false, connected: false, address: null, login: noop, logout: noop, isPrivy: false,
});

export function useWallet(): WalletValue {
  return useContext(WalletContext);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function genAddress(): string {
  let s = '';
  for (let i = 0; i < 44; i++) s += B58[Math.floor(Math.random() * B58.length)];
  return s;
}

const ADDR_KEY = 'tm_demo_wallet';
const CONN_KEY = 'tm_demo_connected';

/** Demo backend: instant local "connect", persisted mock address. */
export function DemoWalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ADDR_KEY);
      const conn = window.localStorage.getItem(CONN_KEY) === '1';
      if (saved) setAddress(saved);
      if (saved && conn) setConnected(true);
    } catch { /* */ }
    setReady(true);
  }, []);

  const login = () => {
    const a = address ?? genAddress();
    setAddress(a);
    setConnected(true);
    try {
      window.localStorage.setItem(ADDR_KEY, a);
      window.localStorage.setItem(CONN_KEY, '1');
    } catch { /* */ }
  };

  const logout = () => {
    setConnected(false);
    try { window.localStorage.setItem(CONN_KEY, '0'); } catch { /* */ }
  };

  const value: WalletValue = {
    ready, connected, address: connected ? address : null, login, logout, isPrivy: false,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
