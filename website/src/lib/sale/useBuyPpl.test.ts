import assert from "node:assert/strict";
import test from "node:test";

import {
  assertReceiptSuccess,
  buyWithArgs,
  classifyBuyError,
  evaluatePreflight,
  executeBuy,
  minOutWithSlippage,
  toUsd6,
  type BuyClients,
  type PreflightState,
} from "./useBuyPpl.ts";

test("minPplOut is 99% of the quoted amount", () => {
  assert.equal(minOutWithSlippage(BigInt(1_000_000)), BigInt(990_000));
});

test("a rejected signature maps to txRejected without throwing", () => {
  assert.equal(classifyBuyError({ code: 4001 }).reason, "txRejected");
  assert.equal(classifyBuyError({ name: "UserRejectedRequestError" }).reason, "txRejected");
});

test("slippage and limit reverts get their own messages", () => {
  assert.equal(classifyBuyError({ message: "execution reverted: minOut" }).reason, "priceMoved");
  assert.equal(classifyBuyError({ message: "reverted: cooldown active" }).reason, "limit");
  const other = classifyBuyError({ message: "x".repeat(300) });
  assert.equal(other.reason, "txFailed");
  assert.equal(other.detail?.length, 120);
});

test("a reverted receipt is an error, a successful one passes", () => {
  assert.throws(() => assertReceiptSuccess({ status: "reverted" }));
  assert.doesNotThrow(() => assertReceiptSuccess({ status: "success" }));
});

test("buyWith gets the connected wallet as recipient", () => {
  const account = "0x00000000000000000000000000000000000000a1";
  const token = "0x00000000000000000000000000000000000000b2";
  assert.deepEqual(buyWithArgs({ account, token }, BigInt(100), BigInt(99)), [token, BigInt(100), BigInt(99), account]);
});

const HUB = "0x00000000000000000000000000000000000000c3";
const TREASURY = "0x00000000000000000000000000000000000000d4";
const ACCOUNT = "0x00000000000000000000000000000000000000a1";
const TOKEN = "0x00000000000000000000000000000000000000b2";

function state(over: Partial<PreflightState> = {}): PreflightState {
  return {
    now: BigInt(1_000_000),
    openedAt: BigInt(900_000),
    closesAt: BigInt(900_000 + 730 * 86400),
    graduated: false,
    paused: false,
    treasury: TREASURY,
    tokenAllowed: true,
    requestedUsd6: BigInt(100e6),
    minBuyUsd6: BigInt(10e6),
    maxBuyUsd6: BigInt(500e6),
    dailyCapUsd6: BigInt(2000e6),
    dailyUsedUsd6: BigInt(0),
    remainingRaiseUsd6: BigInt(4_000_000e6),
    nextBuyAt: BigInt(0),
    quotedPpl: BigInt(1e18),
    ...over,
  };
}

test("toUsd6 mirrors the hub for 6, 18 and 2 decimals", () => {
  assert.equal(toUsd6(BigInt(100_000_000), 6), BigInt(100_000_000));
  assert.equal(toUsd6(BigInt(100) * BigInt(10) ** BigInt(18), 18), BigInt(100_000_000));
  assert.equal(toUsd6(BigInt(10_000), 2), BigInt(100_000_000));
});

test("preflight passes for a normal purchase", () => {
  assert.equal(evaluatePreflight({ account: ACCOUNT }, state()), null);
});

test("preflight reports every allowance-independent failure", () => {
  const acc = { account: ACCOUNT } as const;
  assert.equal(evaluatePreflight(acc, state({ openedAt: BigInt(0) }))?.detail, "sale_not_open");
  assert.equal(evaluatePreflight(acc, state({ paused: true }))?.detail, "sale_paused");
  assert.equal(evaluatePreflight(acc, state({ graduated: true }))?.detail, "sold_out");
  assert.equal(evaluatePreflight(acc, state({ now: BigInt(900_000 + 730 * 86400) }))?.detail, "sale_ended");
  assert.equal(evaluatePreflight(acc, state({ tokenAllowed: false }))?.detail, "token_not_allowed");
  assert.equal(evaluatePreflight(acc, state({ requestedUsd6: BigInt(9e6) }))?.reason, "limit");
  assert.equal(evaluatePreflight(acc, state({ requestedUsd6: BigInt(501e6) }))?.reason, "limit");
  assert.equal(evaluatePreflight(acc, state({ nextBuyAt: BigInt(1_000_001) }))?.reason, "limit");
  assert.equal(evaluatePreflight(acc, state({ dailyUsedUsd6: BigInt(1950e6) }))?.reason, "limit");
  assert.equal(evaluatePreflight(acc, state({ quotedPpl: BigInt(0) }))?.reason, "priceMoved");
});

