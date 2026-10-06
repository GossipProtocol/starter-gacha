'use client';

import React from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { DemoWalletProvider, WalletContext, type WalletValue } from '@/lib/wallet';

type LinkedWallet = { type?: string; chainType?: string; address?: string };

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';
const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || '';

/** Feeds Privy identity into the shared WalletContext so useWallet() is
 *  identical whether we're on Privy or the demo backend. */
function PrivyWalletBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const solana = (user?.linkedAccounts as LinkedWallet[] | undefined)?.find(
    (a) => a.type === 'wallet' && a.chainType === 'solana'
  );
  const address = solana?.address ?? user?.wallet?.address ?? null;

  const value: WalletValue = {
    ready,
    connected: authenticated,
    address: authenticated ? address : null,
    login,
    logout,
    isPrivy: true,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  // No Privy creds → demo mode. The machine stays fully usable; the header
  // shows a "demo wallet" affordance instead of the Privy modal.
  if (!appId) {
    return <DemoWalletProvider>{children}</DemoWalletProvider>;
  }

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={{
        // loginMethods omitted on purpose — whatever's enabled on the Privy
        // dashboard (Google / email / wallet) is what users see.
        appearance: {
          walletChainType: 'solana-only',
          theme: 'light',
          accentColor: '#0C0C0C',
          logo: undefined,
        },
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
          showWalletUIs: false,
        },
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
      }}
    >
      <PrivyWalletBridge>{children}</PrivyWalletBridge>
    </PrivyProvider>
  );
}
