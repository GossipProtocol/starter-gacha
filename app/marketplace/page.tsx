'use client';

import { useState } from 'react';
import { machine } from '@/lib/machine';
import { useMounted, useStoreTick } from '@/lib/store';
import { CATEGORY_META, CATEGORY_ORDER, RARITIES, RARITY_META, SIZES } from '@/lib/config';
import type { Category, Rarity, Size, Tee } from '@/lib/types';
import TeeCard from '../components/TeeCard';

type CatF = Category | 'all';
type SizeF = Size | 'all';
type RarF = Rarity | 'all';

function FilterRow<T extends string>({
  label, options, value, onChange, render,
}: { label: string; options: T[]; value: T; onChange: (v: T) => void; render: (v: T) => string }) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`press rounded-lg border-[2.5px] border-ink px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide ${
              value === o ? 'bg-ink text-paper' : 'bg-surface hover:bg-paper'
            }`}
          >
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function statusNote(t: Tee): { note?: string; dim?: boolean } {
  if (t.status === 'shipped') return { note: 'Sold', dim: true };
  if (t.status === 'reserved') return { note: 'In play', dim: true };
  return {};
}

export default function MarketplacePage() {
  const mounted = useMounted();
  useStoreTick();
  const [cat, setCat] = useState<CatF>('all');
  const [size, setSize] = useState<SizeF>('all');
  const [rar, setRar] = useState<RarF>('all');

  const pool = mounted ? machine.getPool() : [];
  const filtered = pool.filter((t) =>
    (cat === 'all' || t.category === cat) &&
    (size === 'all' || t.size === size) &&
    (rar === 'all' || t.rarity === rar)
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-5xl font-bold uppercase leading-none tracking-tighter sm:text-6xl">The Pool</h1>
        <span className="mb-1 font-mono text-[12px] uppercase text-ink-soft">{mounted ? `${filtered.length} pieces` : '…'} · house stock</span>
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border-[3px] border-ink bg-surface p-4 shadow-hard-sm">
        <FilterRow<CatF>
          label="Crate" value={cat} onChange={setCat}
          options={['all', ...CATEGORY_ORDER]}
          render={(o) => (o === 'all' ? 'All' : CATEGORY_META[o].label)}
        />
        <FilterRow<SizeF>
          label="Size" value={size} onChange={setSize}
          options={['all', ...SIZES]}
          render={(o) => (o === 'all' ? 'All' : o)}
        />
        <FilterRow<RarF>
          label="Rarity" value={rar} onChange={setRar}
          options={['all', ...RARITIES]}
          render={(o) => (o === 'all' ? 'All' : RARITY_META[o].label)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((t) => {
          const s = statusNote(t);
          return <TeeCard key={t.id} tee={t} statusNote={s.note} dim={s.dim} />;
        })}
      </div>

      {mounted && filtered.length === 0 && (
        <p className="mt-12 text-center font-mono text-[12px] uppercase text-ink-soft">No pieces match those filters.</p>
      )}
    </div>
  );
}
