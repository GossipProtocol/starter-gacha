/**
 * Gacha settlement program tests.
 *
 * Exercises the full money path on a local validator for one machine:
 *   initialize(machine_seed) → fund treasury → pull (player pays) → buyback
 *   (machine pays)
 * plus the guards: replay-protected buyback, pause halts, only the payout
 * authority can pay, only admin can withdraw, and a second machine on the
 * same program has its own treasury and its own receipts.
 *
 * Run: `anchor test` (spins up a local validator, builds, deploys, runs this).
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { keccak256 } from "js-sha3";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

const CONFIG_SEED = Buffer.from("config");
const RECEIPT_SEED = Buffer.from("receipt");
const USDC = (n: number) => new anchor.BN(Math.round(n * 1e6)); // 6 decimals

function pullRef(id: string): Buffer {
  return Buffer.from(keccak256.arrayBuffer(Buffer.from(id, "utf8")));
}

/** The API stores keccak256(machine id) on the machine row as treasury_seed. */
function machineSeed(machineId: string): Buffer {
  return Buffer.from(keccak256.arrayBuffer(Buffer.from(machineId, "utf8")));
}

describe("thrift_machine", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ThriftMachine as Program<any>;
  const conn = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const payoutAuthority = Keypair.generate();
  const player = Keypair.generate();

  const seed = machineSeed("default");
  let usdcMint: PublicKey;
  let configPda: PublicKey;
  let treasuryAta: PublicKey;
  let playerAta: PublicKey;

  function receiptPdaFor(config: PublicKey, ref: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [RECEIPT_SEED, config.toBuffer(), ref], program.programId
    )[0];
  }

  before(async () => {
    // Fund the side keypairs with SOL for rent/fees.
    for (const kp of [payoutAuthority, player]) {
      const sig = await conn.requestAirdrop(kp.publicKey, 2e9);
      await conn.confirmTransaction(sig);
    }

    usdcMint = await createMint(conn, admin, admin.publicKey, null, 6);
    [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED, seed], program.programId);
    treasuryAta = getAssociatedTokenAddressSync(usdcMint, configPda, true);

    const playerAccount = await getOrCreateAssociatedTokenAccount(
      conn, admin, usdcMint, player.publicKey
    );
    playerAta = playerAccount.address;
    // Give the player $200 to play with.
    await mintTo(conn, admin, usdcMint, playerAta, admin, USDC(200).toNumber());
  });

  it("initializes the machine's config + treasury", async () => {
    await program.methods
      .initialize(Array.from(seed), payoutAuthority.publicKey, USDC(10_000)) // per-tx buyback cap
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        usdcMint,
        treasuryToken: treasuryAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.config.fetch(configPda);
    assert.deepEqual(Buffer.from(cfg.machineSeed), seed);
    assert.ok(cfg.authority.equals(admin.publicKey));
    assert.ok(cfg.payoutAuthority.equals(payoutAuthority.publicKey));
    assert.ok(cfg.usdcMint.equals(usdcMint));
    assert.equal(cfg.paused, false);

    // Seed the treasury float ($500) so it can pay buybacks.
    await mintTo(conn, admin, usdcMint, treasuryAta, admin, USDC(500).toNumber());
  });

  it("pull: player pays the house (standard tier = $39)", async () => {
    const intentId = pullRef("intent_abc");
    const before = (await getAccount(conn, playerAta)).amount;

    await program.methods
      .pull(Array.from(intentId), USDC(39))
      .accounts({
        player: player.publicKey,
        config: configPda,
        playerToken: playerAta,
        treasuryToken: treasuryAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([player])
      .rpc();

    const after = (await getAccount(conn, playerAta)).amount;
    assert.equal(Number(before - after), USDC(39).toNumber(), "player debited $39");
  });

  it("buyback: house pays the player (e.g. $63 sell-back)", async () => {
    const ref = pullRef("pull_xyz");
    const receiptPda = receiptPdaFor(configPda, ref);
    const before = (await getAccount(conn, playerAta)).amount;

    await program.methods
      .buyback(Array.from(ref), USDC(63))
      .accounts({
        payoutAuthority: payoutAuthority.publicKey,
        config: configPda,
        receipt: receiptPda,
        treasuryToken: treasuryAta,
        playerToken: playerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payoutAuthority])
      .rpc();

    const after = (await getAccount(conn, playerAta)).amount;
    assert.equal(Number(after - before), USDC(63).toNumber(), "player credited $63");
  });

  it("buyback is replay-protected (same pull_ref fails)", async () => {
    const ref = pullRef("pull_xyz"); // same as above
    const receiptPda = receiptPdaFor(configPda, ref);
    let threw = false;
    try {
      await program.methods
        .buyback(Array.from(ref), USDC(63))
        .accounts({
          payoutAuthority: payoutAuthority.publicKey,
          config: configPda,
          receipt: receiptPda,
          treasuryToken: treasuryAta,
          playerToken: playerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payoutAuthority])
        .rpc();
    } catch {
      threw = true; // receipt PDA already in use → init fails
    }
    assert.isTrue(threw, "second buyback for the same pull must fail");
  });

  it("rejects a buyback over the per-tx cap", async () => {
    const ref = pullRef("pull_too_big");
    const receiptPda = receiptPdaFor(configPda, ref);
    let threw = false;
    try {
      await program.methods
        .buyback(Array.from(ref), USDC(10_001)) // > $10,000 cap
        .accounts({
          payoutAuthority: payoutAuthority.publicKey,
          config: configPda,
          receipt: receiptPda,
          treasuryToken: treasuryAta,
          playerToken: playerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payoutAuthority])
        .rpc();
    } catch {
      threw = true;
    }
    assert.isTrue(threw, "buyback above the cap must fail");
  });

  it("rejects buyback from a non-payout key", async () => {
    const ref = pullRef("pull_other");
    const receiptPda = receiptPdaFor(configPda, ref);
    let threw = false;
    try {
      await program.methods
        .buyback(Array.from(ref), USDC(10))
        .accounts({
          payoutAuthority: player.publicKey, // wrong signer
          config: configPda,
          receipt: receiptPda,
          treasuryToken: treasuryAta,
          playerToken: playerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    } catch {
      threw = true;
    }
    assert.isTrue(threw, "only payout_authority may buy back");
  });

  it("pause halts pulls", async () => {
    await program.methods.setPaused(true).accounts({ authority: admin.publicKey, config: configPda }).rpc();

    let threw = false;
    try {
      await program.methods
        .pull(Array.from(pullRef("intent_when_paused")), USDC(17.99))
        .accounts({
          player: player.publicKey,
          config: configPda,
          playerToken: playerAta,
          treasuryToken: treasuryAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player])
        .rpc();
    } catch {
      threw = true;
    }
    assert.isTrue(threw, "pull must fail while paused");

    await program.methods.setPaused(false).accounts({ authority: admin.publicKey, config: configPda }).rpc();
  });

  it("only admin can withdraw", async () => {
    const houseAccount = await getOrCreateAssociatedTokenAccount(
      conn, admin, usdcMint, admin.publicKey
    );
    let threw = false;
    try {
      await program.methods
        .withdraw(USDC(10))
        .accounts({
          authority: player.publicKey, // not admin
          config: configPda,
          treasuryToken: treasuryAta,
          destinationToken: houseAccount.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player])
        .rpc();
    } catch {
      threw = true;
    }
    assert.isTrue(threw, "non-admin withdraw must fail");

    // admin succeeds
    await program.methods
      .withdraw(USDC(10))
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        treasuryToken: treasuryAta,
        destinationToken: houseAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  });

  it("a second machine on the same program has its own treasury and receipts", async () => {
    const seed2 = machineSeed("second");
    const [config2] = PublicKey.findProgramAddressSync([CONFIG_SEED, seed2], program.programId);
    const treasury2 = getAssociatedTokenAddressSync(usdcMint, config2, true);
    const payout2 = Keypair.generate();
    const sig = await conn.requestAirdrop(payout2.publicKey, 2e9);
    await conn.confirmTransaction(sig);

    await program.methods
      .initialize(Array.from(seed2), payout2.publicKey, USDC(10_000))
      .accounts({
        authority: admin.publicKey,
        config: config2,
        usdcMint,
        treasuryToken: treasury2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await mintTo(conn, admin, usdcMint, treasury2, admin, USDC(100).toNumber());

    // The first machine's payout key cannot pay from the second treasury.
    const ref = pullRef("pull_xyz"); // already bought back on machine one
    let threw = false;
    try {
      await program.methods
        .buyback(Array.from(ref), USDC(5))
        .accounts({
          payoutAuthority: payoutAuthority.publicKey,
          config: config2,
          receipt: receiptPdaFor(config2, ref),
          treasuryToken: treasury2,
          playerToken: playerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payoutAuthority])
        .rpc();
    } catch {
      threw = true;
    }
    assert.isTrue(threw, "machine one's payout key must not pay from machine two");

    // The second machine's own key can, and its receipt space is its own:
    // the same pull_ref that is spent on machine one is fresh here.
    const before = (await getAccount(conn, playerAta)).amount;
    await program.methods
      .buyback(Array.from(ref), USDC(5))
      .accounts({
        payoutAuthority: payout2.publicKey,
        config: config2,
        receipt: receiptPdaFor(config2, ref),
        treasuryToken: treasury2,
        playerToken: playerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payout2])
      .rpc();
    const after = (await getAccount(conn, playerAta)).amount;
    assert.equal(Number(after - before), USDC(5).toNumber(), "machine two paid from its own treasury");

    // Machine one's treasury is untouched by machine two's payout.
    const t1 = (await getAccount(conn, treasuryAta)).amount;
    assert.equal(Number(t1), USDC(500 + 39 - 63 - 10).toNumber());
  });
});
