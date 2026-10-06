'use client';

import { useState } from 'react';
import Link from 'next/link';
import { machine } from '@/lib/machine';
import { useWallet } from '@/lib/wallet';
import { useMounted, useStoreTick } from '@/lib/store';
import { usd } from '@/lib/format';
import TeeCard from '../components/TeeCard';

function Stat({ label, value, tone = 'surface' }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`rounded-2xl border-[3px] border-ink p-4 shadow-hard-sm ${tone}`}>
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums leading-none sm:text-3xl">{value}</div>
    </div>
  );
}

export default function VaultPage() {
  const { connected, address, login } = useWallet();
  const mounted = useMounted();
  useStoreTick();
  const [busy, setBusy] = useState<string | null>(null);

  if (mounted && !connected) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-4xl font-bold uppercase leading-none">My Vault</h1>
        <p className="mt-3 font-mono text-[12px] uppercase text-ink-soft">Connect to see your pulls.</p>
        <button onClick={login} className="press mt-6 rounded-xl border-[3px] border-ink bg-lime px-6 py-3 text-base font-bold uppercase tracking-wide shadow-hard">
          Connect
        </button>
      </div>
    );
  }

  const inv = mounted && address ? machine.getInventory(address) : [];
  const pending = inv.filter((i) => i.pull.decision === 'pending');
  const kept = inv.filter((i) => i.pull.decision === 'shipped');
  const sold = inv.filter((i) => i.pull.decision === 'soldback');
  const keptValue = kept.reduce((s, i) => s + (i.tee?.estValue ?? 0), 0);
  const credit = sold.reduce((s, i) => s + i.pull.buybackValue, 0);

  async function ship(pullId: string) { setBusy(pullId); try { await machine.shipPull(pullId); } finally { setBusy(null); } }
  async function sell(pullId: string) { setBusy(pullId); try { await machine.buyback(pullId); } finally { setBusy(null); } }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <h1 className="text-5xl font-bold uppercase leading-none tracking-tighter sm:text-6xl">My Vault</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pulls" value={String(inv.length)} />
        <Stat label="Kept" value={String(kept.length)} tone="bg-lime" />
        <Stat label="Kept value" value={usd(keptValue)} />
        <Stat label="Credit earned" value={usd(credit)} tone="bg-pink" />
      </div>

      {mounted && inv.length === 0 && (
        <div className="mt-10 rounded-2xl border-[3px] border-dashed border-ink/40 p-10 text-center">
          <p className="font-mono text-[12px] uppercase text-ink-soft">No pulls yet.</p>
          <Link href="/" className="press mt-4 inline-block rounded-xl border-[3px] border-ink bg-pink px-5 py-2.5 text-sm font-bold uppercase tracking-wide shadow-hard">
            Go to the machine
          </Link>
        </div>
      )}

      {pending.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold uppercase">Pending · decide</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((i) => i.tee && (
              <TeeCard key={i.pull.id} tee={i.tee} buyback={i.pull.buybackValue}>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busy === i.pull.id} onClick={() => ship(i.pull.id)} className="press rounded-xl border-[3px] border-ink bg-ink py-2.5 text-sm font-bold uppercase tracking-wide text-lime shadow-hard-sm">Ship it</button>
                  <button disabled={busy === i.pull.id} onClick={() => sell(i.pull.id)} className="press rounded-xl border-[3px] border-ink bg-lime py-2.5 text-sm font-bold uppercase tracking-wide shadow-hard-sm">Sell {usd(i.pull.buybackValue)}</button>
                </div>
              </TeeCard>
            ))}
          </div>
        </section>
      )}

      {kept.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold uppercase">Kept · shipping</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {kept.map((i) => i.tee && (
              <TeeCard key={i.pull.id} tee={i.tee} statusNote="Shipping" />
            ))}
          </div>
        </section>
      )}

      {sold.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold uppercase text-ink-soft">Sold back</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sold.map((i) => i.tee && (
              <TeeCard key={i.pull.id} tee={i.tee} dim statusNote={`Sold · +${usd(i.pull.buybackValue)}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
