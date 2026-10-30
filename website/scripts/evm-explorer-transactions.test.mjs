import { test } from "node:test";
import assert from "node:assert/strict";
import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";

const hash = "0x9e9f00d663b28272c9532f6562d751570658d7c275a4b6f3624d612a1453c5a9";
const from = "0x2697602e17815c110abc736374b5aff8b8e405b5";
const to = "0x74a50ac5ea07f86fc10f0ad0e543e9321b57eb8c";

test("transaction detail route returns the confirmed faucet transfer and actual gas fee", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const request = JSON.parse(init.body);
    calls.push(request);
    const result = request.method === "eth_getTransactionByHash"
      ? { hash, from, to, value: "0xde0b6b3a7640000", input: "0x", blockNumber: "0x27" }
      : { gasUsed: "0x5208", effectiveGasPrice: "0x5f7604" };
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  });
  const response = await handleEvmCompatGet(`transactions/${hash}`, new URLSearchParams());
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    id: hash, type: "transfer", from, to, amountWei: "1000000000000000000",
    feeWei: (21000n * 6256132n).toString(), blockHeight: 39,
  });
  assert.deepEqual(calls.map(({ method, params }) => ({ method, params })), [
    { method: "eth_getTransactionByHash", params: [hash] },
    { method: "eth_getTransactionReceipt", params: [hash] },
  ]);
});

test("transaction detail route returns 404 only when RPC has no transaction", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return Response.json({ jsonrpc: "2.0", id: 1, result: null });
  });
  assert.deepEqual(await handleEvmCompatGet(`transactions/${hash}`, new URLSearchParams()), {
    status: 404, body: { error: "not_found" },
  });
  assert.equal(count, 1);
});

test("invalid transaction hashes are rejected without an RPC request", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("RPC must not be called"); });
  for (const id of ["garbage", "0x1234", `0x${"g".repeat(64)}`]) {
    assert.deepEqual(await handleEvmCompatGet(`transactions/${id}`, new URLSearchParams()), {
      status: 400, body: { error: "invalid_transaction_hash" },
    });
  }
});

test("RPC failure is not reported as a missing transaction", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    return Response.json({ error: { message: "RPC unavailable" } }, { status: 503 });
  });
  await assert.rejects(handleEvmCompatGet(`transactions/${hash}`, new URLSearchParams()), /RPC unavailable/);
});
