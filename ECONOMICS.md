# THRIFTING MACHINE · economics brief

How the money works. Companion to `docs/ONCHAIN_SPEC.md` (settlement
mechanics). Written around the intake-pricing
model; a band-midpoint RTP analysis is the wrong frame for it.

## The model in one line

Every shirt gets a **house-assigned price at intake**. Buyback is a flat
**80% of that price**, instant, in USDC. Pulls can land shirts priced well
above the pull cost. That upside is the product, the reason to pull, not a
flaw to be balanced away. The house sets the average outcome by **which
shirts it loads into each tier and what it prices them at**.

## Where house margin comes from

Two paths per pulled shirt:

- **Shipped:** margin = pull price − acquisition cost − fulfillment.
  Vintage acquisition cost is typically far below the assigned price, so
  shipped pulls carry healthy margin even when the shirt's price exceeds
  the pull cost.
- **Sold back:** net cash = pull price − (0.80 × assigned price). The shirt
  returns to the pool at its price and can be pulled again, so the house
  keeps the asset; only the cash delta moves.

Expected net cash per pull, if a fraction `s` of pulled value gets sold
back:

```
net(tier) = price(tier) − s × 0.80 × E[assigned price | tier]  − (1−s) × (acq + fulfillment)
```

`E[assigned price | tier]` is not a theoretical number. It is computed from
the actual shirts loaded in that tier. Which makes it a knob, not a fact.

## The intake knob

At intake (the first batch of the real machine was 50 shirts):

1. Price every shirt (this is the number on the label and the buyback base).
2. Assign each shirt to a tier bucket via the value bands in `lib/config.ts`.
3. Compute per tier: `E[assigned price]`, `E[buyback] = 0.80 × E[assigned]`.
4. Read the table and decide if the average is where the house wants it.
   Adjust by re-pricing, re-bucketing, or re-weighting odds. Generosity is
   a marketing decision the house makes explicitly, batch by batch.

| Tier | Price | E[assigned price] (real pool) | E[buyback 80%] | Decision |
|------|-------|-------------------------------|----------------|----------|
| Starter | $17.99 | fill at intake | fill at intake | house call |
| Standard | $39 | fill at intake | fill at intake | house call |
| Legendary | $99 | fill at intake | fill at intake | house call |

## Treasury and reserve

- Reserve floor: largest single possible buyback in the live pool + p95
  expected daily net outflow. Auto-pause settlement if the treasury dips
  below it.
- `max_buyback` (on-chain per-tx cap): set just above the highest-priced
  shirt × 0.80; adjust with `set_max_buyback` when inventory changes.
- Daily payout cap (on-chain, a module exercise): bounds a stolen payout
  key to one day's limit.

## Cost lines to carry

- Gas, sponsored: ~$0.03 per pull, ~$0.35 one-time ATA rent per new wallet.
- Fulfillment per shipped shirt: bag + label + postage.
- Acquisition cost per shirt: record it at intake next to the assigned
  price, so the margin table above is real, not estimated.

## Where the numbers live

- Tier prices, odds, buyback %: `lib/config.ts` (single source of truth,
  UI cascades automatically).
- Per-shirt assigned price, acquisition cost, SKU: intake spreadsheet →
  Supabase `tees` (see docs/schema.sql and the /admin intake page).

## Legal

Cash buyback + random outcome reads as regulated gambling in many
jurisdictions. Gaming/sweepstakes counsel before mainnet. Unchanged.
