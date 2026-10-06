export function usd(n: number, opts?: { cents?: boolean }): string {
  const showCents = opts?.cents ?? !Number.isInteger(n);
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

export function shortWallet(addr: string | null | undefined): string {
  if (!addr) return '…';
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function pctLabel(n: number): string {
  if (n >= 1) return `${Number.isInteger(n) ? n : Number(n.toFixed(1))}%`;
  return `${Number(n.toFixed(2))}%`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
