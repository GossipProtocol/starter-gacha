# On-chain and pricing spec

Companion to `ECONOMICS.md`. That doc tunes the *numbers* (odds, value bands,
buyback %). This doc defines the *mechanics*: how money actually moves,
fixed-price pulls in and buybacks out, on Solana in USDC, and how normies get
USDC into their wallet via Coinbase.

Scope: **funds transfer only. No NFTs.** Items live off-chain in the machine's
ledger (the `tees` table, or memory in the sandbox). The chain is a USDC
ledger: it settles the pull payment and the buyback payout. Nothing about
*which piece you got* touches the chain.

**One program, a treasury per machine.** The API serves many machines
(`docs/schema.sql`, `machines`). Each machine row carries a 32-byte
`treasury_seed` (keccak256 of the machine id by default). On chain, the
machine's `Config` PDA is `["config", treasury_seed]` and its treasury is that
PDA's USDC associated token account. The program was changed for this (the
original had a single global `["config"]`); the change is the `machine_seed`
argument to `initialize`, the seed on every account constraint, and receipts
scoped under the config. `onchain/tests/thrift_machine.ts` covers two machines
on one program.

---

## 1. Mental model

```
        fiat                      USDC (Solana)                off-chain
   ┌───────────┐   onramp    ┌──────────────────┐   roll   ┌──────────────┐
   │  card /   │ ──────────▶ │  player's wallet  │ ───────▶ │ house vault   │
   │  bank     │             │  (Privy embedded) │          │ (items + DB)  │
   └───────────┘             └──────────────────┘          └──────────────┘
                                  │       ▲
                            pull  │       │  buyback
                            (pay) ▼       │  (payout)
                             ┌──────────────────┐
                             │  treasury (PDA)   │  USDC token account
                             └──────────────────┘
```

One asset end-to-end: **USDC on Solana.** The player funds their own wallet
once (Coinbase Onramp), then everything is wallet ⇄ treasury. Buyback lands
back in the player's wallet as spendable USDC — no store-credit ledger, no
"points." That single decision is what makes Onramp (not Commerce) the right
funding primitive (§5).

---

## 2. Pricing mechanics (fixed price)

The price model is deliberately boring: **fixed price per tier, set by the
house, paid up front.** No bonding curve, no dynamic pricing. The randomness
is in the *outcome*, not the price.

| Concept       | Value / source                                              |
|---------------|-------------------------------------------------------------|
| Unit price    | `machine.tierMeta[tier].price` from the machine row (default machine: starter 17.99, standard 39, legendary 99) |
| Pull cost     | `unitPrice × count`, rounded to cents (`createIntent`)      |
| Outcome       | server rolls rarity from `machine.tierTable[tier]` (`rollRarityFrom`) |
| Buyback offer | `buybackValueUnder(machine.buyback, price, rarity, category)`, a % of the intake price |
| Decision      | per slot: **ship** (keep, leaves pool) or **sell back** (USDC to wallet) |

The **machine row** is the single source of truth on the server: the public
odds route and the roll both read it, so the odds the API publishes are the
odds it rolls with. `lib/config.ts` holds the default machine that seeds the
first row. The chain never stores a price or an odds table; it only moves the
dollar amounts the off-chain layer computes from the row. This keeps the
contract dumb (cheap, hard to break) and lets you re-tune economics (the
`ECONOMICS.md` pass) with zero redeploy.

**Where each number is enforced**

- *Pull amount* — the **server** computes `unitPrice × count` and builds the
  payment tx for exactly that. The contract accepts whatever amount is signed;
  the server compares the signed tx instruction by instruction against the
  one it built (`verifyPullTx`) and refuses to co-sign anything else.
- *Course fee* — the pull tx carries two transfers: `pull(house share)` into
  the treasury and a plain SPL transfer of the fee share to the course fee
  wallet (`lib/course-fee.ts`). The player pays the listed price once; the
  split happens inside the transaction.
