'use client';

import { useState } from 'react';
import { machine } from '@/lib/machine';
import { FUND_PRESETS } from '@/lib/config';
import { usd } from '@/lib/format';

export default function FundModal({
  open, onClose, wallet,
}: { open: boolean; onClose: () => void; wallet: string | null }) {
  const [busy, setBusy] = useState<number | null>(null);
  if (!open) return null;

  async function add(amount: number) {
    if (!wallet) return;
    setBusy(amount);
    try { await machine.addFunds(wallet, amount); onClose(); }
    finally { setBusy(null); }
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
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Mock USDC · settles instantly</p>
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
        <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-soft">
          Real version settles a USDC deposit on Solana before crediting your balance.
        </p>
      </div>
    </div>
  );
}
