import assert from "node:assert/strict";
import test from "node:test";

import { decodeFunctionData } from "viem";

import { PPL_CURVE_HUB_V2_ABI } from "../src/lib/sale/v2/abi.ts";
import {
  HUB_BUY_GAS_LIMIT,
  LIFI_BASE_EXECUTOR,
  SOURCE_CHAINS,
  buildContractCallsRequest,
  encodeHubBuy,
  executedToAmountUsd6,
  fetchLifiStatus,
  fetchOneTxQuote,
  sourceToken,
  statusPhase,
  supportsDestinationCall,
  validateOneTxQuote,
} from "../src/lib/sale/v2/lifi-route.ts";
import { isV2OneTxEnabled, twoStepBuyAmountUsd6, usdcBalanceDelta } from "../src/lib/sale/v2/logic.ts";

const BUYER = "0x658c32072B56A61Df4d6c0d91DcC42960E5dD70A";
const HUB = "0x1111111111111111111111111111111111111111";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";
const usd6 = (n) => BigInt(Math.round(n * 1_000_000));

const params = {
  fromChain: 56,
  fromToken: BSC_USDT,
  account: BUYER,
  hub: HUB,
  usdc: USDC,
  usdcIn: usd6(100),
  minPplOut: BigInt("990000000000000000000"),
};

/** Shape of a real `/quote/contractCalls` answer (BSC USDT -> Across -> Base Executor -> hub.buy). */
function mockQuote(overrides = {}) {
  const callData = encodeHubBuy({ usdcIn: params.usdcIn, minPplOut: params.minPplOut, recipient: BUYER });
  return {
    tool: "across",
    action: { fromChainId: 56, toChainId: 8453, fromAddress: BUYER, fromToken: { address: BSC_USDT, symbol: "USDT", decimals: 18 } },
    estimate: {
      fromAmount: "101250000000000000000",
      approvalAddress: DIAMOND,
      executionDuration: 31,
      feeCosts: [{ amountUSD: "0.25" }, { amountUSD: "0.01" }],
      gasCosts: [{ amountUSD: "0.05" }],
    },
    includedSteps: [
      { type: "protocol", tool: "feeCollection", action: { fromChainId: 56, toChainId: 56 } },
      {
        type: "cross",
        tool: "across",
        action: { fromChainId: 56, toChainId: 8453, toAddress: "0x33b255b5db44A78c34381f89f1a454bc0Ef49871", toToken: { address: USDC } },
        estimate: { toAmount: "100500000", toAmountMin: "100500000" },
      },
      {
        type: "custom",
        tool: "custom",
        action: {
          fromChainId: 8453,
          toChainId: 8453,
          fromAddress: LIFI_BASE_EXECUTOR,
          toAddress: LIFI_BASE_EXECUTOR,
          toContractAddress: HUB,
          toContractCallData: callData,
        },
        estimate: { toAmount: "0", toAmountMin: "0" },
      },
    ],
    transactionRequest: { to: DIAMOND, data: "0xdeadbeef", value: "0x0", chainId: 56 },
    ...overrides,
  };
}

test("balance delta: only real increases count", () => {
  assert.equal(usdcBalanceDelta(usd6(5), usd6(104.98)), usd6(99.98));
  assert.equal(usdcBalanceDelta(usd6(5), usd6(5)), BigInt(0));
  assert.equal(usdcBalanceDelta(usd6(5), usd6(4)), BigInt(0));
  assert.equal(usdcBalanceDelta(null, usd6(4)), BigInt(0));
  assert.equal(usdcBalanceDelta(usd6(1), null), BigInt(0));
});

test("two-step buy uses the delta, not the typed amount (SPEC 12.1)", () => {
  // Typed 100, LI.FI delivered 98.42: the buy must be 98.42.
  assert.equal(twoStepBuyAmountUsd6({ deltaUsd6: usd6(98.42) }), usd6(98.42));
  // Unrelated USDC arrived in the meantime: never spend more than LI.FI delivered.
  assert.equal(twoStepBuyAmountUsd6({ deltaUsd6: usd6(150), deliveredUsd6: usd6(98.42) }), usd6(98.42));
  // Delivered amount unknown or zero: the delta alone decides.
  assert.equal(twoStepBuyAmountUsd6({ deltaUsd6: usd6(98.42), deliveredUsd6: null }), usd6(98.42));
  assert.equal(twoStepBuyAmountUsd6({ deltaUsd6: usd6(98.42), deliveredUsd6: BigInt(0) }), usd6(98.42));
  // Capped at the per-purchase maximum.
  assert.equal(twoStepBuyAmountUsd6({ deltaUsd6: usd6(900) }), usd6(500));
  assert.equal(twoStepBuyAmountUsd6({ deltaUsd6: BigInt(0) }), null);
});

