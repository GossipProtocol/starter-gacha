import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t-[3px] border-ink bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="leading-[0.85]">
          <span className="block text-sm font-bold uppercase">Thrifting Machine</span>
          <span className="block font-mono text-[10px] uppercase tracking-wide text-ink-soft">Real vintage stock · pull · ship · sell back</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
          <Link href="/" className="hover:text-ink">Machine</Link>
          <Link href="/vault" className="hover:text-ink">Vault</Link>
          <Link href="/marketplace" className="hover:text-ink">Market</Link>
          <span className="text-ink-soft/70">Mock demo · house odds live in config</span>
        </div>
      </div>
    </footer>
  );
}
