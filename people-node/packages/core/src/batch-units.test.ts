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
  registerAsset,
  setAccountBalance,
  signTransaction
} from "./index.js";
import type { NetworkConfig } from "@ovn/protocol";

/**
 * M04-2 / M04-4: a batch transfer validated each leg with the per-transaction rules turned
 * off, so 0.5 + 0.5 token units summed to a legal integer total while crediting fractional
 * token balances, and native PPL legs were not held to the six decimal places every other
 * native path uses. Both fixes sit behind the security-upgrade height so historical blocks
 * that contain such transfers still validate.
 */

const TOKEN = "gold";

const upgradeConfig = (height: number): NetworkConfig => ({
  ...DEFAULT_CONFIG,
  securityUpgrade: { height, validatorAllowlist: [] }
});

function setup() {
  const config = upgradeConfig(1);
  const state = createInitialState(config);
  const user = generateKeyPair();
  const first = generateKeyPair();
  const second = generateKeyPair();
  const account = ensureAccount(state, user.address);
  account.balance = 1_000_000;
  account.balances[NATIVE_ASSET_ID] = 1_000_000;
  registerAsset(state, {
    assetId: TOKEN,
    type: "user",
    name: TOKEN,
    symbol: "GOLD",
    decimals: 6,
    totalSupply: 1_000_000_000_000,
    creator: user.address,
    status: "active"
  });
  setAccountBalance(account, TOKEN, 1_000);
  return { config, state, user, first, second };
}

function tokenBatch(
  user: { address: string; privateKey: string },
  recipients: { to: string; amount: number }[],
  id: string
) {
  return signTransaction(
    user.privateKey,
    {
      chainId: DEFAULT_CONFIG.chainId,
      id,
      from: user.address,
      to: "batch",
      amount: recipients.reduce((sum, item) => sum + item.amount, 0),
      fee: DEFAULT_TRANSFER_FEE,
      nonce: 0,
      timestamp: 1,
      type: "transfer",
      assetId: TOKEN,
      payload: { recipients }
    },
    true
  );
}

function nativeBatch(
  user: { address: string; privateKey: string },
  recipients: { to: string; amount: number }[],
  id: string
) {
  return signTransaction(
    user.privateKey,
    {
      chainId: DEFAULT_CONFIG.chainId,
      id,
      from: user.address,
      to: "batch",
      amount: recipients.reduce((sum, item) => sum + item.amount, 0),
      fee: DEFAULT_TRANSFER_FEE,
      nonce: 0,
      timestamp: 1,
      type: "transfer",
      payload: { recipients }
    },
    true
  );
}

describe("batch transfer units behind the security upgrade (M04-2, M04-4)", () => {
  test("token legs must be integer base units", () => {
    const { config, state, user, first, second } = setup();
    const tx = tokenBatch(user, [
      { to: first.address, amount: 0.5 },
      { to: second.address, amount: 0.5 }
    ], "batch-fractional");
    expect(() => applyTransaction(state, tx, config)).toThrow(/integer base unit/);
    expect(() => enqueueTransaction(state, tx)).toThrow(/integer base unit/);
    expect(state.accounts[first.address]).toBeUndefined();
    expect(state.accounts[user.address]!.nonce).toBe(0);
  });

  test("native legs must fit six decimal places", () => {
    const { config, state, user, first, second } = setup();
    const tx = nativeBatch(user, [
      { to: first.address, amount: 0.0000005 },
      { to: second.address, amount: 0.0000005 }
    ], "batch-subatom");
    expect(() => applyTransaction(state, tx, config)).toThrow(/six decimal places/);
    expect(state.accounts[user.address]!.nonce).toBe(0);
  });

  test("a single native transfer must also fit six decimal places", () => {
    const { config, state, user, first } = setup();
    const tx = signTransaction(user.privateKey, {
      chainId: DEFAULT_CONFIG.chainId,
      id: "single-subatom",
      from: user.address,
      to: first.address,
      amount: 1.0000001,
      fee: DEFAULT_TRANSFER_FEE,
      nonce: 0,
      timestamp: 1,
      type: "transfer"
    }, true);
    expect(() => applyTransaction(state, tx, config)).toThrow(/six decimal places/);
    expect(state.accounts[user.address]!.nonce).toBe(0);
  });

  test("legal batches still settle", () => {
    const { config, state, user, first, second } = setup();
    applyTransaction(state, tokenBatch(user, [
      { to: first.address, amount: 1 },
      { to: second.address, amount: 2 }
    ], "batch-ok"), config);
    expect(state.accounts[first.address]!.balances[TOKEN]).toBe(1);
    expect(state.accounts[second.address]!.balances[TOKEN]).toBe(2);

    const native = nativeBatch(
      { address: user.address, privateKey: user.privateKey },
      [{ to: first.address, amount: 0.5 }],
      "batch-native-ok"
    );
    const fresh = signTransaction(user.privateKey, { ...native, nonce: state.accounts[user.address]!.nonce }, true);
    applyTransaction(state, fresh, config);
    expect(state.accounts[first.address]!.balance).toBeCloseTo(0.5, 9);
  });

  test("below the upgrade height the previous behaviour is kept", () => {
    const legacy = { ...DEFAULT_CONFIG, securityUpgrade: { height: 50, validatorAllowlist: [] } };
    const state = createInitialState(legacy);
    const user = generateKeyPair();
    const first = generateKeyPair();
    const second = generateKeyPair();
    const account = ensureAccount(state, user.address);
    account.balance = 1_000_000;
    account.balances[NATIVE_ASSET_ID] = 1_000_000;
    registerAsset(state, {
      assetId: TOKEN,
      type: "user",
      name: TOKEN,
      symbol: "GOLD",
      decimals: 6,
      totalSupply: 1_000_000_000_000,
      creator: user.address,
      status: "active"
    });
    setAccountBalance(account, TOKEN, 1_000);

    applyTransaction(state, tokenBatch(user, [
      { to: first.address, amount: 0.5 },
      { to: second.address, amount: 0.5 }
    ], "batch-legacy"), legacy);
    expect(state.accounts[first.address]!.balances[TOKEN]).toBe(0.5);
  });

  test("without a security upgrade configured the previous behaviour is kept", () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const user = generateKeyPair();
    const first = generateKeyPair();
    const second = generateKeyPair();
    const account = ensureAccount(state, user.address);
    account.balance = 1_000_000;
    account.balances[NATIVE_ASSET_ID] = 1_000_000;
    registerAsset(state, {
      assetId: TOKEN,
      type: "user",
      name: TOKEN,
      symbol: "GOLD",
      decimals: 6,
      totalSupply: 1_000_000_000_000,
      creator: user.address,
      status: "active"
    });
    setAccountBalance(account, TOKEN, 1_000);

    applyTransaction(state, tokenBatch(user, [
      { to: first.address, amount: 0.5 },
      { to: second.address, amount: 0.5 }
    ], "batch-default"), DEFAULT_CONFIG);
    expect(state.accounts[first.address]!.balances[TOKEN]).toBe(0.5);
  });
});