test("executed LI.FI amount is read from the last step only", () => {
  assert.equal(executedToAmountUsd6({ steps: [{ execution: { toAmount: "1" } }, { execution: { toAmount: "1968638" } }] }), BigInt(1968638));
  assert.equal(executedToAmountUsd6({ steps: [] }), null);
  assert.equal(executedToAmountUsd6(undefined), null);
  assert.equal(executedToAmountUsd6({ steps: [{ execution: {} }] }), null);
});

test("destination calls: EVM sources yes, Solana and Tron fall back to two-step", () => {
  for (const id of [1, 56, 137, 42161, 10, 43114, 8453]) assert.equal(supportsDestinationCall(id), true, String(id));
  assert.equal(supportsDestinationCall(1151111081099710), false);
  assert.equal(supportsDestinationCall(728126428), false);
  assert.equal(supportsDestinationCall(999), false);
  assert.equal(SOURCE_CHAINS.filter((c) => !c.destinationCall).map((c) => c.key).join(","), "sol,trn");
  assert.equal(sourceToken(56, "USDT")?.decimals, 18);
  assert.equal(sourceToken(8453, "USDC"), null);
});

test("route request: toAmount equals the typed USDC, buy goes to the buyer, refunds to the buyer", () => {
  const req = buildContractCallsRequest(params);
  assert.equal(req.toChain, 8453);
  assert.equal(req.toToken, USDC);
  assert.equal(req.toAmount, "100000000");
  assert.equal(req.toFallbackAddress, BUYER);
  assert.equal(req.integrator, "PEOPLE");
  assert.equal(req.contractCalls.length, 1);
  const [call] = req.contractCalls;
  assert.equal(call.fromAmount, "100000000");
  assert.equal(call.fromTokenAddress, USDC);
  assert.equal(call.toContractAddress, HUB);
  assert.equal(call.toApprovalAddress, HUB);
  assert.equal(call.toContractGasLimit, String(HUB_BUY_GAS_LIMIT));
  const decoded = decodeFunctionData({ abi: PPL_CURVE_HUB_V2_ABI, data: call.toContractCallData });
  assert.equal(decoded.functionName, "buy");
  assert.deepEqual(decoded.args, [usd6(100), params.minPplOut, BUYER, "0x0000000000000000000000000000000000000000"]);
});

test("route request refuses Solana/Tron sources and bad input", () => {
  assert.throws(() => buildContractCallsRequest({ ...params, fromChain: 1151111081099710 }), /unsupportedSourceChain/);
  assert.throws(() => buildContractCallsRequest({ ...params, fromChain: 728126428 }), /unsupportedSourceChain/);
  assert.throws(() => buildContractCallsRequest({ ...params, usdcIn: BigInt(0) }), /badAmount/);
  assert.throws(() => buildContractCallsRequest({ ...params, minPplOut: BigInt(0) }), /badMinPplOut/);
  assert.throws(() => buildContractCallsRequest({ ...params, hub: "0x123" }), /badAddress/);
});

test("quote validation accepts a matching route and summarises it", () => {
  const check = validateOneTxQuote(mockQuote(), params);
  assert.equal(check.ok, true);
  assert.equal(check.summary.fromAmount, BigInt("101250000000000000000"));
  assert.equal(check.summary.fromDecimals, 18);
  assert.equal(check.summary.minReceivedUsd6, BigInt(100500000));
  assert.equal(check.summary.approvalAddress, DIAMOND);
  assert.equal(check.summary.crossChain, true);
  assert.ok(Math.abs(check.summary.feesUsd - 0.31) < 1e-9);
  assert.equal(check.summary.tx.to, DIAMOND);
});

