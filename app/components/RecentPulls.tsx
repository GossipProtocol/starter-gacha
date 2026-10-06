'use client';

import { machine } from '@/lib/machine';
import { RARITY_META } from '@/lib/config';
import { useMounted, useStoreTick } from '@/lib/store';
import { timeAgo, usd } from '@/lib/format';

export default function RecentPulls() {
  const mounted = useMounted();
  useStoreTick();
  const events = mounted ? machine.getRecentPulls() : [];

  return (
    <div className="rounded-2xl border-[3px] border-ink bg-surface shadow-hard">
      <div className="flex items-center justify-between border-b-[2px] border-ink px-4 py-2.5">
        <h3 className="text-sm font-bold uppercase tracking-wide">Recent pulls</h3>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-ink-soft">
          <span className="h-2 w-2 rounded-full bg-lime ring-[2px] ring-ink" /> live
        </span>
      </div>
      <ul className="max-h-[320px] overflow-y-auto no-sb">
        {events.length === 0 && (
          <li className="px-4 py-6 text-center font-mono text-[11px] uppercase text-ink-soft">Warming up the machine…</li>
        )}
        {events.map((ev) => (
          <li key={ev.id} className="flex items-center gap-3 border-b-[1px] border-ink/10 px-4 py-2.5 last:border-0">
            <span className="h-3 w-3 shrink-0 rounded-[3px] border-[2px] border-ink" style={{ backgroundColor: RARITY_META[ev.rarity].color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight">{ev.teeName}</p>
              <p className="font-mono text-[10px] uppercase text-ink-soft">{ev.walletShort} · {timeAgo(ev.at)}</p>
            </div>
            <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums">{usd(ev.estValue)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
