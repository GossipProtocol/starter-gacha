'use client';

import { machine } from '@/lib/machine';
import { useMounted, useStoreTick } from '@/lib/store';
import { usd } from '@/lib/format';
import TeeCard from './TeeCard';

/* The "loaded in the machine" showcase: every piece currently in the vault,
   tagged PULL TO GET with its retail value. Reacts live: pulled/shipped
   pieces leave, sold-back pieces drop back in. Clicking a card jumps to the
   machine. */
export default function LoadedInMachine() {
  const mounted = useMounted();
  useStoreTick();

  const loaded = (mounted ? machine.getPool() : [])
    .filter((t) => t.status === 'available')
    .sort((a, b) => b.estValue - a.estValue);
  const totalValue = loaded.reduce((s, t) => s + t.estValue, 0);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-3xl font-bold uppercase leading-none tracking-tighter sm:text-4xl">Loaded in the machine</h2>
        <span className="mb-1 rounded-lg border-[2.5px] border-ink bg-surface px-2.5 py-1 font-mono text-[11px] font-bold uppercase shadow-hard-sm">
          {mounted ? `${loaded.length} loaded · ${usd(totalValue)} in vault` : '…'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {loaded.map((t) => (
          <a
            key={t.id}
            href="#machine"
            title="Pull the machine to get this"
            className="block transition-transform hover:-translate-y-1"
          >
            <TeeCard tee={t} valueLabel="Retail" statusNote="Pull to get" />
          </a>
        ))}
      </div>

      {mounted && loaded.length === 0 && (
        <p className="rounded-2xl border-[3px] border-dashed border-ink/40 p-10 text-center font-mono text-[12px] uppercase text-ink-soft">
          The machine is empty right now. Sold-back pieces drop back in here.
        </p>
      )}
    </section>
  );
}
