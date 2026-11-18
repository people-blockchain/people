import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, padHex } from "viem";

import { PPL_CURVE_HUB_V2_ABI } from "../src/lib/sale/v2/abi.ts";
import {
  HUB_BUY_GAS_LIMIT,
  HUB_VERIFY_AND_BUY_GAS_LIMIT,
  DIRECT_VERIFICATION_DEADLINE_SECONDS,
  ROUTED_VERIFICATION_DEADLINE_SECONDS,
  proofLeavesTime,
  verificationDeadlineSeconds,
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
  LIFI_DIAMOND,
  MAX_SOURCE_OVERPAY_BPS,
  checkSourceCalldata,
  receivingOutcome,
  sourceAmountWithinMargin,
  ROUTER_MIN_BUY_USD6,
  LIFI_ONE_TX_ABI,
  LIFI_BASE_RECEIVER_ACROSS_V4,
  LIFI_BASE_ERC20_PROXY,
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

const SWAP_DATA = {
  type: "tuple[]",
  components: [
    { name: "callTo", type: "address" },
    { name: "approveTo", type: "address" },
    { name: "sendingAssetId", type: "address" },
    { name: "receivingAssetId", type: "address" },
    { name: "fromAmount", type: "uint256" },
    { name: "callData", type: "bytes" },
    { name: "requiresDeposit", type: "bool" },
  ],
};

const word = (a) => padHex(a.toLowerCase(), { size: 32 });
const hubStep = (callData, over = {}) => ({ callTo: HUB, approveTo: HUB, sendingAssetId: USDC, receivingAssetId: USDC, fromAmount: BigInt(100500000), callData, requiresDeposit: true, ...over });

/**
 * Source tx calldata exactly as LI.FI builds it for Across: Diamond
 * `swapAndStartBridgeTokensViaAcrossV4(BridgeData, SwapData[], AcrossV4Data)` (or `startBridgeTokensViaAcrossV4`
 * without source swaps), with the ReceiverAcrossV4 message `(bytes32, SwapData[], address receiver)`.
 */
function mockSourceData({
  callData,
  receiver = BUYER,
  refund = BUYER,
  acrossRefund = BUYER,
  acrossReceiver = LIFI_BASE_RECEIVER_ACROSS_V4,
  receivingAssetId = USDC,
  destinationChainId = 8453,
  hasDestinationCall = true,
  steps,
  sourceSwaps,
  noSwap = false,
  outputAmount = BigInt(100500000),
}) {
  const txId = padHex("0x01", { size: 32 });
  const message = encodeAbiParameters(
    [{ type: "bytes32" }, SWAP_DATA, { type: "address" }],
    [txId, steps ?? [hubStep(callData)], refund],
  );
  const bridgeData = { transactionId: txId, bridge: "across", integrator: "PEOPLE", referrer: "0x0000000000000000000000000000000000000000", sendingAssetId: BSC_USDT, receiver, minAmount: BigInt(100500000), destinationChainId: BigInt(destinationChainId), hasSourceSwaps: !noSwap, hasDestinationCall };
  const acrossData = {
    receiverAddress: word(acrossReceiver),
    refundAddress: word(acrossRefund),
    sendingAssetId: word(BSC_USDT),
    receivingAssetId: word(receivingAssetId),
    outputAmount,
    outputAmountMultiplier: BigInt("1000000000000"),
    exclusiveRelayer: padHex("0x0", { size: 32 }),
    quoteTimestamp: 1795012055,
    fillDeadline: 1795021278,
    exclusivityParameter: 0,
    message,
  };
  if (noSwap) return encodeFunctionData({ abi: LIFI_ONE_TX_ABI, functionName: "startBridgeTokensViaAcrossV4", args: [bridgeData, acrossData] });
  const fee = { callTo: "0xDe2b920506EE931a6A2ABDF566526220214FBbAE", approveTo: "0xDe2b920506EE931a6A2ABDF566526220214FBbAE", sendingAssetId: BSC_USDT, receivingAssetId: BSC_USDT, fromAmount: BigInt("101250000000000000000"), callData: "0x332d746b", requiresDeposit: true };
  return encodeFunctionData({ abi: LIFI_ONE_TX_ABI, functionName: "swapAndStartBridgeTokensViaAcrossV4", args: [bridgeData, sourceSwaps ?? [fee], acrossData] });
}

/** Shape of a real `/quote/contractCalls` answer (BSC USDT -> Across -> Base Executor -> hub.buy). */
function mockQuote(overrides = {}, { verification, sourceData } = {}) {
  const callData = encodeHubBuy({ usdcIn: params.usdcIn, minPplOut: params.minPplOut, recipient: BUYER, verification });
  return {
    tool: "across",
    action: { fromChainId: 56, toChainId: 8453, fromAddress: BUYER, fromAmount: "101250000000000000000", fromToken: { address: BSC_USDT, symbol: "USDT", decimals: 18 } },
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
    transactionRequest: { to: DIAMOND, data: sourceData ?? mockSourceData({ callData }), value: "0x0", chainId: 56 },
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

const PROOF = {
  personId: "0x" + "ab".repeat(32),
  deadline: 1_800_000_000,
  signature: "0x" + "11".repeat(65),
};

test("new buyer: the destination call is verifyAndBuy with the attestation for the buyer", () => {
  const req = buildContractCallsRequest({ ...params, verification: PROOF });
  const [call] = req.contractCalls;
  assert.equal(call.toContractGasLimit, String(HUB_VERIFY_AND_BUY_GAS_LIMIT));
  const decoded = decodeFunctionData({ abi: PPL_CURVE_HUB_V2_ABI, data: call.toContractCallData });
  assert.equal(decoded.functionName, "verifyAndBuy");
  assert.deepEqual(decoded.args, [
    usd6(100),
    params.minPplOut,
    BUYER,
    "0x0000000000000000000000000000000000000000",
    PROOF.personId,
    BigInt(PROOF.deadline),
    PROOF.signature,
  ]);
  assert.throws(() => buildContractCallsRequest({ ...params, verification: { ...PROOF, personId: "0x12" } }), /badVerification/);
});

test("new buyer: quote validation requires verifyAndBuy calldata, plain buy is refused", () => {
  const withVerify = { ...params, verification: PROOF };
  const q = mockQuote({}, { verification: PROOF });
  assert.equal(validateOneTxQuote(q, withVerify).ok, true);
  // A plain buy for an unbound buyer would revert NotVerified on Base: refuse it up front.
  const plain = validateOneTxQuote(mockQuote(), withVerify);
  assert.equal(plain.ok, false);
  assert.equal(plain.reason, "wrongCalldata");
  // And an attestation for someone else is refused too.
  const other = structuredClone(q);
  other.includedSteps[2].action.toContractCallData = encodeHubBuy({
    usdcIn: params.usdcIn,
    minPplOut: params.minPplOut,
    recipient: BUYER,
    verification: { ...PROOF, personId: "0x" + "cd".repeat(32) },
  });
  assert.equal(validateOneTxQuote(other, withVerify).reason, "wrongCalldata");
});

test("attestation deadline: routed proofs live longer and must outlast the bridge", () => {
  assert.equal(verificationDeadlineSeconds(false), DIRECT_VERIFICATION_DEADLINE_SECONDS);
  assert.equal(verificationDeadlineSeconds(true), ROUTED_VERIFICATION_DEADLINE_SECONDS);
  assert.equal(DIRECT_VERIFICATION_DEADLINE_SECONDS, 15 * 60, "direct verify unchanged");
  const now = 1_000_000_000_000;
  const sec = now / 1000;
  assert.equal(proofLeavesTime(sec + 60 * 60, now, 30), true);
  assert.equal(proofLeavesTime(sec + 9 * 60, now, 30), false, "needs at least 10 minutes");
  assert.equal(proofLeavesTime(sec + 30 * 60, now, 20 * 60), false, "needs 3x the ETA");
  assert.equal(proofLeavesTime(sec - 1, now, 0), false);
});

test("M2: the source transaction itself is pinned: Diamond, no value, approval, amount margin", () => {
  assert.equal(LIFI_DIAMOND, DIAMOND);
  const q = mockQuote();
  const reason = (quote, p = params) => {
    const r = validateOneTxQuote(quote, p);
    return r.ok ? "ok" : r.reason;
  };
  assert.equal(reason(q), "ok");
  assert.equal(reason({ ...q, transactionRequest: { ...q.transactionRequest, to: HUB } }), "unexpectedTarget");
  assert.equal(reason({ ...q, transactionRequest: { ...q.transactionRequest, value: "1" } }), "unexpectedValue");
  assert.equal(reason({ ...q, transactionRequest: { ...q.transactionRequest, value: undefined } }), "ok");
  assert.equal(reason({ ...q, estimate: { ...q.estimate, approvalAddress: HUB } }), "unexpectedApproval");
  assert.equal(reason({ ...q, estimate: { ...q.estimate, approvalAddress: undefined } }), "unexpectedApproval");
  // fromAmount: 100 USDC asked, 18-decimals USDT source; margin 3%
  assert.equal(MAX_SOURCE_OVERPAY_BPS, 300);
  const amount = (raw) => ({ ...q, action: { ...q.action, fromAmount: raw }, estimate: { ...q.estimate, fromAmount: raw } });
  assert.equal(reason(amount("103000000000000000000")), "ok");
  assert.equal(reason(amount("103000000000000000001")), "overpay");
  // the amount the Diamond pulls must equal the amount shown and approved
  assert.equal(reason({ ...q, action: { ...q.action, fromAmount: "200000000000000000000" } }), "noFromAmount");
  assert.equal(sourceAmountWithinMargin(BigInt(10_300_000), 6, usd6(10)), true);
  assert.equal(sourceAmountWithinMargin(BigInt(10_300_001), 6, usd6(10)), false);
  // a source token we do not list is refused
  assert.equal(reason({ ...q, action: { ...q.action, fromToken: { address: HUB } } }, { ...params, fromToken: HUB }), "wrongSourceToken");
});

test("M2: receiver and refund receiver inside the source calldata must be the buyer", () => {
  const callData = encodeHubBuy({ usdcIn: params.usdcIn, minPplOut: params.minPplOut, recipient: BUYER });
  const other = "0x2222222222222222222222222222222222222222";
  assert.equal(checkSourceCalldata(mockSourceData({ callData }), params, callData), null);
  assert.equal(checkSourceCalldata(mockSourceData({ callData, receiver: other }), params, callData), "wrongReceiver");
  assert.equal(checkSourceCalldata(mockSourceData({ callData, refund: other }), params, callData), "wrongRefundReceiver");
  assert.equal(checkSourceCalldata(mockSourceData({ callData, destinationChainId: 10 }), params, callData), "wrongDestination");
  assert.equal(checkSourceCalldata(mockSourceData({ callData, hasDestinationCall: false }), params, callData), "noContractCall");
  const otherCall = encodeHubBuy({ usdcIn: params.usdcIn, minPplOut: BigInt(1), recipient: BUYER });
  assert.equal(checkSourceCalldata(mockSourceData({ callData: otherCall }), params, callData), "calldataMismatch");
  assert.equal(checkSourceCalldata("0xdeadbeef", params, callData), "unsupportedFacet");
  // via the validator: a quote whose tx pays leftovers/refunds elsewhere is refused
  const bad = mockQuote({}, { sourceData: mockSourceData({ callData, refund: other }) });
  assert.equal(validateOneTxQuote(bad, params).reason, "wrongRefundReceiver");
});

test("M2/LOW: the Across calldata is fully decoded, not searched (facet, positions, every receiver)", () => {
  const callData = encodeHubBuy({ usdcIn: params.usdcIn, minPplOut: params.minPplOut, recipient: BUYER });
  const other = "0x2222222222222222222222222222222222222222";
  const check = (opts) => checkSourceCalldata(mockSourceData({ callData, ...opts }), params, callData);
  // no source swap: startBridgeTokensViaAcrossV4 is decoded too; it must spend the buyer's token and deliver >= usdcIn
  assert.equal(checkSourceCalldata(mockSourceData({ callData, noSwap: true }), params, callData), null);
  assert.equal(check({ noSwap: true, outputAmount: params.usdcIn - BigInt(1) }), "minBelowBuy");
  // Across must deliver to LI.FI ReceiverAcrossV4 on Base, in Base USDC; source refunds go to the buyer
  assert.equal(check({ acrossReceiver: other }), "unexpectedBridgeReceiver");
  assert.equal(check({ acrossRefund: other }), "wrongRefundReceiver");
  assert.equal(check({ receivingAssetId: other }), "wrongDestinationToken");
  // the destination message: exactly one step, our hub, our USDC, enough USDC
  assert.equal(check({ steps: [hubStep(callData), hubStep(callData)] }), "wrongTarget");
  assert.equal(check({ steps: [hubStep(callData, { callTo: other })] }), "wrongTarget");
  assert.equal(check({ steps: [hubStep(callData, { approveTo: other })] }), "wrongTarget");
  assert.equal(check({ steps: [hubStep(callData, { sendingAssetId: other })] }), "wrongDestinationToken");
  assert.equal(check({ steps: [hubStep(callData, { fromAmount: params.usdcIn - BigInt(1) })] }), "minBelowBuy");
  // our hub calldata hidden elsewhere (a source swap) no longer satisfies the check: only the message counts
  const otherCall = encodeHubBuy({ usdcIn: params.usdcIn, minPplOut: BigInt(1), recipient: BUYER });
  const smuggle = { callTo: other, approveTo: other, sendingAssetId: BSC_USDT, receivingAssetId: BSC_USDT, fromAmount: BigInt(1), callData, requiresDeposit: true };
  assert.equal(check({ steps: [hubStep(otherCall)], sourceSwaps: [smuggle] }), "calldataMismatch");
  // the buyer's address appearing elsewhere (e.g. as a source swap target) does not stand in for the refund receiver
  const buyerSwap = { ...smuggle, callTo: BUYER, approveTo: BUYER, callData: "0x" };
  assert.equal(check({ refund: other, sourceSwaps: [buyerSwap] }), "wrongRefundReceiver");
  // source swaps must start from the buyer's token
  assert.equal(check({ sourceSwaps: [{ ...smuggle, sendingAssetId: other, callData: "0x" }] }), "wrongSourceToken");
  // unknown facets are refused, not guessed at: Stargate (seen on Avalanche), Base Executor used cross-chain, junk
  const good = mockSourceData({ callData });
  assert.equal(checkSourceCalldata(`0xa6010a66${good.slice(10)}`, params, callData), "unsupportedFacet");
  const exec = encodeFunctionData({ abi: LIFI_ONE_TX_ABI, functionName: "swapAndExecute", args: [padHex("0x01", { size: 32 }), [hubStep(callData)], BSC_USDT, BUYER, BigInt(1)] });
  assert.equal(checkSourceCalldata(exec, params, callData), "unsupportedFacet");
  // non-canonical encodings are refused: trailing bytes, dirty high bits in an address word
  assert.equal(checkSourceCalldata(`${good}${"00".repeat(32)}`, params, callData), "nonCanonicalCalldata");
  const receiverWord = BUYER.toLowerCase().slice(2).padStart(64, "0");
  const dirty = good.replace(receiverWord, `ff${receiverWord.slice(2)}`);
  assert.notEqual(dirty, good);
  assert.notEqual(checkSourceCalldata(dirty, params, callData), null);
  // a pointer moved off its canonical position (bridge string offset + 32) is refused
  const shifted = `${good.slice(0, 10)}${good.slice(10, 74)}${(BigInt(`0x${good.slice(74, 138)}`) + BigInt(32)).toString(16).padStart(64, "0")}${good.slice(138)}${"00".repeat(32)}`;
  assert.notEqual(checkSourceCalldata(shifted, params, callData), null);
});

test("M2/LOW: Base -> Base (Executor.swapAndExecute via ERC20Proxy) is decoded and pinned too", () => {
  const fx = JSON.parse(readFileSync(new URL("./fixtures/lifi-quote-base-usdt-swapandexecute.json", import.meta.url), "utf8"));
  const p = { ...fx.params, usdcIn: BigInt(fx.params.usdcIn), minPplOut: BigInt(fx.params.minPplOut) };
  const callData = fx.quote.includedSteps.at(-1).action.toContractCallData;
  const r = validateOneTxQuote(fx.quote, p);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.summary.tx.to, LIFI_BASE_EXECUTOR);
  assert.equal(r.summary.approvalAddress, LIFI_BASE_ERC20_PROXY, "approve the Executor's ERC20Proxy, never the Executor");
  assert.equal(r.summary.crossChain, false);
  const reason = (quote) => {
    const v = validateOneTxQuote(quote, p);
    return v.ok ? "ok" : v.reason;
  };
  const q = fx.quote;
  assert.equal(reason({ ...q, transactionRequest: { ...q.transactionRequest, to: DIAMOND } }), "unexpectedTarget");
  assert.equal(reason({ ...q, estimate: { ...q.estimate, approvalAddress: DIAMOND } }), "unexpectedApproval");
  assert.equal(reason({ ...q, estimate: { ...q.estimate, approvalAddress: LIFI_BASE_EXECUTOR } }), "unexpectedApproval");
  const d = decodeFunctionData({ abi: LIFI_ONE_TX_ABI, data: q.transactionRequest.data });
  assert.equal(d.functionName, "swapAndExecute");
  const [txId, swaps, asset, receiver, amount] = d.args;
  const enc = (args) => encodeFunctionData({ abi: LIFI_ONE_TX_ABI, functionName: "swapAndExecute", args });
  const fromAmount = BigInt(q.estimate.fromAmount);
  const other = "0x2222222222222222222222222222222222222222";
  assert.equal(checkSourceCalldata(enc([txId, swaps, asset, receiver, amount]), p, callData, fromAmount), null);
  assert.equal(checkSourceCalldata(enc([txId, swaps, asset, other, amount]), p, callData, fromAmount), "wrongReceiver");
  assert.equal(checkSourceCalldata(enc([txId, swaps, other, receiver, amount]), p, callData, fromAmount), "wrongSourceToken");
  assert.equal(checkSourceCalldata(enc([txId, swaps, asset, receiver, amount + BigInt(1)]), p, callData, fromAmount), "noFromAmount");
  // the hub call must be the final step, and the only one touching the hub
  assert.equal(checkSourceCalldata(enc([txId, swaps.slice(0, -1), asset, receiver, amount]), p, callData, fromAmount), "wrongTarget");
  assert.equal(checkSourceCalldata(enc([txId, [swaps.at(-1), ...swaps], asset, receiver, amount]), p, callData, fromAmount), "wrongTarget");
  const last = swaps.at(-1);
  assert.equal(checkSourceCalldata(enc([txId, [...swaps.slice(0, -1), { ...last, fromAmount: p.usdcIn - BigInt(1) }], asset, receiver, amount]), p, callData, fromAmount), "minBelowBuy");
  assert.equal(checkSourceCalldata(enc([txId, [...swaps.slice(0, -1), { ...last, callData: encodeHubBuy({ usdcIn: p.usdcIn, minPplOut: BigInt(2), recipient: p.account }) }], asset, receiver, amount]), p, callData, fromAmount), "calldataMismatch");
  // an Across facet on a Base -> Base purchase is refused
  assert.equal(checkSourceCalldata(mockSourceData({ callData }), p, callData, fromAmount), "unsupportedFacet");
});

test("M2: a real captured LI.FI quote (Polygon USDT -> Across -> verifyAndBuy) passes every check", () => {
  const fx = JSON.parse(readFileSync(new URL("./fixtures/lifi-quote-polygon-verifyandbuy.json", import.meta.url), "utf8"));
  const call = decodeFunctionData({ abi: PPL_CURVE_HUB_V2_ABI, data: fx.request.contractCalls[0].toContractCallData });
  assert.equal(call.functionName, "verifyAndBuy");
  const [usdcIn, minPplOut, recipient, referrer, personId, deadline, signature] = call.args;
  const p = {
    fromChain: 137,
    fromToken: fx.request.fromToken,
    account: recipient,
    hub: fx.request.contractCalls[0].toContractAddress,
    usdc: USDC,
    usdcIn,
    minPplOut,
    referrer,
    verification: { personId, deadline: Number(deadline), signature },
  };
  const check = validateOneTxQuote(fx.quote, p);
  assert.equal(check.ok, true, check.reason);
  assert.equal(check.summary.tool, "across");
  assert.equal(check.summary.tx.to, DIAMOND);
  assert.ok(check.summary.minReceivedUsd6 >= usdcIn);
  // tampering with the refund receiver inside the real calldata is caught
  const buyerWord = recipient.toLowerCase().slice(2).padStart(64, "0");
  const data = fx.quote.transactionRequest.data.toLowerCase();
  const last = data.lastIndexOf(buyerWord);
  const tampered = data.slice(0, last) + "0".repeat(24) + "2".repeat(40) + data.slice(last + 64);
  const q2 = structuredClone(fx.quote);
  q2.transactionRequest.data = tampered;
  assert.equal(validateOneTxQuote(q2, p).ok, false);
});

function transferLog(from, to, value, token = USDC) {
  return {
    address: token,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }),
    data: padHex(`0x${value.toString(16)}`, { size: 32 }),
  };
}
function boughtLog(recipient, pplOut) {
  return {
    address: HUB,
    topics: encodeEventTopics({ abi: PPL_CURVE_HUB_V2_ABI, eventName: "Bought", args: { buyer: LIFI_BASE_EXECUTOR, recipient, referrer: "0x0000000000000000000000000000000000000000" } }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [usd6(100), usd6(50), pplOut, BigInt(0)],
    ),
  };
}

