'use client';

/* ─────────────────────────────────────────────────────────────────────────
   THRIFT MACHINE — "Add funds" via Coinbase Onramp.

   Drop-in replacement for FundModal. With a real (Privy) wallet it opens
   Coinbase Onramp so the player buys USDC straight into their Solana wallet.
   In demo mode (no Privy) it falls back to the instant mock credit so the
   machine stays fully usable with zero setup. See ONCHAIN_SPEC §5.
   ───────────────────────────────────────────────────────────────────────── */

import { useState } from 'react';
import { machine } from '@/lib/machine';
import { openOnramp } from '@/lib/coinbase';
import { useWallet } from '@/lib/wallet';
import { FUND_PRESETS } from '@/lib/config';
import { usd } from '@/lib/format';

export default function CoinbaseOnramp({
  open, onClose, wallet,
}: { open: boolean; onClose: () => void; wallet: string | null }) {
  const { isPrivy } = useWallet();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  async function add(amount: number) {
    if (!wallet) return;
    setBusy(amount); setError(null);
    try {
      if (isPrivy) {
        // Real funding: Coinbase Onramp → USDC to the player's Solana wallet.
        await openOnramp({ address: wallet, presetFiatAmount: amount, redirectUrl: window.location.href });
        onClose();
      } else {
        // Demo mode: instant mock credit.
        await machine.addFunds(wallet, amount);
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="anim-scrim fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" onClick={onClose}>
      <div
        className="anim-pop w-full max-w-md rounded-2xl border-[4px] border-ink bg-surface p-6 shadow-hard-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold uppercase leading-none">Add funds</h2>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              {isPrivy ? 'USDC · Coinbase · Solana' : 'Mock USDC · settles instantly'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="press rounded-lg border-[2px] border-ink px-2 py-0.5 text-lg font-bold shadow-hard-sm">×</button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {FUND_PRESETS.map((amt) => (
            <button
              key={amt}
              disabled={busy !== null}
              onClick={() => add(amt)}
              className="press rounded-xl border-[3px] border-ink bg-lime py-4 text-xl font-bold shadow-hard"
            >
              {busy === amt ? '…' : `+ ${usd(amt)}`}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-red-700">{error}</p>
        )}

        <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-soft">
          {isPrivy
            ? 'Buy USDC with card or bank in the Coinbase window. It lands in your wallet on Solana, then the lever is live.'
            : 'Demo mode. The real version opens Coinbase Onramp to buy USDC on Solana.'}
        </p>
      </div>
    </div>
  );
}
