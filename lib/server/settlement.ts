/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY settlement against the on-chain program.

   Never import this from a client component. It loads the relayer and
   payout-authority secret keys and builds program instructions.

   One program, a treasury per machine. Every machine row carries a 32-byte
   `treasury_seed`; the machine's Config PDA is `["config", treasury_seed]`
   and its treasury is that PDA's USDC associated token account. Receipts
   are `["receipt", config, pull_ref]`, so a pull id can only ever be bought
   back once from the treasury it was paid into. Mirrors
   onchain/programs/thrift_machine/src/lib.rs; if you change the program's
   seeds, account order or args, change it here too.

   Self-contained: encodes the two custom instructions by Anchor
   discriminator (no IDL or anchor runtime needed).

   All env access is LAZY (first call, not import time) so the app builds
   and runs without the on-chain env set; the settle and buyback routes
   answer settlement_unconfigured until SOLANA_RPC_URL, THRIFT_PROGRAM_ID,
   USDC_MINT, RELAYER_SECRET_KEY and PAYOUT_AUTHORITY_SECRET_KEY are set.

   Sandbox (GACHA_SANDBOX=1): no chain. `preparePull` returns an opaque
   token in place of a transaction, `verifyPullTx` checks the client sent
   that exact token back, and signatures are `sandbox_...` strings. The
   routes, the ledger, the roll and the webhooks are the real ones.
   ───────────────────────────────────────────────────────────────────────── */

import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  SystemProgram, sendAndConfirmRawTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import { createHash } from 'crypto';
import { keccak256 } from 'js-sha3';
import { COURSE_FEE_RECIPIENT, courseFeeConfigured, splitPullAmount } from '../course-fee';
import { isSandbox } from './db';
import { ApiError } from './http';
import type { MachineConfig } from '../types';

const USDC_DECIMALS = 6;

/** The on-chain identity of one machine: its config PDA and treasury. */
export interface MachineVault {
  configPda: PublicKey;
  treasuryAta: PublicKey;
  seed: Buffer;
}

/* ── lazy env / config ────────────────────────────────────────────────── */

interface SettlementCtx {
  connection: Connection;
  programId: PublicKey;
  usdcMint: PublicKey;
  /** Relayer = fee payer for both pull and buyback (players hold no SOL). */
  relayer: Keypair;
  /** Payout authority = the only key allowed to sign buybacks. */
  payoutAuthority: Keypair;
  /** Course fee wallet and its USDC account (see lib/course-fee.ts). */
  feeRecipient: PublicKey;
  feeAta: PublicKey;
}