test("quote validation refuses anything that would not buy exactly what was asked", () => {
  const q = mockQuote();
  const custom = (patch) => {
    const copy = structuredClone(q);
    Object.assign(copy.includedSteps[2].action, patch);
    return copy;
  };
  const feeder = (patch) => {
    const copy = structuredClone(q);
    Object.assign(copy.includedSteps[1].estimate, patch);
    return copy;
  };
  const reason = (quote) => {
    const r = validateOneTxQuote(quote, params);
    return r.ok ? "ok" : r.reason;
  };
  assert.equal(reason(custom({ fromAddress: DIAMOND })), "unexpectedCaller");
  assert.equal(reason(custom({ toContractAddress: USDC })), "wrongTarget");
  assert.equal(
    reason(custom({ toContractCallData: encodeHubBuy({ usdcIn: params.usdcIn, minPplOut: BigInt(1), recipient: BUYER }) })),
    "wrongCalldata",
  );
  assert.equal(
    reason(custom({ toContractCallData: encodeHubBuy({ usdcIn: params.usdcIn, minPplOut: params.minPplOut, recipient: HUB }) })),
    "wrongCalldata",
  );
  assert.equal(reason(feeder({ toAmountMin: "99999999" })), "minBelowBuy");
  assert.equal(reason({ ...q, includedSteps: q.includedSteps.slice(0, 2) }), "noContractCall");
  assert.equal(reason({ ...q, transactionRequest: undefined }), "noTransaction");
  assert.equal(reason({ ...q, transactionRequest: { ...q.transactionRequest, chainId: 1 } }), "wrongSourceChain");
  assert.equal(reason({ ...q, action: { ...q.action, fromAddress: HUB } }), "wrongSender");
  assert.equal(reason({ ...q, action: { ...q.action, fromToken: { address: USDC } } }), "wrongSourceToken");
  assert.equal(reason({ ...q, estimate: { ...q.estimate, fromAmount: "0" } }), "noFromAmount");
});

test("quote fetch posts to /quote/contractCalls and surfaces LI.FI errors (mocked)", async () => {
  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => mockQuote() };
  };
  const body = buildContractCallsRequest(params);
  const quote = await fetchOneTxQuote(body, { fetchImpl: okFetch });
  assert.equal(calls[0].url, "https://li.quest/v1/quote/contractCalls");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(JSON.parse(calls[0].init.body).toAmount, "100000000");
  assert.equal(validateOneTxQuote(quote, params).ok, true);

  const failFetch = async () => ({
    ok: false,
    status: 422,
    json: async () => ({ message: "Contract calls are not supported for non-EVM chains yet", code: 1004 }),
  });
  await assert.rejects(fetchOneTxQuote(body, { fetchImpl: failFetch }), /noRoute: Contract calls are not supported/);
});

test("status polling: DONE/FAILED settle, everything else keeps waiting (mocked)", async () => {
  let seen = "";
  const status = await fetchLifiStatus(
    { txHash: "0xabc", fromChain: 56, bridge: "across" },
    {
      fetchImpl: async (url) => {
        seen = url;
        return { ok: true, status: 200, json: async () => ({ status: "DONE", substatus: "COMPLETED", receiving: { txHash: "0xdef" } }) };
      },
    },
  );
  assert.match(seen, /status\?txHash=0xabc&fromChain=56&toChain=8453&bridge=across/);
  assert.equal(statusPhase(status), "settled");
  assert.equal(statusPhase({ status: "FAILED" }), "settled");
  assert.equal(statusPhase({ status: "PENDING" }), "pending");
  assert.equal(statusPhase({ status: "NOT_FOUND" }), "pending");
  const down = await fetchLifiStatus({ txHash: "0x1", fromChain: 1 }, { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  assert.equal(statusPhase(down), "pending");
});

test("one-signature flag is off by default", () => {
  assert.equal(isV2OneTxEnabled({}), false);
  assert.equal(isV2OneTxEnabled({ NEXT_PUBLIC_PPL_V2_ONE_TX_ENABLED: "1" }), true);
});

test("buyable preview state is bound on-chain with no purchase or partial", async () => {
  const { previewSnapshot, parseV2PreviewState } = await import("../src/lib/sale/v2/logic.ts");
  assert.equal(parseV2PreviewState("buyable"), "buyable");
  const snap = previewSnapshot("buyable");
  assert.ok(snap.personId);
  assert.equal(snap.purchase, null);
  assert.equal(snap.partial, null);
});