test("preflight: the daily cap counts only the partial-fill remainder; a cooldown that has passed is fine", () => {
  const acc = { account: ACCOUNT } as const;
  assert.equal(evaluatePreflight(acc, state({ dailyUsedUsd6: BigInt(1950e6), remainingRaiseUsd6: BigInt(50e6) })), null);
  assert.equal(evaluatePreflight(acc, state({ nextBuyAt: BigInt(1_000_000) })), null);
});

test("preflight rejects the treasury as payer/recipient (hub would revert TransferMismatch)", () => {
  const failure = evaluatePreflight({ account: TREASURY.toUpperCase().replace("0X", "0x") as `0x${string}` }, state());
  assert.deepEqual(failure, { reason: "txFailed", detail: "treasury_address" });
});

type Call = string;

/** Fake clients that record the order of calls and answer from `st`. */
function fakeClients(calls: Call[], opts: { st?: Partial<PreflightState>; allowance?: bigint; simulateError?: Error } = {}) {
  const st = state(opts.st);
  const hubReads: Record<string, unknown> = {
    openedAt: st.openedAt,
    closesAt: st.closesAt,
    graduated: st.graduated,
    paused: st.paused,
    treasury: st.treasury,
    tokenInfo: [st.tokenAllowed, 6],
    MIN_BUY_USD6: st.minBuyUsd6,
    MAX_BUY_USD6: st.maxBuyUsd6,
    DAILY_CAP_USD6: st.dailyCapUsd6,
    dailyUsed: st.dailyUsedUsd6,
    remainingRaiseUsd6: st.remainingRaiseUsd6,
    nextBuyAt: st.nextBuyAt,
    quoteBuy: st.quotedPpl,
  };
  const publicClient = {
    getBlock: async () => ({ timestamp: st.now }),
    readContract: async (a: { functionName: string }) => {
      calls.push(`read:${a.functionName}`);
      if (a.functionName === "decimals") return 6;
      if (a.functionName === "allowance") return opts.allowance ?? BigInt(0);
      return hubReads[a.functionName];
    },
    simulateContract: async (a: { functionName: string }) => {
      calls.push(`simulate:${a.functionName}`);
      if (opts.simulateError) throw opts.simulateError;
      return { request: { functionName: a.functionName } };
    },
    waitForTransactionReceipt: async () => {
      calls.push("receipt");
      return { status: "success", logs: [] };
    },
  };
  const walletClient = {
    writeContract: async (a: { functionName: string }) => {
      calls.push(`write:${a.functionName}`);
      return "0xabc";
    },
  };
  return { publicClient, walletClient } as unknown as BuyClients;
}

const params = { provider: {} as never, account: ACCOUNT as `0x${string}`, token: TOKEN as `0x${string}`, amountUsd: 100 };
const idx = (calls: Call[], name: string) => calls.indexOf(name);

test("flow order: quote and checks → approve → simulate buyWith → buyWith", async () => {
  const calls: Call[] = [];
  const result = await executeBuy(fakeClients(calls), HUB, params, () => {});
  assert.equal(result.step, "done");
  assert.ok(idx(calls, "read:quoteBuy") >= 0);
  assert.ok(idx(calls, "read:quoteBuy") < idx(calls, "write:approve"));
  assert.ok(idx(calls, "read:nextBuyAt") < idx(calls, "write:approve"));
  assert.ok(idx(calls, "write:approve") < idx(calls, "simulate:buyWith"));
  assert.ok(idx(calls, "simulate:buyWith") < idx(calls, "write:buyWith"));
});

test("flow: no approval when the allowance is already enough", async () => {
  const calls: Call[] = [];
  await executeBuy(fakeClients(calls, { allowance: BigInt(100e6) }), HUB, params, () => {});
  assert.equal(idx(calls, "write:approve"), -1);
  assert.ok(idx(calls, "simulate:buyWith") < idx(calls, "write:buyWith"));
});

test("flow: a failed pre-check never asks for an approval", async () => {
  for (const st of [{ paused: true }, { tokenAllowed: false }, { nextBuyAt: BigInt(2_000_000) }, { treasury: ACCOUNT as `0x${string}` }]) {
    const calls: Call[] = [];
    const result = await executeBuy(fakeClients(calls, { st }), HUB, params, () => {});
    assert.equal(result.step, "error", Object.keys(st).join());
    assert.ok(!calls.some((c) => c.startsWith("write:") || c.startsWith("simulate:")), Object.keys(st).join());
  }
});

test("flow: a failed simulation stops before buyWith is sent, after the approval", async () => {
  const calls: Call[] = [];
  const result = await executeBuy(fakeClients(calls, { simulateError: new Error("reverted: Slippage") }), HUB, params, () => {});
  assert.deepEqual(result, { step: "error", reason: "priceMoved", detail: undefined });
  assert.ok(idx(calls, "write:approve") >= 0);
  assert.equal(idx(calls, "write:buyWith"), -1);
});
