---
name: gacha-storefront
description: Build a storefront on the starter-gacha API end to end: read a machine's published odds, quote a pull, sign and settle it, reveal the slots, sell back or ship, and verify webhooks. Use when an agent is asked to build a client, a storefront, a bot or an integration against a gacha machine served by this API, in sandbox mode or live.
---

# Build a storefront on the gacha API

The API behind this repo serves gacha machines. A storefront is any client that
talks to it: the Next.js app in this repo, a Telegram bot, a kiosk, another
website. This skill is the whole contract. The exact schemas are in
`openapi.yaml` at the repo root; read it when a field is in doubt.

## What the API guarantees, so the storefront does not have to

- The server prices every pull from the machine record. The client never sends an amount.
- The server identifies the player from the bearer token. The client never sends a wallet address.
- The odds the machine publishes (`GET /machines/:id`) are the odds it rolls with. Both read the same record.
- The roll runs on the server after payment is confirmed. There is nothing to roll client-side.
- A buyback pays the value frozen at roll time, at most once per slot, enforced on chain.
- Every pull pays 1% of the pull price to the course wallet inside the pull transaction. The player pays the listed price once.

## Base URL and modes

- Same origin from the repo's own app: `/api/v1`.
- A hosted machine: `https://<host>/api/v1`.
- Sandbox: run this repo with `GACHA_SANDBOX=1 bun run build && GACHA_SANDBOX=1 bun start` and use `http://localhost:3000/api/v1`. The sandbox serves the default machine from `lib/config.ts` and the seed pool from memory, with no chain, no database and no Privy. Every route, rule and error code is identical to live; only the signing step is a no-op.

## Auth

Player routes take `Authorization: Bearer <token>`.

- Live: the Privy access token from `usePrivy().getAccessToken()`. The server resolves the player's Solana wallet from Privy's linked accounts.
- Sandbox: `sandbox:<wallet>` where `<wallet>` is any 3 to 64 character string (letters, digits, `_`, `-`). The server treats that string as the wallet.

Operator routes take `x-api-key: <key>`.

- Live: the key printed once by `bun scripts/seed-machine.ts`. The server stores only its sha256.
- Sandbox: `gk_sandbox_operator`, or whatever `GACHA_SANDBOX_OPERATOR_KEY` is set to.

## The pull sequence

1. `GET /machines/default` (no auth). Render the tiers with `priceUsdc`, the `odds` rows (`chancePct` per rarity sums to 100 per tier), the `buyback` percentages, `pool.availableByRarity`, and both strings under `rules`. Show the odds from this response and nowhere else.

2. `POST /pulls` with `{ "machineId": "default", "tier": "standard", "count": 1, "category": "surprise", "size": "L" }`. The response is a `Pull` with `status: "quoted"`, `totalUsdc`, and `unsignedTxB64`. Status 201.

3. Sign. Live: deserialize `unsignedTxB64` with `@solana/web3.js` `Transaction.from(Buffer.from(b64, 'base64'))`, sign with the player's embedded wallet (Privy's Solana `signTransaction`), re-serialize with `{ requireAllSignatures: false, verifySignatures: false }` to base64. The relayer is the fee payer; the player holds no SOL. Sandbox: send `unsignedTxB64` back unchanged.

4. `POST /pulls/{id}/settle` with `{ "signedTxB64": "<base64>" }`. The response is the `Pull` with `status: "opened"`, the chain `signature`, and `slots[]`, one per `count`, each with a `piece`, `buybackPct`, `buybackValueUsdc` and `decision: "pending"`. Reveal them in order. If a slot's rarity is higher than the tier's rolled odds suggest, that is the empty-bucket upgrade; say so.

5. Per slot, the player decides once:
   - `POST /pulls/{id}/buyback` with `{ "slot": "<slotId>" }` pays `buybackValueUsdc` to the player's wallet and returns `{ amountUsdc, signature, decision: "soldback" }`.
   - `POST /pulls/{id}/ship` with `{ "slot": "<slotId>" }` keeps it and returns `{ decision: "shipped" }`.
   When the pull has exactly one slot, the body may be `{}`.

6. `GET /pulls/{id}` re-reads the pull at any time (after a reload, to show a vault page). It only answers for the player who owns it.

