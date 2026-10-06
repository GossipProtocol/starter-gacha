/* ─────────────────────────────────────────────────────────────────────────
   THRIFT MACHINE — Coinbase Onramp client helper.

   Funds the player's own Solana wallet with USDC via Coinbase Onramp (fiat →
   USDC, card / bank / Coinbase balance). This is the "Add funds" primitive;
   buyback later lands USDC back in this same wallet. See ONCHAIN_SPEC §5.
   ───────────────────────────────────────────────────────────────────────── */

const ONRAMP_BASE = 'https://pay.coinbase.com/buy';

/** Get a fresh single-use session token from our server (5-min expiry). */
async function getSessionToken(address: string): Promise<string> {
  const res = await fetch('/api/onramp-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || 'Onramp token failed');
  const { sessionToken } = await res.json();
  if (!sessionToken) throw new Error('No session token returned');
  return sessionToken;
}

/** Build the Onramp URL for USDC-on-Solana, initialized with the session token. */
export async function buildOnrampUrl(args: {
  address: string;
  presetFiatAmount?: number; // e.g. one of FUND_PRESETS
  redirectUrl?: string;
}): Promise<string> {
  const sessionToken = await getSessionToken(args.address);
  const params = new URLSearchParams({
    sessionToken,
    defaultNetwork: 'solana',
    defaultAsset: 'USDC',
  });
  if (args.presetFiatAmount) params.set('presetFiatAmount', String(args.presetFiatAmount));
  if (args.redirectUrl) params.set('redirectUrl', args.redirectUrl);
  return `${ONRAMP_BASE}?${params.toString()}`;
}

/** Open Onramp in a centered popup; falls back to a new tab. */
export async function openOnramp(args: {
  address: string; presetFiatAmount?: number; redirectUrl?: string;
}): Promise<void> {
  const url = await buildOnrampUrl(args);
  const w = 470, h = 720;
  const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
  const popup = window.open(url, 'coinbase-onramp', `popup,width=${w},height=${h},left=${left},top=${top}`);
  if (!popup) window.location.assign(url);
}
