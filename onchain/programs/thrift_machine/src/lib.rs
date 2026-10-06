//! Gacha settlement program.
//!
//! A thin USDC vault, one program for many machines. Each machine has its
//! own `Config` PDA seeded by a 32-byte `machine_seed` (the API stores it
//! on the machine row as `treasury_seed`) and its own treasury, the
//! config's USDC associated token account. It does exactly two money things:
//!   • `pull`    is the player paying the machine for a lever pull.
//!   • `buyback` is the machine paying the player back when they sell a piece.
//! Plus admin per machine (init / withdraw / pause / rotate keys).
//!
//! NOT here, on purpose: no NFTs, no odds, no prices, no item state. The
//! random outcome and the dollar amounts are decided off-chain (house-edge
//! RNG + `lib/config.ts`). The chain only moves USDC and enforces *who* may
//! move it and *that a buyback happens at most once per pull*.
//!
//! See `docs/ONCHAIN_SPEC.md` §3.
//!
//! SECURITY — known limitation (by design):
//!   The program enforces *who* may pay out (`payout_authority`) and *at-most-
//!   once per pull* (receipt PDA), but it does NOT bind the buyback *recipient*
//!   or *amount* to on-chain state — reveals happen server-side, so there is no
//!   per-piece player signature to anchor to. Payout correctness therefore rests
//!   on the off-chain server and the secrecy of the payout key. Mitigations in
//!   this program: a per-tx `max_buyback` cap (bounds a single fraudulent
//!   payout) and `set_paused` (kill switch). Operationally: keep `payout_authority`
//!   separate from admin, rotate it, and monitor `BuybackPaid`. A stronger fix
//!   (per-pull on-chain state binding recipient at reveal) is a future hardening.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"); // placeholder — run `anchor keys sync`

const CONFIG_SEED: &[u8] = b"config";
const RECEIPT_SEED: &[u8] = b"receipt";

#[program]
pub mod thrift_machine {
    use super::*;

    /// One-time setup per machine. Creates the machine's `Config` PDA at
    /// `["config", machine_seed]` and its treasury USDC token account (an ATA
    /// owned by that PDA). The signer becomes the machine's admin
    /// (`authority`); `payout_authority` is the separate hot key the server
    /// uses to sign buybacks. The same program serves every machine.
    pub fn initialize(
        ctx: Context<Initialize>,
        machine_seed: [u8; 32],
        payout_authority: Pubkey,
        max_buyback: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.machine_seed = machine_seed;
        config.authority = ctx.accounts.authority.key();
        config.payout_authority = payout_authority;
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.paused = false;
        config.max_buyback = max_buyback;
        config.bump = ctx.bumps.config;
        emit!(Initialized {
            config: config.key(),
            authority: config.authority,
            payout_authority: config.payout_authority,
            usdc_mint: config.usdc_mint,
        });
        Ok(())
    }

    /// Player pays for a pull. Transfers `amount` USDC from the player's token
    /// account into the treasury. `intent_id` is the off-chain intent this
    /// payment settles — emitted so the server can match payment ⇄ intent and
    /// reject duplicates. The contract does NOT validate the amount; the
    /// server checks `amount == quoted price` before it rolls.
    ///
    /// Fee payer is the house relayer (set at the tx level), so the player
    /// needs zero SOL — they only sign as the token-account authority.
    pub fn pull(ctx: Context<Pull>, intent_id: [u8; 32], amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, ThriftError::Paused);
        require!(amount > 0, ThriftError::ZeroAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.player_token.to_account_info(),
                    to: ctx.accounts.treasury_token.to_account_info(),
                    authority: ctx.accounts.player.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(PullPaid {
            config: ctx.accounts.config.key(),
            player: ctx.accounts.player.key(),
            intent_id,
            amount,
        });
        Ok(())
    }

    /// Machine pays the player back for a sold-back piece. Only the machine's
    /// `payout_authority` may call. `pull_ref` is the off-chain pull id (the
    /// server passes its keccak hash); the `Receipt` PDA seeded by the config
    /// and the ref is created with `init`, so a second buyback for the same
    /// pull from the same treasury *cannot* be created → at-most-once payout,
    /// even under server retries. Treasury → player, signed by the `Config` PDA.
    pub fn buyback(ctx: Context<Buyback>, pull_ref: [u8; 32], amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, ThriftError::Paused);
        require!(amount > 0, ThriftError::ZeroAmount);
        // Per-tx blast-radius cap. The program can't bind the recipient on-chain
        // (reveals are server-side, so there's no per-piece player signature to
        // bind to — see SECURITY note below), so a compromised payout key is the
        // main risk. This cap bounds a single fraudulent payout; pair it with key
        // rotation, monitoring, and `set_paused`. Set above the largest legit
        // buyback (e.g. legendary grail). See docs/ONCHAIN_SPEC.md §6.
        require!(amount <= config.max_buyback, ThriftError::ExceedsMaxBuyback);

        // Record the receipt (replay guard). `init` in the accounts struct
        // already guarantees uniqueness; we just stamp it for auditing.
        let receipt = &mut ctx.accounts.receipt;
        receipt.config = config.key();
        receipt.player = ctx.accounts.player_token.owner;
        receipt.amount = amount;
        receipt.pull_ref = pull_ref;

