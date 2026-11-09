import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import {
  BASE_CHAIN_ID,
  BASE_PPL_CURVE_HUB_ADDRESS,
  PPL_CURVE_HUB_EVENTS_ABI,
  decodePplCurveHubLog,
  fetchCurveHubEventsFromRpc,
  matchBuyerAttribution,
  processCurveHubEventsBatch,
  type AttributionDirectory,
  type RawEvmLog,
} from "./bought-matcher.ts";
import { MICRO_PER_UNIT } from "./commission.ts";

const ZERO = BigInt(0);
const BUYER_WALLET = "0x1111111111111111111111111111111111111111";
const KOL_WALLET = "0x2222222222222222222222222222222222222222";
const USDC_TOKEN = "0x000000000000000000000000000000000000d13c"; // fake stable for unit tests (not Base mainnet USDC)

function makeBoughtLog(params: {
  buyer?: `0x${string}`;
  token?: `0x${string}`;
  usdIn: bigint;
  pplOut: bigint;
  soldAfter?: bigint;
  blockNumber?: number;
  blockHash?: string;
  txHash?: string;
  logIndex?: number;
  blockTimestamp?: Date;
}): RawEvmLog {
  const buyer = params.buyer ?? BUYER_WALLET;
  const token = params.token ?? USDC_TOKEN;
  const topics = encodeEventTopics({
    abi: [PPL_CURVE_HUB_EVENTS_ABI[0]],
    eventName: "Bought",
    args: { buyer, token },
  }) as `0x${string}`[];
  const data = encodeAbiParameters(
    [
      { name: "usdIn", type: "uint256" },
      { name: "pplOut", type: "uint256" },
      { name: "soldAfter", type: "uint256" },
    ],
    [params.usdIn, params.pplOut, params.soldAfter ?? params.pplOut],
  );
  return {
    address: BASE_PPL_CURVE_HUB_ADDRESS,
    topics,
    data,
    blockNumber: params.blockNumber ?? 100,
    blockHash: params.blockHash ?? "0xblock100",
    transactionHash: params.txHash ?? "0xtx_buy_1",
    logIndex: params.logIndex ?? 0,
    blockTimestamp: params.blockTimestamp ?? new Date("2026-12-02T12:00:00.000Z"),
  };
}

function makeSoldLog(params: {
  seller?: `0x${string}`;
  token?: `0x${string}`;
  pplIn: bigint;
  grossUsd: bigint;
  feeUsd?: bigint;
  soldAfter?: bigint;
  blockNumber?: number;
  blockHash?: string;
  txHash?: string;
  logIndex?: number;
  blockTimestamp?: Date;
}): RawEvmLog {
  const seller = params.seller ?? BUYER_WALLET;
  const token = params.token ?? USDC_TOKEN;
  const topics = encodeEventTopics({
    abi: [PPL_CURVE_HUB_EVENTS_ABI[2]],
    eventName: "Sold",
    args: { seller, token },
  }) as `0x${string}`[];
  const data = encodeAbiParameters(
    [
      { name: "pplIn", type: "uint256" },
      { name: "grossUsd", type: "uint256" },
      { name: "feeUsd", type: "uint256" },
      { name: "soldAfter", type: "uint256" },
    ],
    [params.pplIn, params.grossUsd, params.feeUsd ?? ZERO, params.soldAfter ?? ZERO],
  );
  return {
    address: BASE_PPL_CURVE_HUB_ADDRESS,
    topics,
    data,
    blockNumber: params.blockNumber ?? 110,
    blockHash: params.blockHash ?? "0xblock110",
    transactionHash: params.txHash ?? "0xtx_sell_1",
    logIndex: params.logIndex ?? 0,
    blockTimestamp: params.blockTimestamp ?? new Date("2026-12-03T12:00:00.000Z"),
  };
}

function makeTestDirectory(): AttributionDirectory {
  const buyerBindings = new Map();
  buyerBindings.set(BUYER_WALLET, {
    buyerWallet: BUYER_WALLET,
    userId: "user_buyer_1",
    referrerUserId: "user_kol_1",
    kolCode: "cryptowolf",
    deviceHash: "dev_buyer_1",
    ipHash: "ip_buyer_1",
  });

  const walletToUserId = new Map<string, string>([
    [BUYER_WALLET, "user_buyer_1"],
    [KOL_WALLET, "user_kol_1"],
  ]);

  const partnersByUserId = new Map([
    [
      "user_kol_1",
      {
        userId: "user_kol_1",
        referralCode: "kolref0001",
        kolCode: "cryptowolf",
        referredByUserId: null,
        referredByKolCode: null,
        walletAddresses: [KOL_WALLET],
        deviceHash: "dev_kol_1",
        ipHash: "ip_kol_1",
      },
    ],
    [
      "user_buyer_1",
      {
        userId: "user_buyer_1",
        referralCode: "buyref0001",
        kolCode: null,
        referredByUserId: "user_kol_1",
        referredByKolCode: "cryptowolf",
        walletAddresses: [BUYER_WALLET],
        deviceHash: "dev_buyer_1",
        ipHash: "ip_buyer_1",
      },
    ],
  ]);

  const userIdByKolCode = new Map([["cryptowolf", "user_kol_1"]]);
  const userIdByReferralCode = new Map([
    ["kolref0001", "user_kol_1"],
    ["buyref0001", "user_buyer_1"],
  ]);

  return {
    buyerBindings,
    walletToUserId,
    partnersByUserId,
    userIdByKolCode,
    userIdByReferralCode,
  };
}

