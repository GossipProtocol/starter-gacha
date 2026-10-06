'use client';

import { useState } from 'react';
import { machine, MachineError } from '@/lib/machine';
import {
  CATEGORY_META, CATEGORY_ORDER, SIZES, TIER_META, TIER_ORDER,
} from '@/lib/config';
import { useWallet } from '@/lib/wallet';
import { useMounted, useStoreTick } from '@/lib/store';
import { usd } from '@/lib/format';
import type { Category, OpenResult, Size, Tier } from '@/lib/types';
import OddsPanel from './OddsPanel';
import RecentPulls from './RecentPulls';
import RevealOverlay from './RevealOverlay';
import FundModal from './CoinbaseOnramp';

function Seg({
  active, onClick, children, className = '',
}: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`press rounded-lg border-[2.5px] border-ink px-2 py-1.5 text-[13px] font-bold uppercase leading-tight tracking-wide ${
        active ? 'bg-ink text-paper shadow-hard-sm' : 'bg-surface hover:bg-paper'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* Placeholder for the vending-machine product image. Swap for a real render. */
function MachinePlaceholder() {
  return (
    <div className="halftone relative flex h-[140px] items-center justify-center border-b-[3px] border-ink bg-lime">
      <svg viewBox="0 0 80 116" className="h-[112px]" role="img" aria-label="Vending machine image placeholder">
        <rect x="6" y="3" width="68" height="110" rx="8" fill="#F5F5F2" stroke="#0C0C0C" strokeWidth="4" />
        <rect x="13" y="10" width="40" height="64" rx="4" fill="#FFFFFF" stroke="#0C0C0C" strokeWidth="3" />
        <g fill="#0C0C0C">
          <rect x="17" y="14" width="13" height="13" rx="2" /><rect x="36" y="14" width="13" height="13" rx="2" />
          <rect x="17" y="31" width="13" height="13" rx="2" /><rect x="36" y="31" width="13" height="13" rx="2" />
          <rect x="17" y="48" width="13" height="13" rx="2" /><rect x="36" y="48" width="13" height="13" rx="2" />
        </g>
        <g fill="#0C0C0C"><circle cx="63" cy="16" r="3" /><circle cx="63" cy="26" r="3" /><circle cx="63" cy="36" r="3" /></g>
        <rect x="13" y="82" width="40" height="7" rx="2" fill="#C2F032" stroke="#0C0C0C" strokeWidth="3" />
        <rect x="13" y="95" width="54" height="12" rx="3" fill="#FFB3D9" stroke="#0C0C0C" strokeWidth="3" />
      </svg>
      <span className="absolute left-2 top-2 rounded-md border-[2px] border-ink bg-paper px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">The Machine</span>
      <span className="absolute bottom-2 right-2 rounded-md border-[2px] border-ink bg-paper px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">Image</span>
    </div>
  );
}

const LABEL = 'mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft';

export default function MachineConsole() {
  const { connected, address, login, ready } = useWallet();
  const mounted = useMounted();
  useStoreTick();

  const [category, setCategory] = useState<Category>('surprise');
  const [tier, setTier] = useState<Tier>('standard');
  const [size, setSize] = useState<Size>('L');
  const count = 1; // singular pulls only
  const [pulling, setPulling] = useState(false);
  const [results, setResults] = useState<OpenResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundOpen, setFundOpen] = useState(false);

  const unit = TIER_META[tier].price;
  const stockAvail = mounted ? machine.getStock({ category, size }).available : null;
  const balance = mounted && address ? machine.getBalance(address) : 0;
  const outOfStock = stockAvail !== null && stockAvail < count;

  async function pull() {
    if (!address) return;
    setPulling(true);
    setError(null);
    try {
      const intent = await machine.generatePull(address, { category, tier, size, count });
      await machine.submitPull(intent);
      const opened = await Promise.all(intent.memos.map((m) => machine.openPull(m)));
      setResults(opened);
    } catch (e) {
      const msg = e instanceof MachineError ? e.message : 'Something jammed. Try again.';
      setError(msg);
      if (/usdc|funds/i.test(msg)) setFundOpen(true);
    } finally {
      setPulling(false);
    }
  }

  function onPullClick() {
    if (!connected) { login(); return; }
    pull();
  }

  const pullLabel = !mounted || !ready
    ? '…'
    : !connected
      ? 'Connect to pull'
      : pulling
        ? 'Dropping…'
        : `Pull · ${usd(unit)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border-[4px] border-ink bg-surface shadow-hard">
        <MachinePlaceholder />

        <div className="flex flex-col gap-3 p-4">
          {/* Crate */}
          <div>
            <label className={LABEL}>Crate</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_ORDER.map((c) => (
                <Seg key={c} active={category === c} onClick={() => setCategory(c)} className="!text-[12px] text-center">
                  {CATEGORY_META[c].label}
                </Seg>
              ))}
            </div>
          </div>

          {/* Tier */}
          <div>
            <label className={LABEL}>Tier</label>
            <div className="grid grid-cols-3 gap-2">
              {TIER_ORDER.map((tr) => (
                <button
                  key={tr}
                  onClick={() => setTier(tr)}
                  className={`press flex flex-col items-center rounded-lg border-[2.5px] border-ink px-1 py-1.5 ${
                    tier === tr ? 'bg-lime shadow-hard-sm' : 'bg-surface hover:bg-paper'
                  }`}
                >
                  <span className="text-[12px] font-bold uppercase leading-tight">{TIER_META[tr].label}</span>
                  <span className="font-mono text-[12px] font-bold tabular-nums">{usd(TIER_META[tr].price)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div>
            <label className={LABEL}>Your size</label>
            <div className="grid grid-cols-5 gap-2">
              {SIZES.map((s) => (
                <Seg key={s} active={size === s} onClick={() => setSize(s)} className="!px-0 text-center">{s}</Seg>
              ))}
            </div>
          </div>

          {/* Stock + balance */}
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wide">
            <span className={outOfStock ? 'font-bold text-[#9E3B36]' : 'text-ink-soft'}>
              {stockAvail === null ? '…' : `${stockAvail} in ${size} available`}
            </span>
            {mounted && connected && <span className="text-ink-soft">Balance {usd(balance)}</span>}
          </div>

          {/* PULL */}
          <div>
            <button
              onClick={onPullClick}
              disabled={(mounted && connected && (pulling || outOfStock)) || (mounted && !ready)}
              className="press w-full rounded-xl border-[4px] border-ink bg-pink py-4 text-xl font-bold uppercase tracking-wide shadow-hard-lg"
            >
              {outOfStock && connected && mounted ? `Out of ${size} stock` : pullLabel}
            </button>
            {error && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border-[3px] border-ink bg-pink/60 px-3 py-2 text-[12px] font-bold uppercase">
                <span>{error}</span>
                {/usdc|funds/i.test(error) && (
                  <button onClick={() => setFundOpen(true)} className="press shrink-0 rounded-lg border-[2.5px] border-ink bg-lime px-2 py-1 text-[11px] shadow-hard-sm">Add funds</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <OddsPanel tier={tier} />
      <RecentPulls />

      {results && <RevealOverlay results={results} onClose={() => setResults(null)} />}
      <FundModal open={fundOpen} onClose={() => setFundOpen(false)} wallet={address} />
    </div>
  );
}
