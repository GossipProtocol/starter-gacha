# starter-gacha: a gacha machine and the API behind it

A gacha machine for physical goods, settled in USDC on Solana, and the API that runs it. Players fund a wallet, pull a tier, reveal a piece with published odds, then either ship it or sell it back for an instant USDC payout. Operators load stock, register webhooks and run their machine on their own treasury. This is the Module 4 starter from the course, cut down from a machine that ran with real stock.

The module is built on one comparison: hosted versus own. Half of it builds a storefront on this API in sandbox mode, the way you would build on anyone's hosted gacha API. The other half opens the API's own code, because the routes, the ledger and the vault program in this repo are the API, and the difference between renting one and running one is whether the float is yours.

It runs in three modes:

- **Demo mode** (no env at all): a local mock wallet, a seeded pool in localStorage, rolls in the browser. Everything is clickable in under a minute.
- **Sandbox mode** (`GACHA_SANDBOX=1`): the whole v1 API served from memory, with the default machine from `lib/config.ts` and the seed pool. No chain, no database, no Privy. Player auth is `Bearer sandbox:<wallet>`. This is where a storefront gets built before any key exists.
- **Live mode**: Privy login with an embedded Solana wallet, a Supabase ledger with a `machines` table, a thin Anchor vault program on devnet with a treasury per machine, a gasless relayer, server-side rolls from the machine record, a receipt-guarded buyback, and signed webhooks.

## The fee, stated plainly

Every live pull pays **1% of the pull price** to the course wallet. The player pays exactly the listed price; the house receives 99% and the course wallet receives 1%, as a second USDC transfer inside the same pull transaction. The rate and the recipient live in one file, `lib/course-fee.ts`.

The fee is a default, not a license condition. This code is MIT licensed, so you can change it, but the fee is how the course pays for itself and the rate is small enough that most forks leave it. If you change the recipient or the rate, say so in your README.

## The API

Everything a storefront can do is under `app/api/v1/`. The exact schemas are in `openapi.yaml`, and `SKILL.md` lets a Claude Code agent build a storefront against it end to end.

| Route | Auth | What it does |
|-------|------|--------------|
| `GET /v1/machines/:id` | public | Odds, prices, tiers, buyback percentages and pool depth by rarity, read from the machine record. The same record the roll reads. |
| `POST /v1/pulls` | player | Quote and prepare. Prices from the machine record, records the pull, returns the unsigned payment transaction. Takes no amount, no wallet. |
| `POST /v1/pulls/:id/settle` | player | Verifies the signed transaction instruction by instruction, co-signs as relayer, submits, marks paid once, rolls every slot server-side, reserves a piece per slot, posts `pull.opened`. |
| `POST /v1/pulls/:id/buyback` | player | Pays the slot's frozen buyback value to the player. Owner from the token, amount from the row, once per slot on chain. Posts `buyback.paid`. |
| `POST /v1/pulls/:id/ship` | player | Keeps the slot. Posts `pull.shipped`. |
| `GET /v1/pulls/:id` | player | The pull and its slots, for its owner only. |
| `GET /v1/inventory` | operator | Every piece of the key's machine. |
| `POST /v1/inventory` | operator | Intake. SKUs assigned, rarity derived from price. |
| `GET /v1/webhooks`, `POST /v1/webhooks` | operator | Register a URL and a secret; list endpoints and recent deliveries. |

Player routes take the Privy access token as `Authorization: Bearer`. Operator routes take the machine's API key as `x-api-key`; the key is stored as a sha256 hash in the `machines` table and printed once by `bun scripts/seed-machine.ts`. Webhook deliveries carry `x-gacha-signature: t=<ts>,v1=<HMAC-SHA256 of "ts.body">`, retried three times with backoff and recorded in `webhook_deliveries`; verify with `timingSafeEqual` on the raw body (the snippet is in `SKILL.md`).

The previous unversioned routes (`/api/pull/prepare`, `/api/settle`, `/api/buyback`, `/api/ship`) are gone; `lib/onchain.ts` now calls v1 and there is one implementation. `/api/admin/stock` stays as a password-gated alias over the same inventory code for the back-of-house pages.

## What is in the box

| Area | Where | What it teaches |
|------|-------|-----------------|
| Machines | `docs/schema.sql` (`machines`), `lib/server/machines.ts` | A machine is a row: odds, prices, buyback, treasury seed, operator key hash, status. The API serves the odds it rolls with because both read this row. |
| Default machine | `lib/config.ts`, `scripts/seed-machine.ts` | The first machine's numbers, used to seed the row and to drive the browser demo. The server never reads it directly (`test/odds-source.test.ts`). |
| Economics | `ECONOMICS.md` | How intake pricing sets the house margin, and why that is a knob, not a fact. |
| The API | `app/api/v1/*`, `lib/server/api.ts`, `lib/server/http.ts`, `openapi.yaml`, `SKILL.md` | The routes, one response shape per resource, one error shape with codes, and the contract an agent builds against. |
| Storage seam | `lib/server/db.ts` | One interface, two backends: Supabase live, memory in the sandbox. The rules live above it in the ledger. |
| Ledger | `lib/server/ledger.ts` | Pulls priced from the machine row, atomic reservation with a row lock, rarity upgraded on an empty bucket, buyback value frozen at roll time. |
| Auth | `lib/server/privy.ts`, `lib/server/operator.ts` | The player is whoever the verified Privy token says; the operator is whoever holds the key whose hash is on the machine row. |
| Live settlement | `lib/server/settlement.ts` | Builds the pull tx against the machine's treasury, verifies the signed copy byte for byte, co-signs as relayer, pays buybacks. |
| Webhooks | `lib/server/webhooks.ts` | Signed deliveries, three attempts with backoff, every attempt recorded. |
| Vault program | `onchain/` | One program, a config PDA and a USDC treasury per machine, `pull` in, `buyback` out with a receipt per slot, admin, pause and key rotation. |
| Demo machine | `lib/machine.ts`, `lib/store.ts`, `lib/rng.ts` | The service boundary the UI talks to, and the mock behind it. |
| API client | `lib/onchain.ts` | The storefront side of the pull sequence, framework-free. |
| Funding | `lib/coinbase.ts`, `app/api/onramp-token` | Coinbase Onramp with single-use session tokens. |
| Back of house | `app/admin` | Stock intake with auto SKUs, orders, barcode labels, shipping export. |

