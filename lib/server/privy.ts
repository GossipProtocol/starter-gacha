/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY Privy auth.

   Every route that moves money identifies the player from a verified Privy
   access token, never from a wallet address in the request body. The client
   sends `Authorization: Bearer <token>` (usePrivy().getAccessToken()). The
   server verifies it, loads the user from Privy, and takes the Solana wallet
   address from the user's linked accounts.

   Returns `null` when the token is missing or invalid (route answers 401)
   and throws when the server is not configured (route answers 500).

   Sandbox (GACHA_SANDBOX=1): the bearer token is `sandbox:<any wallet
   string>` and the player is that string. No Privy call is made. This is
   how a storefront is built against the demo API before Privy exists.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import { PrivyClient } from '@privy-io/node';
import { isSandbox } from './db';

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
const appSecret = process.env.PRIVY_APP_SECRET ?? '';

let client: PrivyClient | null = null;

export function privyClient(): PrivyClient {
  if (!appId || !appSecret) {
    throw new Error('Privy server auth not configured: set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET');
  }
  return (client ??= new PrivyClient({ appId, appSecret }));
}

export interface Player {
  /** Privy DID, e.g. did:privy:... */
  did: string;
  /** The player's Solana address, taken from Privy, not from the client. */
  wallet: string;
}

type LinkedAccount = { type?: string; chain_type?: string; chainType?: string; address?: string };

/** Verify the bearer token and resolve the player's Solana wallet. */
export async function requirePlayer(req: Request): Promise<Player | null> {
  const header = req.headers.get('authorization');
  const token = header?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  if (isSandbox()) {
    const m = /^sandbox:([A-Za-z0-9_-]{3,64})$/.exec(token);
    return m ? { did: `did:sandbox:${m[1]}`, wallet: m[1] } : null;
  }

  const privy = privyClient();
  let did: string;
  try {
    // @privy-io/node 0.35: takes the raw token and returns { user_id, ... }.
    // Pin your SDK version; older guides show an object argument and `userId`.
    const claims = await privy.utils().auth().verifyAccessToken(token);
    did = claims.user_id;
  } catch {
    return null;
  }
  if (!did) return null;

  const user = await privy.users()._get(did);
  const accounts = (user as { linked_accounts?: LinkedAccount[] }).linked_accounts ?? [];
  const solana = accounts.find(
    (a) => a.type === 'wallet' && (a.chain_type ?? a.chainType) === 'solana' && a.address
  );
  if (!solana?.address) return null;

  return { did, wallet: solana.address };
}
