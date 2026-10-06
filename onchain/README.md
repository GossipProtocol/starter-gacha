# On-chain settlement

Anchor program that settles the gacha in USDC on Solana. It is a thin treasury
vault, one deployment for every machine the API serves: each machine has its
own config PDA at `["config", machine_seed]` and its own treasury. Players pay
a machine to pull, the machine pays them back on sell-back. No NFTs, no odds,
no item state on-chain. See `../docs/ONCHAIN_SPEC.md`.

## Layout
- `programs/thrift_machine/src/lib.rs` — the program (init / pull / buyback / withdraw / pause / rotate)
- `tests/thrift_machine.ts` — full money-path tests incl. replay + authority guards and a second machine on the same program

## Prereqs
- Rust + Solana CLI, Anchor 0.30.1 (`avm install 0.30.1 && avm use 0.30.1`)
- Node 18+, `yarn`

## Build & test
```bash
yarn install
anchor keys sync        # generates the program keypair + rewrites declare_id! + Anchor.toml
anchor build
anchor keys list        # copy the program id into the app env (THRIFT_PROGRAM_ID / NEXT_PUBLIC_THRIFT_PROGRAM_ID)
anchor test             # local validator: build, deploy, run tests
```

## Deploy (devnet)
```bash
solana config set --url devnet
anchor build && anchor deploy --provider.cluster devnet
# then initialize once PER MACHINE:
#   initialize(machine_seed, payout_authority, max_buyback) with the real USDC
#   devnet mint (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU on devnet).
#   machine_seed is the 32-byte treasury_seed on the machine row; the seed
#   script prints it (bun scripts/seed-machine.ts).
```

## Key roles
- **authority** — cold admin (multisig). Withdraw float, pause, rotate keys.
- **payout_authority** — hot server key. May ONLY sign `buyback`. Rotate often.

USDC mainnet mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
