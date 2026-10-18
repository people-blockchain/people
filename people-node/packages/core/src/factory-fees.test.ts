import { afterEach, describe, expect, test } from "vitest";
import {
  DEFAULT_NFT_MINT_MIN_FEE,
  DEFAULT_TOKEN_CREATE_MIN_FEE,
  BATCH_FEE_BASE_PPL,
  BATCH_FEE_CAP_PPL,
  BATCH_FEE_PER_EXTRA_PPL,
  DEFAULT_TRANSFER_FEE_PPL,
  PROPOSED_TRANSFER_FEE_PPL,
  SOLANA_BASE_FEE_SOL,
  SOLANA_METAPLEX_CORE_NFT_SOL,
  SOLANA_SPL_MINT_RENT_SOL,
  solToPpl
} from "@people/protocol";
import {
  BATCH_FEE_BASE,
  BATCH_FEE_CAP,
  BATCH_FEE_PER_EXTRA,
  DEFAULT_CONFIG,
  DEFAULT_TRANSFER_FEE,
  applyNftMint,
  applyTransaction,
  createInitialState,
  enqueueTransaction,
  ensureAccount,
  generateKeyPair,
  nftMintMempoolMinFee,
  nftMintMinFee,
  NATIVE_ASSET_ID,
  signTransaction,
  tokenCreateMempoolMinFee,
  tokenCreateMinFee
} from "./index.js";

afterEach(() => {
  delete process.env.TOKEN_CREATE_MIN_FEE;
  delete process.env.NFT_MINT_MIN_FEE;
});

describe("Approved public PPL fees", () => {
  test("defaults match quoted Solana amounts converted at PPL 0.12 and SOL 117", () => {
    expect(DEFAULT_TOKEN_CREATE_MIN_FEE).toBe(solToPpl(SOLANA_SPL_MINT_RENT_SOL + SOLANA_BASE_FEE_SOL));
    expect(DEFAULT_NFT_MINT_MIN_FEE).toBe(solToPpl(SOLANA_METAPLEX_CORE_NFT_SOL));
    expect(DEFAULT_TRANSFER_FEE_PPL).toBe(solToPpl(SOLANA_BASE_FEE_SOL));
    expect(PROPOSED_TRANSFER_FEE_PPL).toBe(DEFAULT_TRANSFER_FEE_PPL);
    expect(DEFAULT_TOKEN_CREATE_MIN_FEE).toBe(1.045005);
    expect(DEFAULT_NFT_MINT_MIN_FEE).toBe(2.925);
    expect(DEFAULT_TRANSFER_FEE_PPL).toBe(0.004875);
    expect(DEFAULT_TRANSFER_FEE).toBe(0.004875);
    expect(BATCH_FEE_BASE_PPL).toBe(0.004875);
    expect(BATCH_FEE_PER_EXTRA_PPL).toBe(0.000244);
    expect(BATCH_FEE_CAP_PPL).toBe(0.024375);
  });

  test("batch defaults scale with the approved transfer fee", () => {
    expect(BATCH_FEE_BASE).toBe(DEFAULT_TRANSFER_FEE);
    expect(BATCH_FEE_PER_EXTRA).toBe(BATCH_FEE_PER_EXTRA_PPL);
    expect(BATCH_FEE_CAP).toBe(BATCH_FEE_CAP_PPL);
  });

  test("the env override only raises the local mempool floor, never the consensus minimum (M13-4)", () => {
    expect(tokenCreateMinFee()).toBe(DEFAULT_TOKEN_CREATE_MIN_FEE);
    expect(nftMintMinFee()).toBe(DEFAULT_NFT_MINT_MIN_FEE);
    expect(tokenCreateMempoolMinFee()).toBe(DEFAULT_TOKEN_CREATE_MIN_FEE);
    expect(nftMintMempoolMinFee()).toBe(DEFAULT_NFT_MINT_MIN_FEE);

    process.env.TOKEN_CREATE_MIN_FEE = "3";
    process.env.NFT_MINT_MIN_FEE = "4";
    expect(tokenCreateMempoolMinFee()).toBe(3);
    expect(nftMintMempoolMinFee()).toBe(4);
    // The apply path (and the genesis root that hashes these) is unmoved.
    expect(tokenCreateMinFee()).toBe(DEFAULT_TOKEN_CREATE_MIN_FEE);
    expect(nftMintMinFee()).toBe(DEFAULT_NFT_MINT_MIN_FEE);

    // A lower env value cannot drop the floor below the consensus minimum either.
    process.env.TOKEN_CREATE_MIN_FEE = "0.25";
    process.env.NFT_MINT_MIN_FEE = "0.5";
    expect(tokenCreateMempoolMinFee()).toBe(DEFAULT_TOKEN_CREATE_MIN_FEE);
    expect(nftMintMempoolMinFee()).toBe(DEFAULT_NFT_MINT_MIN_FEE);
  });

  test("a raised env floor keeps the cheap tokenCreate out of the mempool but not off the chain (M13-4)", () => {
    process.env.TOKEN_CREATE_MIN_FEE = "3";
    const state = createInitialState();
    const creator = generateKeyPair();
    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;
    const tx = signTransaction(creator.privateKey, {
      id: "low-launch",
      from: creator.address,
      to: creator.address,
      amount: 0,
      fee: 2,
      nonce: 0,
      timestamp: Date.now(),
      type: "tokenCreate",
      payload: {
        assetId: "low-fee-token",
        name: "Low Fee",
        symbol: "LOW",
        decimals: 6,
        totalSupply: 1_000_000_000_000
      }
    });
    // Rejected locally: this node will not relay it.
    expect(() => enqueueTransaction(state, tx)).toThrow(/Token launch fee is below the public tariff/);
    // But the block-apply rule is the constant, so the same fee is valid chain-wide.
    expect(() => applyTransaction(state, tx, DEFAULT_CONFIG)).not.toThrow();
    expect(state.accounts[creator.address]!.nonce).toBe(1);
  });

  test("rejects nftMint below the consensus minimum", () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;
    const tx = signTransaction(creator.privateKey, {
      id: "low-nft",
      from: creator.address,
      to: "nft",
      amount: 0,
      fee: 0,
      nonce: 0,
      timestamp: Date.now(),
      type: "nftMint",
      payload: { name: "CheapNft", imageUri: "https://example.com/n.png" }
    });
    expect(() => applyNftMint(state, tx, DEFAULT_CONFIG)).toThrow(
      `NFT mint requires at least ${DEFAULT_NFT_MINT_MIN_FEE} NATIVE fee`
    );
  });
});