## Run it in demo mode

```bash
bun install        # or npm install
bun dev            # http://localhost:3000
```

Connect the demo wallet in the header, add demo funds, pull.

## Run the API in sandbox mode

```bash
GACHA_SANDBOX=1 bun run build
GACHA_SANDBOX=1 bun start
```

Then follow the smoke test at the bottom of `SKILL.md`: read the odds, quote a pull as `sandbox:alice`, send the `unsignedTxB64` back as `signedTxB64`, open the slot, sell it back. The operator key in the sandbox is `gk_sandbox_operator`. The sandbox is the hosted half of the module: build your storefront here first.

## Go live on devnet

1. **Privy.** Create an app, enable Solana embedded wallets, set `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_CLIENT_ID` and the server-side `PRIVY_APP_SECRET`.
2. **Supabase.** Create a project, run `docs/schema.sql` in the SQL editor, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Run `bun scripts/seed-machine.ts` to write the default machine and print its operator key once. Set `ADMIN_PASSWORD` and import stock at `/admin` or through `POST /v1/inventory`.
3. **Program.** In `onchain/`, run `anchor keys sync`, `anchor build`, `anchor deploy --provider.cluster devnet`, then `initialize(machine_seed, payout_authority, max_buyback)` with the treasury seed the seed script printed, the devnet USDC mint and a `max_buyback` just above your biggest piece. Put the program id in `THRIFT_PROGRAM_ID`. Each further machine is one more `initialize` with its own seed on the same program.
4. **Keys.** Generate a relayer keypair and a payout authority keypair, fund the relayer with devnet SOL, and set `RELAYER_SECRET_KEY` and `PAYOUT_AUTHORITY_SECRET_KEY`. Keep the program admin key separate and cold.
5. **Fee wallet.** `lib/course-fee.ts` already carries the course fee recipient. Leave it as it is.
6. **Onramp.** Create a CDP API key for `/api/onramp-token`.

Copy `.env.example` to `.env.local` and fill the groups as you go. Each group switches on independently, so a half-configured app still runs in demo mode rather than crashing.

## How a live pull works

```
storefront                     API                                  chain
  POST /v1/pulls {tier,count} ->  verify Privy token
                                  load machine row, price from it, write pull
                                  build tx: pull(machine treasury 99%) + fee(1%)
  <- pull + unsigned tx
  sign with embedded wallet
  POST /v1/pulls/:id/settle ->    verify tx matches the pull exactly
                                  co-sign as relayer, submit ---------> PullPaid
                                  mark paid (once)
                                  roll per slot from the machine row, reserve_tee() per slot
                                  post pull.opened to webhooks
  <- slots
  POST /v1/pulls/:id/buyback ->   owner from token, amount from slot row
                                  pay with payout authority ----------> Receipt PDA (init once)
                                  post buyback.paid
  <- signature, amount
```

Three things are enforced that the original product did not enforce on day one, and they are the reason this starter exists:

- **The server prices every pull.** `POST /v1/pulls` takes a tier and a count, never an amount. The signed transaction is compared instruction by instruction against the one the server built, so an edited amount, a swapped destination or an extra instruction is rejected with `tx_mismatch` before the relayer signs.
- **The server identifies the player.** Every money route resolves the wallet from a verified Privy access token. A wallet address in the request body is ignored because there is none.
- **Buyback pays once.** The amount is the value frozen on the slot row at roll time, the row must belong to the caller and still be pending, and the on-chain receipt PDA refuses a second payout for the same slot even if the server retries.

And one thing the API adds on top: **the odds it publishes are the odds it rolls with**, because `GET /v1/machines/:id` and the roll inside settle both read the machine row, and a test refuses any server import of the default tables.

## What is left for you

The first milestone of the module is to build a second storefront from `SKILL.md` alone, against the sandbox, without opening `app/`: a page or a bot that reads the odds from the API, quotes, signs, settles, reveals and decides. If the skill is missing something you needed, that is a bug in the skill, and fixing it is part of the milestone. The second milestone is wiring this repo's own UI (`lib/machine.ts`, still on the demo store) to `lib/onchain.ts` when Privy is active.

The capstone is a themed machine on your own API: your inventory on devnet, a machine row with your odds published by the route that rolls with them, payout hardening (a daily payout cap in the program), webhooks consumed by something real, and a one-page economics brief computed from the live pool.

## Legal note

Prize plus chance plus payment reads as gambling in many jurisdictions. Publish odds from the same record that rolls, gate by geography and age, and talk to counsel before mainnet. The course covers this in Module 4.

## Course

Consumer Layer, the course this starter is taught in, covers it in Module 4, with the Doppler skills installed from Module 0 onward. The course plugin's `gacha` skill coaches each milestone and the `review` skill checks your fork against the module checklist.
