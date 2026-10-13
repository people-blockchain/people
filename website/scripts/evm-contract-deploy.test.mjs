// Regression for the /create/contract deploy path: it must build a normal EVM
// contract-creation tx (bytecode in `data`, no `to`) instead of signing a legacy factory tx
// for the compat endpoint that answers 405 use_evm_wallet on chain 97401. These cover the
// tx-building and receipt-parsing helpers the wizard signs with.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAddress } from "viem";
import {
  buildContractDeployTx,
  contractAddressFromReceipt,
  classifyContractDeployError,
} from "../src/lib/evm/contract-deploy.ts";

const DEPLOYED = "0x0e259a8df9facdc8c0d2efedc10cf15f273d42d1";

test("deploy tx puts bytecode in data with no `to` and zero value", () => {
  const tx = buildContractDeployTx({ data: "60806040" });
  assert.equal(tx.data, "0x60806040");
  assert.equal(tx.value, BigInt(0));
  // A creation tx must not carry a `to` field, or it targets an address instead.
  assert.equal("to" in tx, false);
});

test("deploy tx keeps an existing 0x prefix and honours an explicit value", () => {
  assert.equal(buildContractDeployTx({ data: "0xdeadbeef" }).data, "0xdeadbeef");
  assert.equal(buildContractDeployTx({ data: "0xabc", value: BigInt(5) }).value, BigInt(5));
});

test("deployed address is decoded from a creation receipt", () => {
  assert.equal(contractAddressFromReceipt({ contractAddress: DEPLOYED }), getAddress(DEPLOYED));
  // No address (a plain call/cancel receipt) and a malformed one both yield null.
  assert.equal(contractAddressFromReceipt({ contractAddress: null }), null);
  assert.equal(contractAddressFromReceipt({}), null);
  assert.equal(contractAddressFromReceipt(null), null);
  assert.equal(contractAddressFromReceipt({ contractAddress: "0x1234" }), null);
});

test("deploy errors are classified into actionable codes", () => {
  assert.equal(classifyContractDeployError(new Error("User rejected the request.")).code, "wallet_rejected");
  assert.equal(classifyContractDeployError(new Error("insufficient funds for gas * price + value")).code, "insufficient_funds");
  assert.equal(classifyContractDeployError(new Error("execution reverted")).code, "reverted");
  const unknown = classifyContractDeployError(new Error("boom"));
  assert.equal(unknown.code, "unknown");
  assert.equal(unknown.detail, "boom");
});

test("viem shortMessage is preferred for the human-readable detail", () => {
  const err = Object.assign(new Error("long viem dump"), { shortMessage: "User denied transaction signature." });
  const { code, detail } = classifyContractDeployError(err);
  assert.equal(code, "wallet_rejected");
  assert.equal(detail, "User denied transaction signature.");
});

// E2E-M1: the two legacy compat reads must not fire on the EVM chain, where the compat layer
// only implements `contracts/<address>` and answers 404 for anything else.
test("E2E-M1: ContractWizard only fetches contracts/params off the EVM chain", async () => {
  const src = await readFile(new URL("../src/components/contract/ContractWizard.tsx", import.meta.url), "utf8");
  const guard = src.indexOf("isCosmosEvmChain()");
  const fetch = src.indexOf('networkJson<Params>("contracts/params")');
  assert.ok(guard > -1, "the wizard must gate the legacy params fetch");
  assert.ok(fetch > -1, "the legacy params fetch is still present for the legacy chain");
  assert.ok(guard < fetch, "the EVM guard must run before the params fetch");
});

test("E2E-M1: ContractList only fetches the legacy contracts index off the EVM chain", async () => {
  const src = await readFile(new URL("../src/components/explorer/ContractList.tsx", import.meta.url), "utf8");
  const guard = src.indexOf("isCosmosEvmChain()");
  const fetch = src.indexOf('networkJson<typeof items>("contracts")');
  assert.ok(guard > -1, "the list must gate the legacy contracts fetch");
  assert.ok(fetch > -1, "the legacy contracts fetch is still present for the legacy chain");
  assert.ok(guard < fetch, "the EVM guard must run before the contracts fetch");
});
