-- starter-gacha: Supabase schema.
-- Run once in the SQL editor, then `bun scripts/seed-machine.ts` to write the
-- first machine from lib/config.ts and print its operator key. RLS is on for
-- every table with no policies, so only the service role key (server-side)
-- can read or write. The browser never touches these tables directly.

create extension if not exists pgcrypto;

-- Machines. One row per gacha machine the API serves. The row is the only
-- source of odds: GET /v1/machines/:id serves tier_table and the settle
-- route rolls from tier_table, so what the API publishes is what it rolls
-- with. tier_table has the exact shape of TIER_TABLE in lib/config.ts,
-- tier_meta the shape of TIER_META, buyback the shape of DEFAULT_BUYBACK.
-- operator_key_hash is sha256(api key), hex; the key itself is shown once
-- by the seed script and never stored. treasury_seed is the 32-byte hex
-- seed of the machine's on-chain config PDA (keccak256 of the id by
-- default); the treasury is that PDA's USDC account.
create table if not exists machines (
  id                 text primary key,
  name               text not null,
  operator_key_hash  text unique not null,
  tier_table         jsonb not null,
  tier_meta          jsonb not null,
  buyback            jsonb not null,
  treasury_seed      text not null,
  status             text not null default 'active',   -- active | paused
  created_at         timestamptz not null default now()
);

-- Stock. One row per piece. `price` is the house-assigned price at intake and
-- the base for buyback; `rarity` is derived from it on import against the
-- machine's standard-tier bands (see lib/server/inventory.ts rarityForPrice)
-- so odds and stock never drift apart.
create table if not exists tees (
  id          uuid primary key default gen_random_uuid(),
  machine_id  text not null references machines (id),
  sku         text unique not null,
  name        text not null,
  brand       text not null default '',
  era         text not null default '',
  category    text not null default 'surprise',
  size        text not null default 'L',
  quality     numeric,
  price       numeric not null default 0,
  rarity      text not null default 'common',
  images      text[] not null default '{}',
  status      text not null default 'available',  -- available | reserved | shipped
  created_at  timestamptz not null default now()
);
create index if not exists tees_pick_idx on tees (machine_id, status, size, category, rarity, price);

-- Quotes. Written by POST /v1/pulls with the server-side price. Paid once.
-- An intent is what the API calls a pull: one purchase of `count` slots.
create table if not exists intents (
  id          uuid primary key,
  machine_id  text not null references machines (id),
  wallet      text not null,
  tier        text not null,
  category    text not null,
  size        text not null,
  count       int  not null check (count between 1 and 10),
  unit_price  numeric not null,
  total       numeric not null,
  status      text not null default 'quoted',     -- quoted | paid | opened | expired
  tx_sig      text,
  created_at  timestamptz not null default now()
);
create index if not exists intents_wallet_idx on intents (machine_id, wallet, created_at desc);

-- Pulls. One row per revealed piece (a slot of an intent), buyback value
-- frozen at roll time.
create table if not exists pulls (
  id             uuid primary key,
  machine_id     text not null references machines (id),
  intent_id      uuid not null references intents (id),
  tee_id         uuid not null references tees (id),
  wallet         text not null,
  tier           text not null,
  price_paid     numeric not null,
  buyback_pct    numeric not null,
  buyback_value  numeric not null,
  decision       text not null default 'pending',  -- pending | shipped | soldback
  tracking       text,
  buyback_sig    text,
  created_at     timestamptz not null default now()
);
create index if not exists pulls_wallet_idx on pulls (machine_id, wallet, created_at desc);
create index if not exists pulls_intent_idx on pulls (intent_id);

-- Webhook endpoints. An operator registers a URL and a secret for their
-- machine (POST /v1/webhooks). The server signs every delivery with
-- HMAC-SHA256 over `${timestamp}.${rawBody}` using the secret.
create table if not exists webhooks (
  id          uuid primary key default gen_random_uuid(),
  machine_id  text not null references machines (id),
  url         text not null,
  secret      text not null,
  status      text not null default 'active',   -- active | disabled
  created_at  timestamptz not null default now()
);
create index if not exists webhooks_machine_idx on webhooks (machine_id, status);

-- Webhook deliveries. One row per event per endpoint, updated on each
-- attempt. Three attempts with backoff, then `failed`.
create table if not exists webhook_deliveries (
  id            uuid primary key default gen_random_uuid(),
  machine_id    text not null references machines (id),
  webhook_id    uuid not null references webhooks (id),
  event         text not null,                   -- pull.opened | buyback.paid | pull.shipped
  payload       jsonb not null,
  attempts      int  not null default 0,
  status        text not null default 'pending', -- pending | delivered | failed
  last_status   int,
  last_error    text,
  delivered_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists webhook_deliveries_idx on webhook_deliveries (machine_id, created_at desc);

alter table machines            enable row level security;
alter table tees                enable row level security;
alter table intents             enable row level security;
alter table pulls               enable row level security;
alter table webhooks            enable row level security;
alter table webhook_deliveries  enable row level security;

-- Atomic reservation. Picks one available piece of this machine matching
-- size, optional category, rarity and the tier's value band, locks the row,
-- flips it to reserved, and returns it. Two simultaneous pulls cannot win
-- the same piece: SKIP LOCKED makes the second caller see a different row
-- or none.
create or replace function reserve_tee(
  p_machine  text,
  p_category text,
  p_size     text,
  p_rarity   text,
  p_min      numeric,
  p_max      numeric
) returns setof tees
language plpgsql
as $$
declare
  picked tees%rowtype;
begin
  select * into picked
  from tees
  where machine_id = p_machine
    and status = 'available'
    and size = p_size
    and rarity = p_rarity
    and (p_category is null or category = p_category)
    and price between p_min and p_max
  order by random()
  limit 1
  for update skip locked;

  if not found then
    -- Same rarity, any price in the pool. The band is a preference, the
    -- rarity is the promise.
    select * into picked
    from tees
    where machine_id = p_machine
      and status = 'available'
      and size = p_size
      and rarity = p_rarity
      and (p_category is null or category = p_category)
    order by random()
    limit 1
    for update skip locked;
  end if;

  if not found then
    return;
  end if;

  update tees set status = 'reserved' where id = picked.id;
  picked.status := 'reserved';
  return next picked;
end;
$$;

-- Pool depth by rarity for the public machine route. Counts available
-- pieces only, so a storefront can show "3 grails left" without seeing
-- what they are.
create or replace function pool_depth(p_machine text)
returns table (rarity text, available bigint)
language sql
stable
as $$
  select rarity, count(*) as available
  from tees
  where machine_id = p_machine and status = 'available'
  group by rarity;
$$;