- *Buyback amount* — the **server** computes `buybackValue` from config and the
  rolled piece, then signs the payout. The contract enforces *who* can pay out
  (the payout authority) and *that it pays out at most once per pull* (replay
  guard), not the dollar figure. The figure is house-controlled by construction.

> ⚠️ **Economics are not balanced yet** (see `ECONOMICS.md` — every tier is
> currently +EV for the player). The mechanics here are correct regardless of
> the numbers; ship the balanced `TIER_TABLE`/`BUYBACK_PCT` before any real
> money. And the cash-buyback + random-outcome combo reads as regulated
> gambling in many places — get gaming/sweepstakes counsel first.

---

## 3. The Solana program

A thin Anchor program: a machine-owned **treasury** that takes pull payments
and makes machine-authorized buyback payouts. Think "vault with two doors and
a turnstile," not a marketplace. One deployment serves every machine; each
machine initializes its own config and treasury under its seed.

### 3.1 Why a program at all (vs. a hot wallet)

You could skip the program: treasury = a plain USDC token account owned by a
house keypair, pulls = plain SPL transfers to it, buybacks = the server signing
transfers out. Simplest possible. We don't, because the program buys three
things that matter once real money sits in the treasury:

1. **Authority separation** — the key that signs buyback payouts
   (`payout_authority`, a hot server key) is *not* the key that can drain the
   treasury (`authority`, cold/admin). A leaked server key can't run off with
   the float.
2. **On-chain replay guard** — each pull can be bought back **at most once**,
   enforced by a per-pull receipt PDA that physically cannot be created twice.
   No "double payout" bug class, even if the server retries.
3. **Pause + auditable rules** — a single `paused` flag halts settlement; the
   rules are on-chain and reviewable rather than living only in server code.

### 3.2 Accounts

| Account            | Seeds                       | Holds                                                        |
|--------------------|-----------------------------|-------------------------------------------------------------|
| `Config` (PDA)     | `["config", machine_seed]`  | `machine_seed`, `authority`, `payout_authority`, `usdc_mint`, `max_buyback`, `paused`, `bump` |
| Treasury token acct| ATA(`Config`, `usdc_mint`)  | the machine's USDC float; owned by its `Config` PDA, moved via PDA sig |
| `Receipt` (PDA)    | `["receipt", config, pull_ref]` | one-shot proof a given pull was bought back from this machine; init-once |

### 3.3 Instructions

| Ix                     | Signer            | Effect                                                              |
|------------------------|-------------------|--------------------------------------------------------------------|
| `initialize(seed, ...)`| authority         | create this machine's `Config` + treasury ATA; set mint + payout authority |
| `pull(intent_id, amt)` | **player**        | CPI transfer `player → treasury` of `amt` USDC; emit `PullPaid`     |
| `buyback(ref, amt)`    | **payout_auth**   | init `Receipt[ref]` (replay guard) → CPI transfer `treasury → player`; emit `BuybackPaid` |
| `withdraw(amt)`        | authority         | CPI transfer `treasury → house destination` (skim profit/float mgmt)|
| `set_paused(bool)`     | authority         | halt/resume `pull` + `buyback`                                      |
| `set_max_buyback(amt)` | authority         | adjust the per-tx buyback cap (blast-radius bound)                 |
| `set_payout_authority` | authority         | rotate the hot payout key                                          |
| `set_authority`        | authority         | hand off admin                                                     |

`pull` stores **nothing** on-chain (just an event + the `intent_id` memo); the
server is the system of record for intents. `buyback` is the only one that
writes state, and only a 1-bit-meaningful receipt. Minimal surface = minimal
audit.

Server side, `machineVault(machine)` in `lib/server/settlement.ts` derives the
config PDA and treasury from the row's `treasury_seed`, and every pull and
buyback instruction is built against that machine's accounts. The course fee
transfer (`lib/course-fee.ts`) is the same second instruction on every machine,
so every machine built on the API pays it.