        let seeds: &[&[u8]] = &[CONFIG_SEED, config.machine_seed.as_ref(), &[config.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury_token.to_account_info(),
                    to: ctx.accounts.player_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        emit!(BuybackPaid {
            config: config.key(),
            player: ctx.accounts.player_token.owner,
            pull_ref,
            amount,
        });
        Ok(())
    }

    /// Admin skims profit / manages float: treasury → a house destination.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(amount > 0, ThriftError::ZeroAmount);

        let seeds: &[&[u8]] = &[CONFIG_SEED, config.machine_seed.as_ref(), &[config.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury_token.to_account_info(),
                    to: ctx.accounts.destination_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        Ok(())
    }

    /// Halt / resume `pull` and `buyback` (e.g. treasury reserve breach).
    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        emit!(PausedSet { paused });
        Ok(())
    }

    /// Adjust the per-tx buyback cap (e.g. when value bands change).
    pub fn set_max_buyback(ctx: Context<AdminOnly>, max_buyback: u64) -> Result<()> {
        ctx.accounts.config.max_buyback = max_buyback;
        emit!(MaxBuybackSet { max_buyback });
        Ok(())
    }

    /// Rotate the hot key that's allowed to sign buybacks.
    pub fn set_payout_authority(ctx: Context<AdminOnly>, new_payout_authority: Pubkey) -> Result<()> {
        ctx.accounts.config.payout_authority = new_payout_authority;
        emit!(PayoutAuthoritySet { payout_authority: new_payout_authority });
        Ok(())
    }

    /// Hand off admin (e.g. to a multisig).
    pub fn set_authority(ctx: Context<AdminOnly>, new_authority: Pubkey) -> Result<()> {
        ctx.accounts.config.authority = new_authority;
        emit!(AuthoritySet { authority: new_authority });
        Ok(())
    }
}

/// Helper the server mirrors: `pull_ref = keccak256(pull_id_utf8)`.
pub fn pull_ref_from_id(pull_id: &str) -> [u8; 32] {
    keccak::hash(pull_id.as_bytes()).0
}

/* ───────────────────────────── accounts ───────────────────────────── */

#[derive(Accounts)]
#[instruction(machine_seed: [u8; 32])]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED, machine_seed.as_ref()],
        bump
    )]
    pub config: Account<'info, Config>,

    pub usdc_mint: Account<'info, Mint>,

    /// Treasury USDC account: ATA owned by the `Config` PDA.
    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = config,
    )]
    pub treasury_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(intent_id: [u8; 32], amount: u64)]
pub struct Pull<'info> {
    pub player: Signer<'info>,

    #[account(seeds = [CONFIG_SEED, config.machine_seed.as_ref()], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        constraint = player_token.owner == player.key() @ ThriftError::WrongOwner,
        constraint = player_token.mint == config.usdc_mint @ ThriftError::WrongMint,
    )]
    pub player_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = config,
    )]
    pub treasury_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(pull_ref: [u8; 32], amount: u64)]
pub struct Buyback<'info> {
    /// The hot server key. Also the tx fee payer (so the player needs no SOL).
    #[account(
        mut,
        constraint = payout_authority.key() == config.payout_authority @ ThriftError::Unauthorized,
    )]
    pub payout_authority: Signer<'info>,

    #[account(seeds = [CONFIG_SEED, config.machine_seed.as_ref()], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// One-shot replay guard, scoped to this machine. `init` fails if this
    /// pull was already bought back from this treasury.
    #[account(
        init,
        payer = payout_authority,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [RECEIPT_SEED, config.key().as_ref(), pull_ref.as_ref()],
        bump
    )]
    pub receipt: Account<'info, Receipt>,

    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = config,
    )]
    pub treasury_token: Account<'info, TokenAccount>,

    /// Destination wallet's USDC account. Must already exist (house sponsors
    /// ATA creation in a prior/bundled ix on first buyback).
    #[account(
        mut,
        constraint = player_token.mint == config.usdc_mint @ ThriftError::WrongMint,
    )]
    pub player_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        constraint = authority.key() == config.authority @ ThriftError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(seeds = [CONFIG_SEED, config.machine_seed.as_ref()], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = config,
    )]
    pub treasury_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = destination_token.mint == config.usdc_mint @ ThriftError::WrongMint,
    )]
    pub destination_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(
        constraint = authority.key() == config.authority @ ThriftError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED, config.machine_seed.as_ref()], bump = config.bump)]
    pub config: Account<'info, Config>,
}

/* ───────────────────────────── state ──────────────────────────────── */

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub machine_seed: [u8; 32],   // the machine this config belongs to (API: treasury_seed)
    pub authority: Pubkey,        // admin: withdraw, pause, rotate keys
    pub payout_authority: Pubkey, // hot key allowed to sign buybacks
    pub usdc_mint: Pubkey,
    pub max_buyback: u64,         // per-tx payout cap (USDC base units)
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub config: Pubkey,
    pub player: Pubkey,
    pub amount: u64,
    pub pull_ref: [u8; 32],
}

/* ───────────────────────────── events ─────────────────────────────── */

#[event]
pub struct Initialized {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub payout_authority: Pubkey,
    pub usdc_mint: Pubkey,
}

#[event]
pub struct PullPaid {
    pub config: Pubkey,
    pub player: Pubkey,
    pub intent_id: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct BuybackPaid {
    pub config: Pubkey,
    pub player: Pubkey,
    pub pull_ref: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct PausedSet { pub paused: bool }
#[event]
pub struct MaxBuybackSet { pub max_buyback: u64 }
#[event]
pub struct PayoutAuthoritySet { pub payout_authority: Pubkey }
#[event]
pub struct AuthoritySet { pub authority: Pubkey }

/* ───────────────────────────── errors ─────────────────────────────── */

#[error_code]
pub enum ThriftError {
    #[msg("Settlement is paused")]
    Paused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Buyback exceeds the per-transaction cap")]
    ExceedsMaxBuyback,
    #[msg("Signer is not authorized")]
    Unauthorized,
    #[msg("Token account owner mismatch")]
    WrongOwner,
    #[msg("Token account mint is not USDC")]
    WrongMint,
}