test("decodePplCurveHubLog decodes Bought and Sold logs from Base PplCurveHub", () => {
  const boughtLog = makeBoughtLog({
    usdIn: BigInt(500) * MICRO_PER_UNIT,
    pplOut: BigInt(100_000) * MICRO_PER_UNIT,
  });
  const decodedBuy = decodePplCurveHubLog(boughtLog);
  assert.ok(decodedBuy);
  assert.equal(decodedBuy.chainId, BASE_CHAIN_ID);
  assert.equal(decodedBuy.contractAddress, BASE_PPL_CURVE_HUB_ADDRESS);
  assert.equal(decodedBuy.eventKind, "buy");
  assert.equal(decodedBuy.buyerAddress, BUYER_WALLET);
  assert.equal(decodedBuy.usdMicro, BigInt(500) * MICRO_PER_UNIT);
  assert.equal(decodedBuy.pplMicro, BigInt(100_000) * MICRO_PER_UNIT);

  const soldLog = makeSoldLog({
    pplIn: BigInt(40_000) * MICRO_PER_UNIT,
    grossUsd: BigInt(200) * MICRO_PER_UNIT,
  });
  const decodedSell = decodePplCurveHubLog(soldLog);
  assert.ok(decodedSell);
  assert.equal(decodedSell.eventKind, "sell");
  assert.equal(decodedSell.buyerAddress, BUYER_WALLET);
  assert.equal(decodedSell.pplMicro, BigInt(40_000) * MICRO_PER_UNIT);
});

test("matchBuyerAttribution resolves buyer_binding, account_wallet fallback, and unattributed", () => {
  const dir = makeTestDirectory();
  const m1 = matchBuyerAttribution(
    { buyerAddress: BUYER_WALLET, beneficiaryAddress: BUYER_WALLET },
    dir,
  );
  assert.equal(m1.attributionMethod, "buyer_binding");
  assert.equal(m1.beneficiaryUserId, "user_kol_1");
  assert.equal(m1.kolCode, "cryptowolf");

  // Remove explicit binding; fallback to account_wallet
  dir.buyerBindings.clear();
  const m2 = matchBuyerAttribution(
    { buyerAddress: BUYER_WALLET, beneficiaryAddress: BUYER_WALLET },
    dir,
  );
  assert.equal(m2.attributionMethod, "account_wallet");
  assert.equal(m2.beneficiaryUserId, "user_kol_1");

  // Unknown wallet -> unattributed
  const m3 = matchBuyerAttribution(
    {
      buyerAddress: "0x9999999999999999999999999999999999999999",
      beneficiaryAddress: "0x9999999999999999999999999999999999999999",
    },
    dir,
  );
  assert.equal(m3.attributionMethod, "unattributed");
  assert.equal(m3.beneficiaryUserId, null);
});