### 3.4 Gas sponsorship (zero-SOL players)

Players hold **no SOL**. The house relayer is the **fee payer** on every tx:

- **pull** — player signs (they're the authority over their USDC token
  account); the relayer co-signs as fee payer and submits. Both signatures,
  but the player never needs lamports.
- **buyback** — only the `payout_authority` signs, and it's also the fee payer.
  Player isn't even in the signing path → "instant" payout.

One-time cost: ~$0.35 of rent to create the player's USDC ATA the first time
(house-sponsored), then ~$0.03/pull in fees (sponsored). Budget these as COGS.

---

## 4. Settlement sequences

### 4.1 Pull (lever → reveal)

```
player UI        server (settlement)         chain                house vault
   │  generatePull(tier,count) │                                       │
   │ ─────────────────────────▶│  price = unitPrice×count              │
   │                           │  create intent_id, quote              │
   │  ◀── intent + unsigned tx ┤  build pull tx (transfer+memo)        │
   │  sign (Privy)             │                                       │
   │ ── signed tx ────────────▶│  co-sign as fee payer, submit ───────▶│ PullPaid
   │                           │  confirm event, amt == quote? ◀───────┤
   │                           │  ── per slot: rollRarity(tier) ──────────────────▶ reserve piece
   │  ◀── reveal (tee, pull) ──┤                                       │
```

The roll happens **server-side, after payment confirms** — never in the client
(`rng.ts` is the house-edge boundary; a client that rolls its own outcome can
grind for grails). `intent_id` ties the on-chain payment to the off-chain
intent so a replayed/duplicate payment can't open extra slots.

### 4.2 Buyback (sell back → USDC in wallet)

```
player UI            server                         chain
   │  buyback(pullId) │                                │
   │ ────────────────▶│  load pull; decision==pending? │
   │                  │  amt = pull.buybackValue       │
   │                  │  ref = hash(pullId)            │
   │                  │  buyback(ref, amt) ───────────▶│ init Receipt[ref] (fails if exists)
   │                  │                                │ transfer treasury→player (PDA sig)
   │                  │  ◀──────── BuybackPaid ────────┤
   │  ◀── new balance ┤  mark soldback, piece → pool   │
```

The receipt PDA is the idempotency key: if the server crashes after the chain
paid but before it recorded `soldback`, the retry's `init` fails → no double
payout, and the server reconciles from the `BuybackPaid` event.

---

## 5. Coinbase funding flow

**Recommendation: Coinbase Onramp**, not Commerce.

| | Onramp | Commerce |
|---|---|---|
| What it is | fiat → crypto **into the user's own wallet** | merchant **accepts** crypto into the *merchant's* wallet |
| User ends with | USDC in **their** wallet | nothing in their wallet (they paid the merchant) |
| Fits buyback-to-wallet? | **yes** — they already hold a funded wallet | no — they'd have no wallet for buyback to land in |
| Per-pull UX | fund once, then many gas-sponsored pulls | a hosted checkout *per purchase* |

