import { NextRequest, NextResponse } from 'next/server';
import { generateJwt } from '@coinbase/cdp-sdk/auth';

export const runtime = 'nodejs';

/**
 * Mint a single-use Coinbase Onramp session token for the player's wallet.
 * Token expires in 5 min and is required to open the Onramp URL (mandatory
 * since 2025-07-31). CDP API key + secret stay server-side only.
 *
 * Docs: https://docs.cdp.coinbase.com/api-reference/rest-api/onramp-offramp/create-session-token
 */
const HOST = 'api.developer.coinbase.com';
const PATH = '/onramp/v1/token';

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!address) {
      return NextResponse.json({ error: 'address required' }, { status: 400 });
    }

    // JWT auth for the CDP REST call.
    const jwt = await generateJwt({
      apiKeyId: process.env.CDP_API_KEY_ID!,
      apiKeySecret: process.env.CDP_API_KEY_SECRET!,
      requestMethod: 'POST',
      requestHost: HOST,
      requestPath: PATH,
      expiresIn: 120,
    });

    const res = await fetch(`https://${HOST}${PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Deliver USDC to this Solana address.
        addresses: [{ address, blockchains: ['solana'] }],
        assets: ['USDC'],
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      return NextResponse.json({ error: `Coinbase token error: ${msg}` }, { status: 502 });
    }
    const data = await res.json();
    // Response shape: { token, channelId? } — token is the sessionToken.
    return NextResponse.json({ sessionToken: data.token ?? data.sessionToken });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
