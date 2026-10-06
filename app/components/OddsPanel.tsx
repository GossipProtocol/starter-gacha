'use client';

import { machine } from '@/lib/machine';
import { RARITY_META } from '@/lib/config';
import { pctLabel } from '@/lib/format';
import type { Tier } from '@/lib/types';

export default function OddsPanel({ tier }: { tier: Tier }) {
  const odds = machine.getOdds(tier).slice().reverse(); // grail first

  return (
    <div className="rounded-2xl border-[3px] border-ink bg-surface p-4 shadow-hard">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide">Each pull contains</h3>
        <span className="font-mono text-[10px] uppercase text-ink-soft">odds · value</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {odds.map((row) => (
          <li key={row.rarity} className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] border-[2px] border-ink" style={{ backgroundColor: RARITY_META[row.rarity].color }} />
            <span className="w-20 text-[13px] font-bold uppercase">{RARITY_META[row.rarity].label}</span>
            <span className="w-14 text-right font-mono text-[12px] tabular-nums">{pctLabel(row.chancePct)}</span>
            <span className="flex-1 text-right font-mono text-[11px] text-ink-soft">{row.rangeLabel}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-soft">
        Odds &amp; value bands set by the house in config. RNG runs server-side.
      </p>
    </div>
  );
}
