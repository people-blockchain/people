import { describe, expect, test } from "vitest";
import { APPROVED_CONTRACT_GAS_PRICE_PPL, DEFAULT_BLOCK_GAS_LIMIT } from "@ovn/protocol";
import { contractBlockGasLimit, contractGasPricePpl } from "./contract-fees.js";
import {
  DEFAULT_CONFIG,
  DEFAULT_TX_GAS_LIMIT,
  applyTransaction,
  buildBlock,
  createInitialState,
  enqueueTransaction,
  ensureAccount,
  generateKeyPair,
  hexToBytes,
  NATIVE_ASSET_ID,
  quoteContractFeePpl,
  signTransaction,
  tryApplyRemoteBlock,
  wrapRuntimeAsDeploy,
  bytesToHex
} from "./index.js";

const RETURN_42 = hexToBytes("0x602a60005260206000f3");

describe("contract-fees consensus constants", () => {
  test("ignores CONTRACT_GAS_PRICE_PPL and CONTRACT_BLOCK_GAS_LIMIT env", () => {
    process.env.CONTRACT_GAS_PRICE_PPL = "0.001";
    process.env.CONTRACT_BLOCK_GAS_LIMIT = "999";
    expect(contractGasPricePpl()).toBe(APPROVED_CONTRACT_GAS_PRICE_PPL);
    expect(contractBlockGasLimit()).toBe(DEFAULT_BLOCK_GAS_LIMIT);
    delete process.env.CONTRACT_GAS_PRICE_PPL;
    delete process.env.CONTRACT_BLOCK_GAS_LIMIT;
  });

  test("tryApplyRemoteBlock accepts contract block when env gas tariff differs", async () => {
    const origin = createInitialState();
    const user = generateKeyPair();
    const account = ensureAccount(origin, user.address);
    account.balance = 100;
    account.balances[NATIVE_ASSET_ID] = 100;
    const proposer = structuredClone(origin);
    const follower = structuredClone(origin);
    const bytecode = bytesToHex(wrapRuntimeAsDeploy(RETURN_42));
    const fee = quoteContractFeePpl(DEFAULT_TX_GAS_LIMIT);
    const deploy = signTransaction(user.privateKey, {
      id: "env-consensus-deploy",
      from: user.address,
      to: "0x0000000000000000000000000000000000000000",
      amount: 0,
      fee,
      nonce: 0,
      timestamp: 1,
      type: "contractDeploy",
      payload: { bytecode, gasLimit: DEFAULT_TX_GAS_LIMIT }
    });
    enqueueTransaction(proposer, deploy);
    const block = await buildBlock(proposer, "bootstrap-validator", DEFAULT_CONFIG);
    process.env.CONTRACT_GAS_PRICE_PPL = "0.001";
    expect(await tryApplyRemoteBlock(follower, block, DEFAULT_CONFIG)).toBe(true);
    delete process.env.CONTRACT_GAS_PRICE_PPL;
  });
});
