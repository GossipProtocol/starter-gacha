'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWallet } from '@/lib/wallet';
import { machine } from '@/lib/machine';
import { useMounted, useStoreTick } from '@/lib/store';
import { usd, shortWallet } from '@/lib/format';
import FundModal from './CoinbaseOnramp';

const NAV = [
  { href: '/', label: 'Machine' },
  { href: '/vault', label: 'Vault' },
  { href: '/marketplace', label: 'Market' },
];

export default function Header() {
  const { connected, address, login, logout, ready } = useWallet();
  const mounted = useMounted();
  useStoreTick();
  const pathname = usePathname();
  const [fundOpen, setFundOpen] = useState(false);

  // The brand mark lives in the hero on the home page. Keep it out of the nav
  // until the hero logo scrolls away, then fade it in (and always show it on
  // pages that have no hero logo).
  const [logoVisible, setLogoVisible] = useState(false);
  useEffect(() => {
    const hero = document.getElementById('hero-logo');
    if (!hero) { setLogoVisible(true); return; }
    setLogoVisible(false);
    const obs = new IntersectionObserver(
      ([entry]) => setLogoVisible(!entry.isIntersecting),
      { rootMargin: '-56px 0px 0px 0px' }
    );
    obs.observe(hero);
    return () => obs.disconnect();
  }, [pathname]);

  const balance = mounted && address ? machine.getBalance(address) : 0;
  const showConnected = mounted && ready && connected && address;

  return (
    <>
      <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            aria-label="THRIFTING MACHINE home"
            className={`group flex items-center gap-2 transition-all duration-300 ${
              logoVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
            }`}
          >
            <span className="leading-[0.82] tracking-tight">
              <span className="block text-[15px] font-bold uppercase sm:text-[17px]">Thrifting</span>
              <span className="block text-[15px] font-bold uppercase sm:text-[17px]">Machine</span>
            </span>
            <span className="hidden rotate-3 rounded-md border-[2px] border-ink bg-lime px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase shadow-hard-sm sm:inline-block">
              Vintage<br />Tees
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-lg border-[2px] px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-colors ${
                    active ? 'border-ink bg-ink text-paper' : 'border-transparent hover:border-ink'
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {showConnected ? (
              <>
                <button
                  onClick={() => setFundOpen(true)}
                  className="press flex items-center gap-2 rounded-lg border-[2.5px] border-ink bg-surface px-3 py-1.5 shadow-hard-sm"
                  title="Add funds"
                >
                  <span className="font-mono text-[10px] uppercase text-ink-soft">USDC</span>
                  <span className="text-sm font-bold tabular-nums">{usd(balance)}</span>
                  <span className="text-base font-bold text-ink-soft">＋</span>
                </button>
                <button
                  onClick={logout}
                  className="hidden rounded-lg border-[2.5px] border-ink bg-pink px-2.5 py-1.5 font-mono text-[11px] font-bold shadow-hard-sm sm:block"
                  title="Disconnect"
                >
                  {shortWallet(address)}
                </button>
              </>
            ) : (
              <button
                onClick={login}
                disabled={mounted && !ready}
                className="press rounded-lg border-[3px] border-ink bg-lime px-4 py-1.5 text-sm font-bold uppercase tracking-wide shadow-hard"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t-[2px] border-ink/15 px-4 py-2 md:hidden no-sb">
          {NAV.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap rounded-lg border-[2px] px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                  active ? 'border-ink bg-ink text-paper' : 'border-ink/30'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <FundModal open={fundOpen} onClose={() => setFundOpen(false)} wallet={address} />
    </>
  );
}