Our entire design is wallet-centric (buyback must land in the player's wallet),
so the player needs a funded wallet regardless — which is exactly what Onramp
produces. Commerce would fit a "pay the merchant per pull" model that *doesn't*
give the player wallet-resident USDC, contradicting the sell-back requirement.
So: **Onramp to fund, contract to settle.**

### 5.1 Normie checkout flow

1. Player taps **Add funds** (replaces the demo `FundModal`).
2. App calls our server route `POST /api/onramp-token` → server calls Coinbase
   **Create Session Token** (`POST https://api.developer.coinbase.com/onramp/v1/token`)
   with the player's Solana address + `solana`/`usdc`, using CDP API-key JWT
   auth. Token is single-use, **5-min** expiry.
3. App opens the Onramp URL (`pay.coinbase.com/buy`) **initialized with that
   `sessionToken`** — mandatory since **2025-07-31**. Card / bank / Coinbase
   balance all handled by Coinbase (KYC, payment, compliance).
4. USDC settles to the player's wallet on Solana. App polls balance; once it
   lands, the lever is live.

Preset amounts (`FUND_PRESETS = [50,100,250,500]`) map to Onramp
`presetFiatAmount`. Default network `solana`, asset `USDC`.

### 5.2 What stays server-side

- **CDP API key + secret** → only on the server route that mints session
  tokens (never shipped to the client).
- The session-token call must include the destination address; mint it
  per-session, per-user.

---

## 6. Security & ops checklist

- [ ] `authority` is a cold multisig (Squads); `payout_authority` is a separate
      hot key with **only** payout power. Rotate `payout_authority` on a schedule.
- [x] Server prices every pull and verifies the signed tx against the one it
      built before the relayer co-signs (`verifyPullTx`).
- [x] Buyback amount derived **only** from the pull row frozen at roll time,
      scoped to the player resolved from the Privy token.
- [ ] Treasury reserve ≥ largest single buyback + p95 daily net outflow
      (see `ECONOMICS.md` Monte-Carlo) — `pause` if it dips below.
- [ ] **Known limitation (C1):** the program does *not* bind the buyback
      *recipient* on-chain — reveals are server-side, so there's no per-piece
      player signature to anchor to. Payout correctness rests on the server +
      payout-key secrecy. Mitigations in-program: a per-tx `max_buyback` cap
      (set just above the largest legit buyback, e.g. legendary grail) and the
      `pause` kill switch. Operationally: rotate `payout_authority`, alert on
      every `BuybackPaid`. Stronger fix (future): write per-pull on-chain state
      at reveal and require `recipient == puller`.
- [ ] Rate-limit `generatePull` / settlement per wallet (anti-grind, anti-DOS
      on sponsored gas).
- [ ] RNG runs server-side only; commit the seed/outcome (signed) per pull for
      auditability.
- [ ] **Legal:** cash buyback + random outcome ≈ regulated gambling in many
      jurisdictions. Counsel before mainnet. (Carried over from `ECONOMICS.md`.)

---

## 7. Map to the codebase

| Spec piece            | File (this repo)                                  |
|-----------------------|---------------------------------------------------|
| Service boundary      | `lib/machine.ts` (mock today → real adapter)      |
| API client            | `lib/onchain.ts`, `openapi.yaml`, `SKILL.md`      |
| Coinbase onramp client| `lib/coinbase.ts` + `app/components/CoinbaseOnramp.tsx` |
| Server: auth          | `lib/server/privy.ts`                             |
| Server: ledger        | `lib/server/ledger.ts`, `docs/schema.sql`         |
| Server: machine row   | `lib/server/machines.ts`, `docs/schema.sql` (`machines`) |
| Server: odds route    | `app/api/v1/machines/[id]/route.ts`               |
| Server: price + build | `app/api/v1/pulls/route.ts`                       |
| Server: verify + roll | `app/api/v1/pulls/[id]/settle/route.ts`           |
| Server: buyback, ship | `app/api/v1/pulls/[id]/buyback/route.ts`, `app/api/v1/pulls/[id]/ship/route.ts` |
| Server: operator      | `app/api/v1/inventory/route.ts`, `app/api/v1/webhooks/route.ts`, `lib/server/operator.ts` |
| Server: webhooks      | `lib/server/webhooks.ts`                          |
| Server: onramp token  | `app/api/onramp-token/route.ts`                   |
| House-edge RNG        | `lib/rng.ts` (`rollRarityFrom`, called only from the server in live mode) |
| Default machine       | `lib/config.ts` (seeds the first row, drives the browser demo) |
| Course fee            | `lib/course-fee.ts`                               |
| Anchor program        | `onchain/programs/thrift_machine/src/lib.rs`      |

The contract and these routes are the production swap for the in-memory
`store.ts`. Components keep importing `machine.ts`; only its body changes.
Any other storefront talks to the same routes; that is what the API is for.
