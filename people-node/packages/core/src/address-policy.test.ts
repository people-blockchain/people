import { describe, expect, test } from "vitest";
import {
  applyEvmAddressMigration,
  addressesForPublicKey,
  evmAddressFromPublicKey,
  legacyAddressFromPublicKey,
  resolveAccountStorageKey
} from "./address-policy.js";
import * as secp from "@noble/secp256k1";
import { generateKeyPair, signTransaction, verifyTransaction } from "./crypto.js";
import { createInitialState, DEFAULT_CONFIG } from "./index.js";

describe("address policy 0a", () => {
  test("legacy and canonical differ for same key", () => {
    const key = generateKeyPair();
    const { legacy, canonical } = addressesForPublicKey(key.publicKey);
    expect(legacy).not.toBe(canonical);
    expect(key.address).toBe(legacy);
  });

  test("migration merges legacy balance to canonical using chain history", () => {
    const key = generateKeyPair();
    const legacy = legacyAddressFromPublicKey(key.publicKey).toLowerCase();
    const canonical = evmAddressFromPublicKey(key.publicKey).toLowerCase();
    const state = createInitialState();
    state.accounts[legacy] = { balance: 5, balances: { ppl: 5 }, nonce: 0 };

    const tx = signTransaction(key.privateKey, {
      id: "mig-tx-1",
      from: key.address,
      to: key.address,
      amount: 0,
      fee: 0,
      nonce: 0,
      timestamp: 1,
      type: "registerParticipant"
    });
    tx.from = legacy;
    state.chain[0]!.transactions = [];
    state.chain.push({
      header: {
        height: 1,
        previousHash: state.chain[0]!.hash,
        stateRoot: "0",
        chainId: DEFAULT_CONFIG.chainId,
        protocolVersion: 2,
        proposer: "bootstrap-validator",
        timestamp: 1
      },
      transactions: [tx],
      hash: "block-1"
    });

    applyEvmAddressMigration(state);
    expect(state.legacyToCanonical?.[legacy]).toBe(canonical);
    expect(state.accounts[legacy]).toBeUndefined();
    expect(state.accounts[canonical]?.balance).toBe(5);
    expect(resolveAccountStorageKey(state, canonical)).toBe(canonical);
    expect(resolveAccountStorageKey(state, legacy)).toBe(canonical);
  });

  test("verify accepts legacy from with valid signature", () => {
    const key = generateKeyPair();
    const legacy = legacyAddressFromPublicKey(key.publicKey);
    const body = {
      id: "legacy-from",
      from: legacy,
      to: legacy,
      amount: 0,
      fee: 0,
      nonce: 0,
      timestamp: 1,
      type: "registerParticipant" as const,
      chainId: "ovn-devnet"
    };
    const publicKey = key.publicKey;
    const signature = secp.etc.bytesToHex(
      secp.sign(new TextEncoder().encode(JSON.stringify(body)), secp.etc.hexToBytes(key.privateKey))
    );
    expect(verifyTransaction({ ...body, publicKey, signature })).toBe(true);
  });
});