A minimal client, framework-free, is `lib/onchain.ts` in this repo (`settlePull`, `settleBuyback`, `settleShip`, `getPull`, `getMachine`). Copy it rather than re-deriving the sequence.

## Error codes

Every error is `{ "error": { "code", "message" } }`. Branch on `code`, show `message`.

| code | status | meaning and what the storefront does |
|------|--------|--------------------------------------|
| `unauthorized` | 401 | No or bad token/key. Prompt sign-in. |
| `invalid_request` | 400 | A field is missing or out of range (count 1 to 10, known tier/category/size, slot required on multi-slot pulls). Fix the request. |
| `unknown_machine` | 404 | No such machine id. |
| `machine_paused` | 423 | The machine is not taking pulls. Disable the lever and say so. |
| `unknown_pull` | 404 | No pull with that id for this player (also returned for someone else's pull). |
| `already_settled` | 409 | Settle was already called for this pull. Call `GET /pulls/{id}` to read the slots instead of retrying. |
| `not_settled` | 409 | Buyback or ship on a pull that never paid. |
| `tx_mismatch` | 422 | The signed transaction is not the one the server built (edited amount, swapped destination, extra instruction, wrong fee payer, missing player signature). Start over from `POST /pulls`; never retry with the same bytes. |
| `out_of_stock` | 409 | No piece left for that size and category, even after upgrading rarity. The pull stays paid; tell the player and the operator. Check `pool.availableByRarity` before quoting to avoid this. |
| `already_decided` | 409 | The slot was already shipped or sold back. Re-read the pull. |
| `settlement_unconfigured` | 503 | The server has no chain env and is not in sandbox mode. Operator problem. |
| `internal` | 500 | Anything else. Show the message, log the request id if you have one. |

## Operator routes (for an operator console, not a player storefront)

- `GET /inventory` lists every piece of the key's machine with `status`.
- `POST /inventory` with `{ "pieces": [{ "name", "price", "brand?", "era?", "category?", "size?", "quality?", "images?" }] }` assigns SKUs and derives rarity from `price`. Never send a rarity; it is not a field.
- `POST /webhooks` with `{ "url", "secret" }` registers an endpoint. `GET /webhooks` lists endpoints and the last 50 deliveries with their attempt counts.

## Webhooks

Events: `pull.opened`, `buyback.paid`, `pull.shipped`. Each delivery is a POST with JSON `{ id, event, machineId, createdAt, data }` and headers `x-gacha-event`, `x-gacha-delivery` (dedupe key; retries reuse it) and `x-gacha-signature: t=<unix seconds>,v1=<hex>`. Three attempts with backoff of 1s, 4s and 16s. Answer 2xx fast and do the work after.

Verify on the raw body, before parsing:

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyGachaWebhook(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1 ?? '';
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  if (expected.length !== v1.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
}
```

## Sandbox smoke test

```bash
API=http://localhost:3000/api/v1
curl -s $API/machines/default | jq '.tiers[1].odds'
P=$(curl -s -X POST $API/pulls -H 'authorization: Bearer sandbox:alice' -H 'content-type: application/json' \
  -d '{"machineId":"default","tier":"standard","count":1,"category":"surprise","size":"L"}')
ID=$(echo "$P" | jq -r .id); TX=$(echo "$P" | jq -r .unsignedTxB64)
curl -s -X POST $API/pulls/$ID/settle -H 'authorization: Bearer sandbox:alice' -H 'content-type: application/json' \
  -d "{\"signedTxB64\":\"$TX\"}" | jq '.slots[0] | {piece: .piece.name, rarity: .piece.rarity, buybackValueUsdc}'
curl -s -X POST $API/pulls/$ID/buyback -H 'authorization: Bearer sandbox:alice' -H 'content-type: application/json' -d '{}' | jq
```

## Rules for the agent building the storefront

- Never compute a price, an amount or a buyback value in the client. Display what the API returns.
- Never render odds from a constant. Fetch `GET /machines/:id` and render that.
- Never put the operator key in client code or in a repo. It belongs to the operator's server.
- Treat `tx_mismatch` as a bug in the signing step, not as something to retry.
- Show the empty-bucket rule next to the odds, using the `rules.emptyBucket` string.
