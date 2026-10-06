'use client';

import { useState } from 'react';
import { machine } from '@/lib/machine';
import { usd } from '@/lib/format';
import type { Decision, OpenResult } from '@/lib/types';
import TeeCard from './TeeCard';
import Confetti from './Confetti';

export default function RevealOverlay({
  results, onClose,
}: { results: OpenResult[]; onClose: () => void }) {
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const hasBig = results.some((r) => r.tee.rarity === 'epic' || r.tee.rarity === 'grail');
  const totalEst = results.reduce((s, r) => s + r.tee.estValue, 0);
  const single = results.length === 1;

  async function ship(pullId: string) {
    setBusy(pullId);
    try { await machine.shipPull(pullId); setDecided((d) => ({ ...d, [pullId]: 'shipped' })); }
    finally { setBusy(null); }
  }
  async function sell(pullId: string) {
    setBusy(pullId);
    try { await machine.buyback(pullId); setDecided((d) => ({ ...d, [pullId]: 'soldback' })); }
    finally { setBusy(null); }
  }

  return (
    <div className="anim-scrim fixed inset-0 z-50 overflow-y-auto bg-ink/70 px-4 py-8">
      {hasBig && <Confetti />}
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-lime">The machine dropped</p>
            <h2 className="text-3xl font-bold uppercase leading-none text-paper sm:text-4xl">
              {results.length} {results.length === 1 ? 'pull' : 'pulls'}
            </h2>
            <p className="mt-1 font-mono text-[12px] uppercase text-paper/70">Total est. value {usd(totalEst)}</p>
          </div>
          <button
            onClick={onClose}
            className="press rounded-xl border-[3px] border-paper bg-paper px-5 py-2 text-sm font-bold uppercase tracking-wide shadow-[5px_5px_0_#C2F032]"
          >
            Done
          </button>
        </div>

        <div className={`grid gap-5 ${single ? 'mx-auto max-w-sm grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
          {results.map((r, i) => {
            const dec = decided[r.pull.id];
            const isGrail = r.tee.rarity === 'grail';
            return (
              <div key={r.pull.id} className="anim-drop" style={{ animationDelay: `${i * 0.12}s` }}>
                <TeeCard
                  tee={r.tee}
                  buyback={r.pull.buybackValue}
                  className={isGrail ? 'grail-glow' : ''}
                >
                  {dec === 'shipped' ? (
                    <div className="rounded-xl border-[3px] border-ink bg-lime py-2.5 text-center text-sm font-bold uppercase tracking-wide">
                      Keeping it · shipping ✓
                    </div>
                  ) : dec === 'soldback' ? (
                    <div className="rounded-xl border-[3px] border-ink bg-pink py-2.5 text-center text-sm font-bold uppercase tracking-wide">
                      Sold back · +{usd(r.pull.buybackValue)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={busy === r.pull.id}
                        onClick={() => ship(r.pull.id)}
                        className="press rounded-xl border-[3px] border-ink bg-ink py-2.5 text-sm font-bold uppercase tracking-wide text-lime shadow-hard-sm"
                      >
                        Ship it
                      </button>
                      <button
                        disabled={busy === r.pull.id}
                        onClick={() => sell(r.pull.id)}
                        className="press rounded-xl border-[3px] border-ink bg-lime py-2.5 text-sm font-bold uppercase tracking-wide shadow-hard-sm"
                      >
                        Sell {usd(r.pull.buybackValue)}
                      </button>
                    </div>
                  )}
                </TeeCard>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-6 max-w-md text-center font-mono text-[11px] leading-relaxed text-paper/60">
          Undecided pieces stay reserved in your Vault. Decide later. Sold-back pieces return to the pool and your credit funds the next pull.
        </p>
      </div>
    </div>
  );
}
