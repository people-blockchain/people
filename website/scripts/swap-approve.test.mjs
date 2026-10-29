import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureAllowance, SwapApproveError } from "../src/lib/evm/swap-approve.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const ROUTER = "0x3333333333333333333333333333333333333333";
const HASH = `0x${"ab".repeat(32)}`;

function mockClient({ allowances, receipt = { status: "success" }, waitError }) {
  const calls = [];
  const queue = [...allowances];
  return {
    calls,
    readContract: async () => {
      calls.push("allowance");
      return queue.length > 1 ? queue.shift() : queue[0];
    },
    waitForTransactionReceipt: async () => {
      calls.push("wait");
      if (waitError) throw new Error("timeout");
      return receipt;
    },
  };
}

const base = (client, sendApprove) => ({ client, token: TOKEN, owner: OWNER, spender: ROUTER, amount: 100n, sendApprove });

test("enough allowance: no approve is sent", async () => {
  const client = mockClient({ allowances: [100n] });
  let sent = 0;
  const out = await ensureAllowance(base(client, async () => { sent += 1; return HASH; }));
  assert.deepEqual(out, { approved: false });
  assert.equal(sent, 0);
});

test("approve → wait for receipt → re-read allowance, in that order", async () => {
  const client = mockClient({ allowances: [0n, 100n] });
  const order = [];
  const out = await ensureAllowance(base(client, async () => { order.push("approve"); client.calls.push("approve"); return HASH; }));
  assert.deepEqual(out, { approved: true });
  assert.deepEqual(client.calls, ["allowance", "approve", "wait", "allowance"]);
});

test("reverted approve receipt stops the swap", async () => {
  const client = mockClient({ allowances: [0n], receipt: { status: "reverted" } });
  await assert.rejects(ensureAllowance(base(client, async () => HASH)), (e) => e instanceof SwapApproveError && e.code === "approve_reverted");
});

test("receipt timeout stops the swap", async () => {
  const client = mockClient({ allowances: [0n], waitError: true });
  await assert.rejects(ensureAllowance(base(client, async () => HASH)), (e) => e instanceof SwapApproveError && e.code === "approve_timeout");
});

test("successful receipt but allowance still too low stops the swap", async () => {
  const client = mockClient({ allowances: [0n, 50n] });
  await assert.rejects(ensureAllowance(base(client, async () => HASH)), (e) => e instanceof SwapApproveError && e.code === "allowance_low");
});

test("approve send failure (preflight) propagates and nothing is awaited", async () => {
  const client = mockClient({ allowances: [0n] });
  await assert.rejects(ensureAllowance(base(client, async () => { throw new Error("preflight"); })), /preflight/);
  assert.ok(!client.calls.includes("wait"));
});

test("EvmSwapApp swaps tokens only through ensureAllowance", () => {
  const src = readFileSync(join(root, "src/components/swap/EvmSwapApp.tsx"), "utf8");
  const i = src.indexOf("await ensureAllowance(");
  const j = src.indexOf('functionName: "swapExactTokensForETH"');
  assert.ok(i > 0 && j > i, "swap must come after the awaited allowance step");
  assert.equal((src.match(/functionName: "approve"/g) ?? []).length, 1);
});

test("swap copy has approve strings in all locales", () => {
  for (const l of ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"]) {
    const d = JSON.parse(readFileSync(join(root, `src/lib/locales/surfaces/swap-${l}.json`), "utf8"));
    for (const k of ["approving", "approveReverted", "approveTimeout", "allowanceLow"]) assert.ok(d[k]?.length > 3, `${l}.${k}`);
  }
});
