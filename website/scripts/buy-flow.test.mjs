#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  BuyFlowError,
  DEFAULT_SLIPPAGE_BPS,
  isSaleClosed,
  mapBuyError,
  minOutFromQuote,
  planBuyAmount,
} from "../src/lib/sale/buy-math.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");

test("minOut is the on-chain quote minus 1% by default, floored", () => {
  assert.equal(DEFAULT_SLIPPAGE_BPS, 100);
  assert.equal(minOutFromQuote(1_000_000n), 990_000n);
  assert.equal(minOutFromQuote(101n), 99n);
  assert.equal(minOutFromQuote(1_000_000n, 50), 995_000n);
  assert.equal(minOutFromQuote(1_000_000n, 0), 1_000_000n);
  assert.equal(minOutFromQuote(1_000_000n, 10_000), 0n);
  assert.equal(minOutFromQuote(0n), 0n);
  assert.equal(minOutFromQuote(-5n), 0n);
});

test("buy amount is min(balance, requested, per-buy cap, daily remainder)", () => {
  const base = { requested6: 200_000_000n, balance6: 200_000_000n, maxPerBuy6: 500_000_000n, remainingDaily6: 2_000_000_000n };
  assert.deepEqual(planBuyAmount(base), { amount6: 200_000_000n, limitedBy: "requested", leftover6: 0n });

  // Bridge fees: less arrived than requested.
  const fees = planBuyAmount({ ...base, balance6: 198_500_000n });
  assert.equal(fees.amount6, 198_500_000n);
  assert.equal(fees.limitedBy, "balance");
  assert.equal(fees.leftover6, 0n);

  // More than the per-buy cap: spend the cap, keep the rest in the wallet.
  const capped = planBuyAmount({ ...base, requested6: 800_000_000n, balance6: 790_000_000n });
  assert.equal(capped.amount6, 500_000_000n);
  assert.equal(capped.limitedBy, "perBuy");
  assert.equal(capped.leftover6, 290_000_000n);

  const daily = planBuyAmount({ ...base, remainingDaily6: 50_000_000n, balance6: 300_000_000n });
  assert.equal(daily.amount6, 50_000_000n);
  assert.equal(daily.limitedBy, "daily");
  assert.equal(daily.leftover6, 250_000_000n);

  assert.equal(planBuyAmount({ ...base, balance6: 0n }).amount6, 0n);
});

test("sale is closed when finalized, sold out, or past closesAt", () => {
  const open = { finalized: false, soldOut: false, closesAt: 2_000n, nowSec: 1_999 };
  assert.equal(isSaleClosed(open), false);
  assert.equal(isSaleClosed({ ...open, nowSec: 2_000 }), true);
  assert.equal(isSaleClosed({ ...open, finalized: true }), true);
  assert.equal(isSaleClosed({ ...open, soldOut: true }), true);
  assert.equal(isSaleClosed({ ...open, closesAt: 0n, nowSec: 9_999_999 }), false);
});

const named = (errorName, args = []) => ({
  name: "ContractFunctionExecutionError",
  cause: { name: "ContractFunctionRevertedError", data: { errorName, args } },
});

test("mapBuyError maps named contract errors", () => {
  assert.deepEqual(mapBuyError(named("SoldOut")), { code: "soldOut" });
  assert.equal(mapBuyError(named("WindowOver")).code, "closed");
  assert.equal(mapBuyError(named("CurveClosed")).code, "closed");
  assert.equal(mapBuyError(named("NotOpen")).code, "notOpen");
  assert.equal(mapBuyError(named("OverPerBuyLimit", [600n, 500n])).code, "perBuyLimit");
  assert.equal(mapBuyError(named("OverDailyLimit", [600n, 100n])).code, "dailyLimit");
  assert.equal(mapBuyError(named("NotVerified", ["0x0"])).code, "notVerified");
  assert.equal(mapBuyError(named("Slippage")).code, "slippage");
  assert.equal(mapBuyError(named("EnforcedPause")).code, "paused");
  assert.equal(mapBuyError(named("DustTrade")).code, "generic");
});

test("mapBuyError reports seconds left for CooldownActive", () => {
  assert.deepEqual(mapBuyError(named("CooldownActive", [1_060n]), 1_000), { code: "cooldown", waitSec: 60 });
  assert.equal(mapBuyError(named("CooldownActive", [999n]), 1_000).waitSec, 1);
});

test("mapBuyError handles wallet rejection, balance and gas failures", () => {
  assert.equal(mapBuyError({ code: 4001, message: "x" }).code, "rejected");
  assert.equal(mapBuyError({ cause: { code: 4001 } }).code, "rejected");
  assert.equal(mapBuyError(new Error("User rejected the request.")).code, "rejected");
  assert.equal(mapBuyError(new Error("ERC20: transfer amount exceeds balance")).code, "insufficient");
  assert.equal(mapBuyError(new Error("insufficient funds for gas * price + value")).code, "noGas");
  assert.equal(mapBuyError(new Error("boom")).code, "generic");
  assert.equal(mapBuyError("weird").code, "generic");
  assert.deepEqual(mapBuyError(new BuyFlowError("noGas")), { code: "noGas", waitSec: undefined });
});

test("mapBuyError falls back to the revert text when no decoded name is present", () => {
  assert.equal(mapBuyError(new Error("execution reverted: Error: SoldOut()")).code, "soldOut");
});

test("hub ABI declares every custom error of the contract", () => {
  const abi = readFileSync(join(root, "src/lib/sale/hub-abi.ts"), "utf8");
  for (const name of [
    "ZeroAddress", "AlreadyOpened", "NotOpen", "WindowOver", "CurveClosed", "NotFinalizable", "SoldOut",
    "OverPerBuyLimit", "OverDailyLimit", "CooldownActive", "NotVerified", "InsufficientCredit", "StillHeld",
    "Slippage", "DustTrade", "InvalidLimits", "StableDecimalsTooLow", "StableNotAccepted", "NotALocker",
    "NotOracle", "RescueRestricted", "NothingQueued", "QueueNotReady", "AlreadyProcessed", "NotQueueOperator",
    "QueueExpired", "QueueFull", "OracleOverCallLimit", "OracleOverDailyLimit", "EnforcedPause",
  ]) {
    assert.match(abi, new RegExp(`"error ${name}\\(`), name);
  }
});

test("every buy locale defines the purchase error and terms copy", () => {
  const keys = [
    "errorCooldownWait", "errorSoldOut", "errorNotVerified", "errorSlippage", "errorPaused", "errorNoGas",
    "endedTitle", "endedSub", "ctaWorking", "waitingFunds", "leftoverNote", "saleTermsLine",
  ];
  const files = readdirSync(surfaces).filter((f) => /^buy-[a-z]{2}\.json$/.test(f));
  assert.equal(files.length, 12);
  for (const file of files) {
    const form = JSON.parse(readFileSync(join(surfaces, file), "utf8")).form;
    for (const key of keys) assert.ok(typeof form[key] === "string" && form[key].length > 0, `${file} ${key}`);
    assert.match(form.errorCooldownWait, /\{seconds\}/, file);
    assert.match(form.leftoverNote, /\{amount\}/, file);
    assert.equal(form.networkNames.tron, "Tron", file);
    assert.doesNotMatch(JSON.stringify(form), /graduat|\$4M|\b180\b/i, file);
  }
});