let ctx: SettlementCtx | null = null;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Settlement not configured: missing env ${name}`);
  return v;
}

function keypairFromEnv(name: string): Keypair {
  const raw = need(name);
  // Accept a JSON array (Solana CLI keypair) or base64.
  const bytes = raw.trim().startsWith('[')
    ? Uint8Array.from(JSON.parse(raw))
    : Uint8Array.from(Buffer.from(raw, 'base64'));
  return Keypair.fromSecretKey(bytes);
}

function getCtx(): SettlementCtx {
  if (ctx) return ctx;
  const programId = new PublicKey(need('THRIFT_PROGRAM_ID'));
  const usdcMint = new PublicKey(need('USDC_MINT')); // devnet: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
  if (!courseFeeConfigured()) {
    throw new Error('Course fee recipient not set: fill COURSE_FEE_RECIPIENT in lib/course-fee.ts');
  }
  const feeRecipient = new PublicKey(COURSE_FEE_RECIPIENT);
  ctx = {
    connection: new Connection(need('SOLANA_RPC_URL'), 'confirmed'),
    programId,
    usdcMint,
    relayer: keypairFromEnv('RELAYER_SECRET_KEY'),
    payoutAuthority: keypairFromEnv('PAYOUT_AUTHORITY_SECRET_KEY'),
    feeRecipient,
    feeAta: getAssociatedTokenAddressSync(usdcMint, feeRecipient, true),
  };
  return ctx;
}

/** Derive a machine's config PDA and treasury from its row's seed. */
export function machineVault(machine: Pick<MachineConfig, 'treasurySeed'>): MachineVault {
  const { programId, usdcMint } = getCtx();
  const seed = Buffer.from(machine.treasurySeed, 'hex');
  if (seed.length !== 32) throw new Error('treasury_seed must be 32 bytes of hex');
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config'), seed], programId);
  return { configPda, treasuryAta: getAssociatedTokenAddressSync(usdcMint, configPda, true), seed };
}

/* ── sandbox ──────────────────────────────────────────────────────────── */

function sandboxToken(intentId: string): string {
  return Buffer.from(`sandbox:${intentId}`, 'utf8').toString('base64');
}

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Anchor instruction discriminator: sha256("global:<name>")[..8]. */
function disc(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function toBaseUnits(dollars: number): bigint {
  return BigInt(Math.round(dollars * 10 ** USDC_DECIMALS));
}

function u64le(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

/** pull_ref = keccak256(pullId) — must match pull_ref_from_id() on-chain. */
function pullRef(pullId: string): Buffer {
  return Buffer.from(keccak256.arrayBuffer(Buffer.from(pullId, 'utf8')));
}

/** 32-byte intent id from an arbitrary intent string. */
function intentBytes(intentId: string): Buffer {
  return Buffer.from(keccak256.arrayBuffer(Buffer.from(intentId, 'utf8')));
}

/* ── PULL: build, verify, settle ──────────────────────────────────────── */

/** The instructions every pull transaction must contain, in this order. */
function pullInstructions(args: { machine: MachineConfig; player: PublicKey; intentId: string; totalUsdc: number }) {
  const { programId, usdcMint, relayer, feeRecipient, feeAta } = getCtx();
  const { configPda, treasuryAta } = machineVault(args.machine);
  const playerAta = getAssociatedTokenAddressSync(usdcMint, args.player);
  const { house, fee } = splitPullAmount(toBaseUnits(args.totalUsdc));

  const pullIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: args.player, isSigner: true, isWritable: false },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: playerAta, isSigner: false, isWritable: true },
      { pubkey: treasuryAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc('pull'), intentBytes(args.intentId), u64le(house)]),
  });

  // Course fee: a second USDC transfer in the same transaction. The fee ATA
  // is created idempotently (relayer pays rent once), so the first pull on a
  // fresh deployment works too.
  const feeAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    relayer.publicKey, feeAta, feeRecipient, usdcMint
  );
  const feeIx = createTransferInstruction(playerAta, feeAta, args.player, fee);

  return [pullIx, feeAtaIx, feeIx];
}

/**
 * Build the unsigned pull payment tx for the wallet to sign. `totalUsdc` is
 * the server-side quote from the intent row (lib/server/ledger.ts); the
 * route never takes an amount from the client.
 * Fee payer = relayer. Required signers: player + relayer.
 */
export async function preparePull(args: {
  machine: MachineConfig; owner: string; intentId: string; totalUsdc: number;
}): Promise<{ unsignedTxB64: string }> {
  if (isSandbox()) return { unsignedTxB64: sandboxToken(args.intentId) };

  const { connection, relayer } = getCtx();
  const player = new PublicKey(args.owner);

  const tx = new Transaction().add(...pullInstructions({ machine: args.machine, player, intentId: args.intentId, totalUsdc: args.totalUsdc }));
  tx.feePayer = relayer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return {
    unsignedTxB64: tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64'),
  };
}

/**
 * Check that a player-signed transaction is exactly the one the server
 * prepared for this intent: same fee payer, same instructions, same amounts,
 * same player. Anything else is rejected before the relayer co-signs, so a
 * client cannot edit the amount, swap the destination, or append an
 * instruction that spends the relayer's SOL.
 */
export function verifyPullTx(signedTxB64: string, expected: {
  machine: MachineConfig; owner: string; intentId: string; totalUsdc: number;
}): Transaction | null {
  if (isSandbox()) {
    if (signedTxB64 !== sandboxToken(expected.intentId)) {
      throw new ApiError('tx_mismatch', 'Sandbox: signedTxB64 must be the unsignedTxB64 the server returned');
    }
    return null;
  }

  const { relayer } = getCtx();
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(signedTxB64, 'base64'));
  } catch {
    throw new ApiError('tx_mismatch', 'signedTxB64 is not a serialized transaction');
  }
  const player = new PublicKey(expected.owner);
  const mismatch = (why: string) => new ApiError('tx_mismatch', why);

  if (!tx.feePayer?.equals(relayer.publicKey)) throw mismatch('Wrong fee payer');

  const want = pullInstructions({ machine: expected.machine, player, intentId: expected.intentId, totalUsdc: expected.totalUsdc });
  if (tx.instructions.length !== want.length) throw mismatch('Unexpected instruction count');

  tx.instructions.forEach((got, i) => {
    const exp = want[i];
    if (!got.programId.equals(exp.programId)) throw mismatch(`Instruction ${i}: wrong program`);
    if (!got.data.equals(exp.data)) throw mismatch(`Instruction ${i}: data mismatch`);
    if (got.keys.length !== exp.keys.length) throw mismatch(`Instruction ${i}: key count mismatch`);
    got.keys.forEach((k, j) => {
      const e = exp.keys[j];
      if (!k.pubkey.equals(e.pubkey) || k.isSigner !== e.isSigner || k.isWritable !== e.isWritable) {
        throw mismatch(`Instruction ${i}: account ${j} mismatch`);
      }
    });
  });

  // The player must have signed. The relayer signature is attached next.
  const playerSig = tx.signatures.find((s) => s.publicKey.equals(player));
  if (!playerSig?.signature) throw mismatch('Player signature missing');
  return tx;
}

/**
 * Attach the relayer (fee-payer) signature to a verified tx and submit.
 * Returns the confirmed signature.
 */
export async function submitPull(tx: Transaction | null, intentId: string): Promise<{ signature: string }> {
  if (isSandbox() || !tx) return { signature: `sandbox_pull_${intentId}` };
  const { connection, relayer } = getCtx();
  tx.partialSign(relayer);
  const sig = await sendAndConfirmRawTransaction(connection, tx.serialize(), {
    commitment: 'confirmed',
  });
  return { signature: sig };
}

/* ── BUYBACK: server-authorized payout ────────────────────────────────── */

/**
 * Pay a buyback to the player's USDC account. amount comes from the server
 * (config-derived), NEVER the client. The receipt PDA makes this at-most-once
 * per pullId. Creates the player's USDC ATA first if missing (house-sponsored).
 */
export async function payBuyback(args: {
  machine: MachineConfig; owner: string; pullId: string; amountUsdc: number;
}): Promise<{ signature: string; amountUsdc: number }> {
  if (isSandbox()) return { signature: `sandbox_buyback_${args.pullId}`, amountUsdc: args.amountUsdc };

  const { connection, programId, usdcMint, relayer, payoutAuthority } = getCtx();
  const { configPda, treasuryAta } = machineVault(args.machine);
  const player = new PublicKey(args.owner);
  const playerAta = getAssociatedTokenAddressSync(usdcMint, player);
  const ref = pullRef(args.pullId);
  const [receiptPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('receipt'), configPda.toBuffer(), ref], programId
  );

  const tx = new Transaction();

  // First-buyback case: sponsor the player's USDC ATA so the payout lands.
  const ataExists = await accountExists(connection, playerAta);
  if (!ataExists) {
    tx.add(createAssociatedTokenAccountInstruction(
      relayer.publicKey, playerAta, player, usdcMint
    ));
  }

  const data = Buffer.concat([
    disc('buyback'), ref, u64le(toBaseUnits(args.amountUsdc)),
  ]);
  tx.add(new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payoutAuthority.publicKey, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: receiptPda, isSigner: false, isWritable: true },
      { pubkey: treasuryAta, isSigner: false, isWritable: true },
      { pubkey: playerAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  }));

  tx.feePayer = relayer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(relayer, payoutAuthority); // relayer pays fee, payout_authority authorizes

  const sig = await sendAndConfirmRawTransaction(connection, tx.serialize(), {
    commitment: 'confirmed',
  });
  return { signature: sig, amountUsdc: args.amountUsdc };
}

async function accountExists(connection: Connection, addr: PublicKey): Promise<boolean> {
  try { await getAccount(connection, addr); return true; }
  catch { return false; }
}

export function settlementMeta(machine: MachineConfig) {
  const { programId, usdcMint, feeRecipient, feeAta } = getCtx();
  const { configPda, treasuryAta } = machineVault(machine);
  return { PROGRAM_ID: programId, configPda, treasuryAta, USDC_MINT: usdcMint, feeRecipient, feeAta };
}
