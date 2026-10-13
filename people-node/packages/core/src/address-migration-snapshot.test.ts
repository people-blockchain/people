import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import {
  applyEvmAddressMigration,
  evmAddressFromPublicKey,
  legacyAddressFromPublicKey,
  resolveAccountStorageKey
} from "./address-policy.js";
import { keyPairFromPrivateKey, signTransaction } from "./crypto.js";
import type { ChainState } from "./index.js";

describe("legacy DATA_DIR-style snapshot migration", () => {
  test("merges persisted legacy account after pubkey appears on chain", async () => {
    const fixturePath = fileURLToPath(
      new URL("../test-fixtures/legacy-chain-snapshot.json", import.meta.url)
    );
    const raw = JSON.parse(await readFile(fixturePath, "utf8")) as {
      chainState: ChainState;
    };
    const state = raw.chainState;
    const key = keyPairFromPrivateKey(
      "0000000000000000000000000000000000000000000000000000000000000042"
    );
    const legacy = legacyAddressFromPublicKey(key.publicKey).toLowerCase();
    state.accounts[legacy] = { balance: 12.5, balances: { ppl: 12.5 }, nonce: 1 };

    const tx = signTransaction(key.privateKey, {
      id: "snapshot-tx",
      from: key.address,
      to: key.address,
      amount: 0,
      fee: 0,
      nonce: 1,
      timestamp: 2,
      type: "registerParticipant"
    });
    tx.from = legacy;
    state.chain.push({
      header: {
        height: 1,
        previousHash: state.chain[0]!.hash,
        stateRoot: "stub",
        chainId: state.networkConfig?.chainId ?? "people-internal-testnet",
        protocolVersion: 2,
        proposer: "bootstrap-validator",
        timestamp: 2
      },
      transactions: [tx],
      hash: "block-snapshot-1"
    });

    applyEvmAddressMigration(state);
    const canonical = evmAddressFromPublicKey(key.publicKey).toLowerCase();
    expect(state.accounts[legacy]).toBeUndefined();
    expect(state.accounts[canonical]?.balance).toBe(12.5);
    expect(resolveAccountStorageKey(state, legacy)).toBe(canonical);
  });
});