test("L1/L2: outcome comes from the receiving tx logs (leftover to buyer, refund), not a balance delta", () => {
  const RECEIVER = "0x33b255b5db44A78c34381f89f1a454bc0Ef49871";
  const TREASURY = "0x3333333333333333333333333333333333333333";
  const ctx = { usdc: USDC, hub: HUB, buyer: BUYER, treasury: TREASURY };
  const ppl = BigInt("2000000000000000000000");
  // success: Receiver -> Executor, Executor -> hub / treasury, Bought, leftover Executor -> buyer
  const ok = receivingOutcome(
    [
      transferLog(RECEIVER, LIFI_BASE_EXECUTOR, usd6(100.5)),
      transferLog(LIFI_BASE_EXECUTOR, HUB, usd6(50)),
      transferLog(LIFI_BASE_EXECUTOR, TREASURY, usd6(50)),
      boughtLog(BUYER, ppl),
      transferLog(LIFI_BASE_EXECUTOR, BUYER, usd6(0.5)),
    ],
    ctx,
  );
  assert.deepEqual(ok, { pplOutWei: ppl, toBuyerUsd6: usd6(0.5), misroutedUsd6: BigInt(0) });
  // leftover sent elsewhere is flagged (L1)
  const mis = receivingOutcome([boughtLog(BUYER, ppl), transferLog(LIFI_BASE_EXECUTOR, HUB.replace(/1/g, "4"), usd6(0.5))], ctx);
  assert.equal(mis.misroutedUsd6, usd6(0.5));
  // refund: no Bought, Receiver -> buyer for the whole amount (L2)
  const refund = receivingOutcome([transferLog(RECEIVER, BUYER, usd6(100.5))], ctx);
  assert.deepEqual(refund, { pplOutWei: null, toBuyerUsd6: usd6(100.5), misroutedUsd6: BigInt(0) });
  // other tokens and a Bought for someone else do not count
  const noise = receivingOutcome([transferLog(RECEIVER, BUYER, usd6(7), BSC_USDT), boughtLog(HUB, ppl)], ctx);
  assert.deepEqual(noise, { pplOutWei: null, toBuyerUsd6: BigInt(0), misroutedUsd6: BigInt(0) });
});

test("M1: one-signature path refuses amounts below the hub's router minimum ($40)", () => {
  assert.equal(ROUTER_MIN_BUY_USD6, usd6(40));
  assert.throws(() => buildContractCallsRequest({ ...params, usdcIn: usd6(39.99) }), /belowRouterMin/);
  assert.equal(buildContractCallsRequest({ ...params, usdcIn: usd6(40) }).toAmount, "40000000");
});
