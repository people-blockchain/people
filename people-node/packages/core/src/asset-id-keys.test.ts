import { describe, expect, test } from "vitest";
import {
  DEFAULT_CONFIG,
  DEFAULT_TRANSFER_FEE,
  NATIVE_ASSET_ID,
  applyTransaction,
  createInitialState,
  enqueueTransaction,
  ensureAccount,
  generateKeyPair,
  isValidAssetId,
  ownGet,
  registerAsset,
  signTransaction
} from "./index.js";
import { assertLoadableBalances } from "./storage.js";

/**
 * M04-1: asset ids inherited from `Object.prototype` must never be usable as
 * assets, and no balance may become `NaN`, a string or negative — a snapshot
 * round-trip through JSON would otherwise make nodes disagree.
 */

/**
 * Asset ids are normalized to lower case, so only the lower-case members of
 * `Object.prototype` can ever collide: `constructor` and `__proto__`.
 * `toString`/`valueOf` normalize to ordinary ids (`tostring`, `valueof`).
 */
const INHERITED_IDS = ["constructor", "__proto__"];

function fund(state: ReturnType<typeof createInitialState>, address: string, amount: number): void {
  const account = ensureAccount(state, address);
  account.balance = amount;
  account.balances[NATIVE_ASSET_ID] = amount;
}

describe("asset id keys (M04-1)", () => {
  test("isValidAssetId rejects inherited object keys", () => {
    for (const id of INHERITED_IDS) {
      expect(isValidAssetId(id)).toBe(false);
    }
    expect(isValidAssetId("_proto")).toBe(false);
    // Mixed-case prototype members normalize to ordinary ids, which is fine.
    expect(isValidAssetId("toString")).toBe(true);
    expect(isValidAssetId("-abc")).toBe(false);
    expect(isValidAssetId("tppl")).toBe(true);
    expect(isValidAssetId("t0-ken_1")).toBe(true);
  });

  test("ownGet ignores inherited keys", () => {
    const map: Record<string, number> = { ppl: 1 };
    expect(ownGet(map, "ppl")).toBe(1);
    for (const id of INHERITED_IDS) {
      expect(ownGet(map, id)).toBeUndefined();
    }
  });

  test("registerAsset refuses an inherited asset id", () => {
    const state = createInitialState();
    for (const id of INHERITED_IDS) {
      expect(() =>
        registerAsset(state, {
          assetId: id,
          type: "user",
          name: "Bad",
          symbol: "BAD",
          decimals: 6,
          totalSupply: 1000,
          creator: "genesis",
          status: "active"
        })
      ).toThrow(/Invalid asset ID/);
    }
  });

  test("transfer of an inherited assetId is rejected in mempool and in a block", async () => {
    for (const id of INHERITED_IDS) {
      const state = createInitialState();
      const sender = generateKeyPair();
      const recipient = generateKeyPair();
      fund(state, sender.address, 100);
      const tx = signTransaction(sender.privateKey, {
        id: `m04-1-${id}`,
        from: sender.address,
        to: recipient.address,
        amount: 1000,
        fee: DEFAULT_TRANSFER_FEE,
        nonce: 0,
        timestamp: 1,
        type: "transfer",
        assetId: id
      });
      expect(() => enqueueTransaction(state, tx)).toThrow(/Asset not found|Invalid asset ID/);
      await expect(
        (async () => applyTransaction(state, tx, DEFAULT_CONFIG))()
      ).rejects.toThrow(/Asset not found|Invalid asset ID/);
      // No side effects: the sender keeps the full balance and nonce 0.
      expect(state.accounts[sender.address]!.balance).toBe(100);
      expect(state.accounts[sender.address]!.nonce).toBe(0);
      expect(Object.hasOwn(state.accounts[sender.address]!.balances, id)).toBe(false);
      expect(Object.hasOwn(state.assets, id)).toBe(false);
    }
  });

  test("a JSON round-trip of token transfers does not change how the next block is valued", async () => {
    const build = async () => {
      const state = createInitialState();
      const sender = generateKeyPair();
      const recipient = generateKeyPair();
      fund(state, sender.address, 100);
      registerAsset(state, {
        assetId: "tdemo",
        type: "user",
        name: "Demo",
        symbol: "TDEMO",
        decimals: 6,
        totalSupply: 1_000_000,
        creator: sender.address,
        status: "active"
      });
      state.accounts[sender.address]!.balances.tdemo = 5_000;
      for (let n = 0; n < 2; n += 1) {
        const tx = signTransaction(sender.privateKey, {
          id: `m04-1-ok-${n}`,
          from: sender.address,
          to: recipient.address,
          amount: 100,
          fee: DEFAULT_TRANSFER_FEE,
          nonce: n,
          timestamp: 10 + n,
          type: "transfer",
          assetId: "tdemo"
        });
        await applyTransaction(state, tx, DEFAULT_CONFIG);
      }
      return { state, sender, recipient };
    };

    const direct = await build();
    const restarted = JSON.parse(JSON.stringify(direct.state)) as typeof direct.state;
    expect(restarted.accounts[direct.sender.address]!.balances.tdemo).toBe(
      direct.state.accounts[direct.sender.address]!.balances.tdemo
    );
    expect(restarted.accounts[direct.recipient.address]!.balances.tdemo).toBe(200);
    // Nothing in the persisted balances is NaN/null after the JSON round-trip.
    for (const account of Object.values(restarted.accounts)) {
      for (const amount of Object.values(account.balances)) {
        expect(Number.isFinite(amount)).toBe(true);
      }
    }
    expect(() => assertLoadableBalances(restarted.accounts)).not.toThrow();
  });

  test("snapshot load refuses unusable balance keys and non-numeric amounts", () => {
    expect(() =>
      assertLoadableBalances({ "0xabc": { balance: 1, balances: { ppl: 1, constructor: 5 } } })
    ).toThrow(/unusable balance key/);
    expect(() =>
      assertLoadableBalances({ "0xabc": { balance: 1, balances: { ppl: 1, tdemo: null as unknown as number } } })
    ).toThrow(/non-numeric balance/);
    expect(() =>
      assertLoadableBalances({ "0xabc": { balance: 1, balances: { ppl: 1, tdemo: -5 } } })
    ).toThrow(/non-numeric balance/);
    expect(() => assertLoadableBalances({ "0xabc": { balance: 1, balances: { ppl: 1, tdemo: 7 } } })).not.toThrow();
  });
});