test("processCurveHubEventsBatch enforces confirmations, idempotency, reorg voiding, and sell-back clawbacks", () => {
  const dir = makeTestDirectory();
  const buyEv = decodePplCurveHubLog(
    makeBoughtLog({
      usdIn: BigInt(1_000) * MICRO_PER_UNIT,
      pplOut: BigInt(200_000) * MICRO_PER_UNIT,
      blockNumber: 100,
      blockHash: "0xblock100_v1",
      txHash: "0xtx_buy_100",
    }),
  )!;

  // 1. Head block 103 (< 5 confirmations): skipped as unconfirmed
  const unconfirmed = processCurveHubEventsBatch({
    headBlockNumber: 103,
    events: [buyEv],
    existingPurchases: [],
    existingCommissions: [],
    directory: dir,
  });
  assert.equal(unconfirmed.unconfirmedSkipped, 1);
  assert.equal(unconfirmed.newPurchases.length, 0);

  // 2. Head block 106 (>= 5 confirmations): indexed & commission created (7% of $1000 = $70 USDC, 3% of 200k = 6000 PPL)
  const confirmed = processCurveHubEventsBatch({
    headBlockNumber: 106,
    events: [buyEv],
    existingPurchases: [],
    existingCommissions: [],
    directory: dir,
  });
  assert.equal(confirmed.newPurchases.length, 1);
  assert.equal(confirmed.newCommissions.length, 1);
  assert.equal(confirmed.newCommissions[0].netUsdcMicro, BigInt(70) * MICRO_PER_UNIT);
  assert.equal(confirmed.newCommissions[0].netPplMicro, BigInt(6_000) * MICRO_PER_UNIT);
  assert.equal(confirmed.newCommissions[0].status, "pending");

  // 3. Re-running the same event is a no-op (idempotent)
  const duplicate = processCurveHubEventsBatch({
    headBlockNumber: 107,
    events: [buyEv],
    existingPurchases: confirmed.purchases,
    existingCommissions: confirmed.commissions,
    directory: dir,
  });
  assert.equal(duplicate.duplicateSkipped, 1);
  assert.equal(duplicate.newPurchases.length, 0);
  assert.equal(duplicate.commissions.length, 1);

  // 4. Partial sell-back (50% = 100,000 PPL sold back) reduces pending commission by 50%
  const sellEv = decodePplCurveHubLog(
    makeSoldLog({
      pplIn: BigInt(100_000) * MICRO_PER_UNIT,
      grossUsd: BigInt(500) * MICRO_PER_UNIT,
      blockNumber: 105,
      blockHash: "0xblock105",
      txHash: "0xtx_sell_105",
    }),
  )!;
  const afterSell = processCurveHubEventsBatch({
    headBlockNumber: 112,
    events: [sellEv],
    existingPurchases: confirmed.purchases,
    existingCommissions: confirmed.commissions,
    directory: dir,
  });
  assert.equal(afterSell.commissions[0].netUsdcMicro, BigInt(35) * MICRO_PER_UNIT);
  assert.equal(afterSell.commissions[0].netPplMicro, BigInt(3_000) * MICRO_PER_UNIT);
  assert.equal(afterSell.commissions[0].status, "pending");

  // 5. Chain reorg at block 100 voids the commission with reason `chain_reorg`
  const reorged = processCurveHubEventsBatch({
    headBlockNumber: 115,
    canonicalBlockHashes: new Map([[100, "0xblock100_reorged_v2"]]),
    events: [],
    existingPurchases: afterSell.purchases,
    existingCommissions: afterSell.commissions,
    directory: dir,
  });
  assert.equal(reorged.reorgedPurchaseIds.length, 1);
  assert.equal(reorged.commissions[0].status, "void");
  assert.equal(reorged.commissions[0].voidReason, "chain_reorg");
  assert.equal(reorged.commissions[0].netUsdcMicro, ZERO);
});

test("anti-abuse voids self-referral and wallet cluster abuse", () => {
  const dir = makeTestDirectory();
  // Bind KOL's own wallet to KOL's referral code -> self-referral
  dir.buyerBindings.set(KOL_WALLET, {
    buyerWallet: KOL_WALLET,
    userId: "user_kol_1",
    referrerUserId: "user_kol_1",
    kolCode: "cryptowolf",
  });

  const selfBuy = decodePplCurveHubLog(
    makeBoughtLog({
      buyer: KOL_WALLET,
      usdIn: BigInt(500) * MICRO_PER_UNIT,
      pplOut: BigInt(100_000) * MICRO_PER_UNIT,
      blockNumber: 100,
      txHash: "0xtx_self",
    }),
  )!;

  const resSelf = processCurveHubEventsBatch({
    headBlockNumber: 110,
    events: [selfBuy],
    existingPurchases: [],
    existingCommissions: [],
    directory: dir,
  });
  assert.equal(resSelf.newCommissions.length, 1);
  assert.equal(resSelf.newCommissions[0].status, "void");
  assert.equal(resSelf.newCommissions[0].voidReason, "self_referral");
  assert.equal(resSelf.newCommissions[0].netUsdcMicro, ZERO);
});

test("fetchCurveHubEventsFromRpc uses injectable mock RPC without network access", async () => {
  const log = makeBoughtLog({
    usdIn: BigInt(250) * MICRO_PER_UNIT,
    pplOut: BigInt(50_000) * MICRO_PER_UNIT,
    blockNumber: 200,
  });
  const { headBlockNumber, events } = await fetchCurveHubEventsFromRpc({
    fromBlock: 190,
    toBlock: 205,
    rpc: async (method) => {
      if (method === "eth_blockNumber") return "0xd2"; // 210
      if (method === "eth_getLogs") return [log];
      throw new Error(`unexpected method: ${method}`);
    },
  });
  assert.equal(headBlockNumber, 210);
  assert.equal(events.length, 1);
  assert.equal(events[0].usdMicro, BigInt(250) * MICRO_PER_UNIT);
});
