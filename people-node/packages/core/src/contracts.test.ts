import { describe, expect, test } from "vitest";
import {
  DEFAULT_CONFIG,
  applyTransaction,
  bytesToHex,
  computeStateRoot,
  createInitialState,
  DEFAULT_TX_GAS_LIMIT,
  ensureAccount,
  generateKeyPair,
  hexToBytes,
  MAX_TX_GAS_LIMIT,
  NATIVE_ASSET_ID,
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  contractGasPricePpl,
  quoteContractFeePpl,
  TYPICAL_CONTRACT_DEPLOY_FEE_PPL,
  TYPICAL_CONTRACT_DEPLOY_GAS,
  signTransaction,
  staticContractCall,
  wrapRuntimeAsDeploy
} from "./index.js";

function fund(state: ReturnType<typeof createInitialState>, address: string, amount: number): void {
  const account = ensureAccount(state, address);
  account.balance = amount;
  account.balances[NATIVE_ASSET_ID] = amount;
}

/** Runtime: return 32-byte word 42. */
const RETURN_42 = hexToBytes("0x602a60005260206000f3");
/** Runtime: LOG0 of 32 zero bytes from mem. */
const LOG_RUNTIME = hexToBytes("0x60206000a0");

describe("EVM contracts", () => {
  test("pre-existing non-canonical account key cannot zero the canonical balance (M12-1)", async () => {
    const aliases = (a: string) => ["0xzz" + a.slice(2), "0x" + a.slice(2).toUpperCase()];
    for (const pick of [0, 1]) {
      const state = createInitialState();
      const victim = generateKeyPair();
      const user = generateKeyPair();
      fund(state, victim.address, 5000);
      fund(state, user.address, 100);
      const key = aliases(victim.address)[pick]!;
      // Legacy chain state: non-canonical key already present with zero balance.
      state.accounts[key] = { balance: 0, balances: { [NATIVE_ASSET_ID]: 0 }, nonce: 0 };
      const deploy = signTransaction(user.privateKey, {
        id: `m12-deploy-${pick}`, from: user.address, to: "0x0000000000000000000000000000000000000000",
        amount: 0, fee: quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT), nonce: 0, timestamp: 1,
        type: "contractDeploy",
        payload: { bytecode: bytesToHex(wrapRuntimeAsDeploy(RETURN_42)), gasLimit: DEFAULT_TX_GAS_LIMIT }
      });
      await applyTransaction(state, deploy, DEFAULT_CONFIG);
      expect(Object.keys(state.contracts).length).toBe(1);
      expect(state.accounts[victim.address]!.balance).toBe(5000);
      expect(state.accounts[key]!.balance).toBe(0);
      expect(Object.keys(state.accounts).filter((k) => !/^0x[0-9a-f]{40}$/.test(k))).toEqual([key]);
    }
  });

  test("non-hex account key does not break contract execution; failed receipt is stored (M12-2)", async () => {
    const state = createInitialState();
    const user = generateKeyPair();
    fund(state, user.address, 200);
    // An nftTransfer to a non-hex recipient could leave such a key in legacy state.
    state.accounts["not-an-address"] = { balance: 0, balances: { [NATIVE_ASSET_ID]: 0 }, nonce: 0 };

    const deploy = signTransaction(user.privateKey, {
      id: "m12-2-deploy", from: user.address, to: "0x0000000000000000000000000000000000000000",
      amount: 0, fee: quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT), nonce: 0, timestamp: 1,
      type: "contractDeploy",
      payload: { bytecode: bytesToHex(wrapRuntimeAsDeploy(RETURN_42)), gasLimit: DEFAULT_TX_GAS_LIMIT }
    });
    await applyTransaction(state, deploy, DEFAULT_CONFIG);
    expect(state.contractReceipts!["m12-2-deploy"]!.status).toBe(1);
    expect(Object.keys(state.contracts).length).toBe(1);

    // Calling a plain account is not a contract call: the receipt must still be persisted.
    const call = signTransaction(user.privateKey, {
      id: "m12-2-call", from: user.address, to: generateKeyPair().address,
      amount: 0, fee: quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT), nonce: 1, timestamp: 2,
      type: "contractCall",
      payload: { data: "0x", gasLimit: DEFAULT_TX_GAS_LIMIT }
    });
    await applyTransaction(state, call, DEFAULT_CONFIG);
    const failed = state.contractReceipts!["m12-2-call"];
    expect(failed).toBeDefined();
    expect(failed!.status).toBe(0);
    expect(failed!.error).toContain("Not a contract");
  });

  test("contractDeploy stores code and contractCall returns data", async () => {
    const state = createInitialState();
    const user = generateKeyPair();
    fund(state, user.address, 100);
    const bytecode = bytesToHex(wrapRuntimeAsDeploy(RETURN_42));
    const fee = quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT);
    const deploy = signTransaction(user.privateKey, {
      id: "deploy-1",
      from: user.address,
      to: "0x0000000000000000000000000000000000000000",
      amount: 0,
      fee,
      nonce: 0,
      timestamp: 1,
      type: "contractDeploy",
      payload: { bytecode, gasLimit: DEFAULT_TX_GAS_LIMIT }
    });
    await applyTransaction(state, deploy, DEFAULT_CONFIG);
    const created = Object.keys(state.contracts)[0];
    expect(created).toMatch(/^0x[0-9a-f]{40}$/);
    expect(state.contracts[created]!.code.startsWith("0x")).toBe(true);
    expect(state.accounts[user.address]!.balance).toBeLessThan(100);

    const call = signTransaction(user.privateKey, {
      id: "call-1",
      from: user.address,
      to: created!,
      amount: 0,
      fee: quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT),
      nonce: 1,
      timestamp: 2,
      type: "contractCall",
      payload: { data: "0x", gasLimit: DEFAULT_TX_GAS_LIMIT }
    });
    await applyTransaction(state, call, DEFAULT_CONFIG);
    const receipt = state.contractReceipts?.["call-1"];
    expect(receipt?.status).toBe(1);
    expect(receipt?.returnData).toBe("0x" + "00".repeat(31) + "2a");
  });

  test("stateRoot is deterministic across two independent nodes", async () => {
    const a = createInitialState();
    const b = createInitialState();
    const user = generateKeyPair();
    fund(a, user.address, 80);
    fund(b, user.address, 80);
    const bytecode = bytesToHex(wrapRuntimeAsDeploy(RETURN_42));
    const fee = quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT);
    const deploy = signTransaction(user.privateKey, {
      id: "deploy-det",
      from: user.address,
      to: "0x0000000000000000000000000000000000000000",
      amount: 0,
      fee,
      nonce: 0,
      timestamp: 10,
      type: "contractDeploy",
      payload: { bytecode, gasLimit: DEFAULT_TX_GAS_LIMIT }
    });
    await applyTransaction(a, deploy, DEFAULT_CONFIG);
    await applyTransaction(b, deploy, DEFAULT_CONFIG);
    expect(computeStateRoot(a)).toBe(computeStateRoot(b));
    expect(Object.keys(a.contracts)).toEqual(Object.keys(b.contracts));
  });

  test("rejects deploy when prepaid gas fee exceeds PPL balance", async () => {
    const state = createInitialState();
    const user = generateKeyPair();
    fund(state, user.address, 0.000001);
    const fee = quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT);
    expect(fee).toBeGreaterThan(0.000001);
    const deploy = signTransaction(user.privateKey, {
      id: "deploy-poor",
      from: user.address,
      to: "0x0000000000000000000000000000000000000000",
      amount: 0,
      fee,
      nonce: 0,
      timestamp: 1,
      type: "contractDeploy",
      payload: {
        bytecode: bytesToHex(wrapRuntimeAsDeploy(RETURN_42)),
        gasLimit: DEFAULT_TX_GAS_LIMIT
      }
    });
    await expect(applyTransaction(state, deploy, DEFAULT_CONFIG)).rejects.toThrow(/Insufficient balance/);
  });

  test("rejects gasLimit above the per-transaction cap", async () => {
    const state = createInitialState();
    const user = generateKeyPair();
    fund(state, user.address, 100);
    const deploy = signTransaction(user.privateKey, {
      id: "deploy-gas",
      from: user.address,
      to: "0x0000000000000000000000000000000000000000",
      amount: 0,
      fee: 10,
      nonce: 0,
      timestamp: 1,
      type: "contractDeploy",
      payload: {
        bytecode: bytesToHex(wrapRuntimeAsDeploy(RETURN_42)),
        gasLimit: MAX_TX_GAS_LIMIT + 1
      }
    });
    await expect(applyTransaction(state, deploy, DEFAULT_CONFIG)).rejects.toThrow(/gasLimit exceeds maximum/);
  });

  test("emits logs and eth_call reads without mutating state", async () => {
    const state = createInitialState();
    const user = generateKeyPair();
    fund(state, user.address, 100);
    const bytecode = bytesToHex(wrapRuntimeAsDeploy(LOG_RUNTIME));
    await applyTransaction(
      state,
      signTransaction(user.privateKey, {
        id: "deploy-log",
        from: user.address,
        to: "0x0000000000000000000000000000000000000000",
        amount: 0,
        fee: quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT),
        nonce: 0,
        timestamp: 1,
        type: "contractDeploy",
        payload: { bytecode, gasLimit: DEFAULT_TX_GAS_LIMIT }
      }),
      DEFAULT_CONFIG
    );
    const created = Object.keys(state.contracts)[0]!;
    await applyTransaction(
      state,
      signTransaction(user.privateKey, {
        id: "call-log",
        from: user.address,
        to: created,
        amount: 0,
        fee: quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT),
        nonce: 1,
        timestamp: 2,
        type: "contractCall",
        payload: { data: "0x", gasLimit: DEFAULT_TX_GAS_LIMIT }
      }),
      DEFAULT_CONFIG
    );
    expect(state.contractReceipts?.["call-log"]?.logs.length).toBe(1);
    const root = computeStateRoot(state);
    const view = await staticContractCall(state, user.address, created, "0x");
    // LOG0 is rejected in static eth_call (Shanghai); the clone must not mutate stateRoot.
    expect(view.status).toBe(0);
    expect(computeStateRoot(state)).toBe(root);
  });

  test("out-of-gas deploy keeps prepaid PPL fee and does not store code", async () => {
    const state = createInitialState();
    const user = generateKeyPair();
    fund(state, user.address, 100);
    const bytecode = "0x5b600056";
    const gasLimit = 80_000;
    const fee = quoteContractFeePpl(gasLimit);
    const before = state.accounts[user.address]!.balance;
    await applyTransaction(
      state,
      signTransaction(user.privateKey, {
        id: "deploy-oog",
        from: user.address,
        to: "0x0000000000000000000000000000000000000000",
        amount: 0,
        fee,
        nonce: 0,
        timestamp: 1,
        type: "contractDeploy",
        payload: { bytecode, gasLimit }
      }),
      DEFAULT_CONFIG
    );
    expect(state.accounts[user.address]!.balance).toBeCloseTo(before - fee, 8);
    expect(state.accounts[user.address]!.nonce).toBe(1);
    const receipt = state.contractReceipts?.["deploy-oog"];
    expect(receipt?.status).toBe(0);
    expect(Object.keys(state.contracts ?? {})).toHaveLength(0);
  });

  test("owner-approved contract gas price and typical deploy quote", async () => {
    expect(contractGasPricePpl()).toBe(APPROVED_CONTRACT_GAS_PRICE_PPL);
    expect(APPROVED_CONTRACT_GAS_PRICE_PPL).toBe(8.7e-7);
    expect(quoteContractFeePpl(TYPICAL_CONTRACT_DEPLOY_GAS)).toBe(TYPICAL_CONTRACT_DEPLOY_FEE_PPL);
    expect(TYPICAL_CONTRACT_DEPLOY_FEE_PPL).toBe(1.044);
  });

  test("computeStateRoot is independent of accounts map insertion order", () => {
    const a = createInitialState();
    const b = createInitialState();
    const addrA = "0x" + "aa".repeat(20);
    const addrB = "0x" + "bb".repeat(20);
    fund(a, addrA, 1);
    fund(a, addrB, 2);
    fund(b, addrB, 2);
    fund(b, addrA, 1);
    expect(computeStateRoot(a)).toBe(computeStateRoot(b));
  });
});
