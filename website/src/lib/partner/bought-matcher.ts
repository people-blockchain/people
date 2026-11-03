/**
 * Off-chain PplCurveHub (`0x84388772788B7a383Dc2a0bDCd655D15A8279DC8` on Base) `Bought` and `Sold`
 * event decoder, buyer-wallet attribution waterfall, confirmation & reorg guard, anti-abuse
 * detector (self-referral + wallet clustering), and idempotent ledger processor.
 *
 * PplCurveHub on Base has no on-chain `referrer` parameter; attribution is performed off-chain
 * by matching the `Bought` event's buyer wallet against attributed users.
 */

import { decodeEventLog, encodeEventTopics, parseAbi } from "viem";
import {
  applySellBackClawback,
  calculatePurchaseCommission,
  type CalculatedCommissionEntry,
  type CommissionVoidReason,
  type KolTierConfig,
  type MutableCommissionRow,
} from "./commission";

const ZERO = BigInt(0);
const WEI_TO_MICRO_DIVISOR = BigInt("1000000000000");
const WEI_AUTO_THRESHOLD = BigInt("1000000000000000");

export const BASE_CHAIN_ID = 8453;
export const BASE_PPL_CURVE_HUB_ADDRESS = "0x84388772788b7a383dc2a0bdcd655d15a8279dc8";

/** Minimum block confirmations on Base before booking commissions. */
export const MIN_BASE_CONFIRMATIONS = 5;

/** Reorg lookback window when scanning recent blocks. */
export const REORG_LOOKBACK_BLOCKS = 64;

/** Maximum distinct buyer wallets allowed from a single device+IP slot under one referrer before cluster flag. */
export const WALLET_CLUSTER_MAX_WALLETS_PER_DEVICE = 3;

export const PPL_CURVE_HUB_EVENTS_ABI = parseAbi([
  "event Bought(address indexed buyer, address indexed token, uint256 usdIn, uint256 pplOut, uint256 soldAfter)",
  "event Bought(address indexed buyer, address indexed beneficiary, address token, uint256 usdIn, uint256 pplOut, uint256 soldAfter)",
  "event Sold(address indexed seller, address indexed token, uint256 pplIn, uint256 grossUsd, uint256 feeUsd, uint256 soldAfter)",
]);

export type RawEvmLog = {
  address: string;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
  blockNumber: bigint | number | `0x${string}`;
  blockHash: string;
  transactionHash: string;
  logIndex: number | `0x${string}`;
  blockTimestamp?: Date | number;
};

export type DecodedCurveHubEvent = {
  chainId: number;
  contractAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: Date;
  eventKind: "buy" | "sell";
  buyerAddress: string;
  beneficiaryAddress: string;
  tokenAddress: string;
  usdMicro: bigint;
  pplMicro: bigint;
  soldAfterMicro: bigint;
};

function toBlockNumber(val: bigint | number | `0x${string}`): number {
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  return Number(BigInt(val));
}

function toLogIndex(val: number | `0x${string}`): number {
  if (typeof val === "number") return val;
  return Number(BigInt(val));
}

/**
 * Normalizes a token amount to 6-decimal micro-units.
 * If the contract emits 18-decimal wei (`>= 10^15`), scales down by `10^12` to 6-decimal micro-units;
 * if already in 6-decimal micro-units, returns as-is.
 */
export function normalizeToMicroUnits(rawAmount: bigint, decimals: 6 | 18 | "auto" = "auto"): bigint {
  if (rawAmount <= ZERO) return ZERO;
  if (decimals === 6) return rawAmount;
  if (decimals === 18) return rawAmount / WEI_TO_MICRO_DIVISOR;
  if (rawAmount >= WEI_AUTO_THRESHOLD) {
    return rawAmount / WEI_TO_MICRO_DIVISOR;
  }
  return rawAmount;
}

/**
 * Decodes a raw EVM log from `PplCurveHub` into a normalized `DecodedCurveHubEvent`, or returns `null`
 * if the log is not a recognized `Bought` or `Sold` event.
 */
export function decodePplCurveHubLog(
  log: RawEvmLog,
  options: { chainId?: number; defaultTimestamp?: Date; amountDecimals?: 6 | 18 | "auto" } = {},
): DecodedCurveHubEvent | null {
  if (!log.topics || log.topics.length === 0) return null;
  try {
    const decoded = decodeEventLog({
      abi: PPL_CURVE_HUB_EVENTS_ABI,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });

    const chainId = options.chainId ?? BASE_CHAIN_ID;
    const contractAddress = log.address.trim().toLowerCase();
    const txHash = log.transactionHash.trim().toLowerCase();
    const logIndex = toLogIndex(log.logIndex);
    const blockNumber = toBlockNumber(log.blockNumber);
    const blockHash = log.blockHash.trim().toLowerCase();
    const blockTimestamp =
      log.blockTimestamp instanceof Date
        ? log.blockTimestamp
        : typeof log.blockTimestamp === "number"
          ? new Date(log.blockTimestamp)
          : (options.defaultTimestamp ?? new Date(0));
    const decimals = options.amountDecimals ?? "auto";

    if (decoded.eventName === "Bought") {
      const args = decoded.args as Record<string, unknown>;
      const buyer = String(args.buyer ?? "").toLowerCase();
      const beneficiary = String(args.beneficiary ?? args.buyer ?? "").toLowerCase();
      const token = String(args.token ?? "0x0000000000000000000000000000000000000000").toLowerCase();
      const usdMicro = normalizeToMicroUnits(BigInt((args.usdIn as bigint) ?? ZERO), decimals);
      const pplMicro = normalizeToMicroUnits(BigInt((args.pplOut as bigint) ?? ZERO), decimals);
      const soldAfterMicro = normalizeToMicroUnits(BigInt((args.soldAfter as bigint) ?? ZERO), decimals);

      return {
        chainId,
        contractAddress,
        txHash,
        logIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
        eventKind: "buy",
        buyerAddress: buyer,
        beneficiaryAddress: beneficiary,
        tokenAddress: token,
        usdMicro,
        pplMicro,
        soldAfterMicro,
      };
    }

    if (decoded.eventName === "Sold") {
      const args = decoded.args as Record<string, unknown>;
      const seller = String(args.seller ?? "").toLowerCase();
      const token = String(args.token ?? "0x0000000000000000000000000000000000000000").toLowerCase();
      const pplMicro = normalizeToMicroUnits(BigInt((args.pplIn as bigint) ?? ZERO), decimals);
      const grossUsd = BigInt((args.grossUsd as bigint) ?? ZERO);
      const usdMicro = normalizeToMicroUnits(grossUsd, decimals);
      const soldAfterMicro = normalizeToMicroUnits(BigInt((args.soldAfter as bigint) ?? ZERO), decimals);

      return {
        chainId,
        contractAddress,
        txHash,
        logIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
        eventKind: "sell",
        buyerAddress: seller,
        beneficiaryAddress: seller,
        tokenAddress: token,
        usdMicro,
        pplMicro,
        soldAfterMicro,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/** Helper for building encoded `Bought`/`Sold` topics in tests and RPC filters. */
export function getPplCurveHubEventTopics(): `0x${string}`[] {
  const bought1 = encodeEventTopics({
    abi: [PPL_CURVE_HUB_EVENTS_ABI[0]],
    eventName: "Bought",
  })[0];
  const bought2 = encodeEventTopics({
    abi: [PPL_CURVE_HUB_EVENTS_ABI[1]],
    eventName: "Bought",
  })[0];
  const sold = encodeEventTopics({
    abi: [PPL_CURVE_HUB_EVENTS_ABI[2]],
    eventName: "Sold",
  })[0];
  return [bought1, bought2, sold].filter((t): t is `0x${string}` => Boolean(t));
}

export type BuyerBindingRecord = {
  buyerWallet: string;
  peopleAddress?: string | null;
  userId: string | null;
  referrerUserId: string | null;
  kolCode: string | null;
  cookieSetAt?: Date | null;
  ipHash?: string | null;
  deviceHash?: string | null;
};

export type PartnerDirectoryProfile = {
  userId: string;
  referralCode: string;
  kolCode: string | null;
  referredByUserId: string | null;
  referredByKolCode: string | null;
  kolTierOverrideBps?: number | null;
  kolStatus?: string;
  walletAddresses: string[];
  ipHash?: string | null;
  deviceHash?: string | null;
  isBot?: boolean;
};

export type AttributionDirectory = {
  /** Keyed by lowercase `0x` buyer wallet address. */
  buyerBindings: Map<string, BuyerBindingRecord>;
  /** Keyed by lowercase `0x` wallet address -> owner `userId`. */
  walletToUserId: Map<string, string>;
  /** Keyed by `userId`. */
  partnersByUserId: Map<string, PartnerDirectoryProfile>;
  /** Keyed by lowercase `kolCode` -> KOL owner `userId`. */
  userIdByKolCode: Map<string, string>;
  /** Keyed by lowercase `referralCode` -> Partner owner `userId`. */
  userIdByReferralCode: Map<string, string>;
};

export type AttributionMatchResult = {
  attributionMethod: "buyer_binding" | "account_wallet" | "unattributed";
  buyerUserId: string | null;
  referrerUserId: string | null;
  kolCode: string | null;
  beneficiaryUserId: string | null;
  program: "kol" | "partner";
  ipHash: string | null;
  deviceHash: string | null;
};

/**
 * Matches a `Bought` event's `buyerAddress` (and `beneficiaryAddress`) against:
 * 1. Explicit pre-purchase / connected wallet bindings (`sale_buyer_binding`),
 * 2. Linked account wallets (`partner.walletAddress`, `user_wallet_vault.address`, `founder.walletAddress`).
 */
export function matchBuyerAttribution(
  event: Pick<DecodedCurveHubEvent, "buyerAddress" | "beneficiaryAddress">,
  directory: AttributionDirectory,
): AttributionMatchResult {
  const buyerLower = event.buyerAddress.trim().toLowerCase();
  const benefLower = event.beneficiaryAddress.trim().toLowerCase();

  // 1. Check explicit sale_buyer_binding
  const binding =
    directory.buyerBindings.get(buyerLower) ?? directory.buyerBindings.get(benefLower);
  if (binding) {
    const kolCodeLower = binding.kolCode?.trim().toLowerCase() ?? null;
    const kolOwnerUserId = kolCodeLower ? (directory.userIdByKolCode.get(kolCodeLower) ?? null) : null;
    const refUserId = binding.referrerUserId ?? kolOwnerUserId;
    if (refUserId) {
      const refProfile = directory.partnersByUserId.get(refUserId);
      if (refProfile?.kolStatus !== "suspended") {
        return {
          attributionMethod: "buyer_binding",
          buyerUserId: binding.userId ?? directory.walletToUserId.get(buyerLower) ?? null,
          referrerUserId: refUserId,
          kolCode: kolCodeLower ?? refProfile?.kolCode?.toLowerCase() ?? null,
          beneficiaryUserId: refUserId,
          program: kolCodeLower || refProfile?.kolCode ? "kol" : "partner",
          ipHash: binding.ipHash ?? null,
          deviceHash: binding.deviceHash ?? null,
        };
      }
    }
  }

  // 2. Check linked account wallets (partner / vault / founder)
  const ownerUserId =
    directory.walletToUserId.get(buyerLower) ?? directory.walletToUserId.get(benefLower) ?? null;
  if (ownerUserId) {
    const buyerProfile = directory.partnersByUserId.get(ownerUserId);
    if (buyerProfile) {
      const kolCodeLower = buyerProfile.referredByKolCode?.trim().toLowerCase() ?? null;
      const kolOwnerId = kolCodeLower ? (directory.userIdByKolCode.get(kolCodeLower) ?? null) : null;
      const refUserId = buyerProfile.referredByUserId ?? kolOwnerId ?? null;
      if (refUserId) {
        const refProfile = directory.partnersByUserId.get(refUserId);
        if (refProfile?.kolStatus !== "suspended") {
          return {
            attributionMethod: "account_wallet",
            buyerUserId: ownerUserId,
            referrerUserId: refUserId,
            kolCode: kolCodeLower ?? refProfile?.kolCode?.toLowerCase() ?? null,
            beneficiaryUserId: refUserId,
            program: kolCodeLower || refProfile?.kolCode ? "kol" : "partner",
            ipHash: buyerProfile.ipHash ?? null,
            deviceHash: buyerProfile.deviceHash ?? null,
          };
        }
      }
    }
  }

  return {
    attributionMethod: "unattributed",
    buyerUserId: ownerUserId,
    referrerUserId: null,
    kolCode: null,
    beneficiaryUserId: null,
    program: "kol",
    ipHash: null,
    deviceHash: null,
  };
}

/**
 * Anti-abuse check for self-referral and wallet clustering:
 * - Blocks direct self-referral (`buyerUserId === beneficiaryUserId`),
 * - Blocks wallet self-referral (`buyerAddress` or `beneficiaryAddress` belongs to referrer's linked wallets),
 * - Blocks same-device + same-IP self-referral between buyer and referrer,
 * - Flags wallet clustering when multiple distinct user accounts transact from the same wallet or
 *   when >= 3 distinct wallets share the same deviceHash/ipHash under the same referrer.
 */
export function detectPurchaseAbuse(input: {
  buyerAddress: string;
  beneficiaryAddress: string;
  match: AttributionMatchResult;
  directory: AttributionDirectory;
  priorPurchases: Array<{
    buyerAddress: string;
    buyerUserId: string | null;
    beneficiaryUserId: string | null;
    deviceHash?: string | null;
    ipHash?: string | null;
  }>;
}): CommissionVoidReason | null {
  const { match, directory, priorPurchases } = input;
  if (!match.beneficiaryUserId) return null;

  const buyerLower = input.buyerAddress.trim().toLowerCase();
  const benefLower = input.beneficiaryAddress.trim().toLowerCase();
  const referrerProfile = directory.partnersByUserId.get(match.beneficiaryUserId);

  // 1. Direct userId self-referral
  if (match.buyerUserId && match.buyerUserId === match.beneficiaryUserId) {
    return "self_referral";
  }

  // 2. Buyer or beneficiary wallet belongs to referrer
  const referrerWallets = new Set(
    (referrerProfile?.walletAddresses ?? []).map((w) => w.trim().toLowerCase()),
  );
  if (referrerWallets.has(buyerLower) || referrerWallets.has(benefLower)) {
    return "self_referral";
  }
  if (
    directory.walletToUserId.get(buyerLower) === match.beneficiaryUserId ||
    directory.walletToUserId.get(benefLower) === match.beneficiaryUserId
  ) {
    return "self_referral";
  }

  // 3. Same device + IP slot as referrer
  if (
    match.deviceHash &&
    referrerProfile?.deviceHash &&
    match.deviceHash === referrerProfile.deviceHash
  ) {
    return "self_referral";
  }

  // 4. Bot flag on buyer or referrer
  const buyerProfile = match.buyerUserId ? directory.partnersByUserId.get(match.buyerUserId) : null;
  if (buyerProfile?.isBot || referrerProfile?.isBot) {
    return "bot_disqualified";
  }

  // 5. Wallet clustering: same wallet used across multiple distinct userIds
  if (match.buyerUserId) {
    for (const prev of priorPurchases) {
      if (
        prev.buyerAddress.toLowerCase() === buyerLower &&
        prev.buyerUserId &&
        prev.buyerUserId !== match.buyerUserId
      ) {
        return "wallet_cluster_abuse";
      }
    }
  }

  // 6. Wallet clustering: >= WALLET_CLUSTER_MAX_WALLETS_PER_DEVICE distinct wallets on same deviceHash under same referrer
  if (match.deviceHash) {
    const walletsOnDevice = new Set<string>([buyerLower]);
    for (const prev of priorPurchases) {
      if (
        prev.beneficiaryUserId === match.beneficiaryUserId &&
        prev.deviceHash === match.deviceHash
      ) {
        walletsOnDevice.add(prev.buyerAddress.toLowerCase());
      }
    }
    if (walletsOnDevice.size >= WALLET_CLUSTER_MAX_WALLETS_PER_DEVICE) {
      return "wallet_cluster_abuse";
    }
  }

  return null;
}

export type StoredPurchaseRecord = {
  id: string;
  chainId: number;
  contractAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: Date;
  eventKind: "buy" | "sell";
  buyerAddress: string;
  beneficiaryAddress: string;
  tokenAddress: string;
  usdMicro: bigint;
  pplMicro: bigint;
  soldAfterMicro: bigint;
  buyerUserId: string | null;
  referrerUserId: string | null;
  kolCode: string | null;
  attributionMethod: "buyer_binding" | "account_wallet" | "unattributed";
  status: "confirmed" | "reorged";
  deviceHash?: string | null;
  ipHash?: string | null;
};

export type ProcessEventsBatchInput = {
  headBlockNumber: number;
  minConfirmations?: number;
  canonicalBlockHashes?: Map<number, string>;
  events: DecodedCurveHubEvent[];
  existingPurchases: StoredPurchaseRecord[];
  existingCommissions: MutableCommissionRow[];
  directory: AttributionDirectory;
  priorVolumeByUserMicro?: Map<string, bigint>;
  tierConfig?: KolTierConfig;
};

export type ProcessEventsBatchOutput = {
  purchases: StoredPurchaseRecord[];
  newPurchases: StoredPurchaseRecord[];
  reorgedPurchaseIds: string[];
  commissions: MutableCommissionRow[];
  newCommissions: CalculatedCommissionEntry[];
  unconfirmedSkipped: number;
  duplicateSkipped: number;
};

function purchaseKey(chainId: number, txHash: string, logIndex: number): string {
  return `${chainId}:${txHash.trim().toLowerCase()}:${logIndex}`;
}

/**
 * Pure, idempotent, reorg-safe batch processor for `PplCurveHub` `Bought` and `Sold` events.
 */
export function processCurveHubEventsBatch(
  input: ProcessEventsBatchInput,
): ProcessEventsBatchOutput {
  const minConfirmations = input.minConfirmations ?? MIN_BASE_CONFIRMATIONS;
  const purchases = input.existingPurchases.map((p) => ({ ...p }));
  let commissions = input.existingCommissions.map((c) => ({ ...c }));
  const newPurchases: StoredPurchaseRecord[] = [];
  const newCommissions: CalculatedCommissionEntry[] = [];
  const reorgedPurchaseIds: string[] = [];

  const volumeByUser = new Map<string, bigint>(input.priorVolumeByUserMicro ?? []);

  // 1. Reorg check across the lookback window
  const minReorgCheckBlock = Math.max(0, input.headBlockNumber - REORG_LOOKBACK_BLOCKS);
  const incomingByKey = new Map<string, DecodedCurveHubEvent>();
  for (const ev of input.events) {
    incomingByKey.set(purchaseKey(ev.chainId, ev.txHash, ev.logIndex), ev);
  }

  for (const existing of purchases) {
    if (existing.status === "reorged") continue;
    if (existing.blockNumber < minReorgCheckBlock) continue;

    const canonicalHash = input.canonicalBlockHashes?.get(existing.blockNumber)?.toLowerCase();
    const incomingSameKey = incomingByKey.get(
      purchaseKey(existing.chainId, existing.txHash, existing.logIndex),
    );

    const blockHashMismatch =
      (canonicalHash && canonicalHash !== existing.blockHash.toLowerCase()) ||
      (incomingSameKey &&
        incomingSameKey.blockHash.toLowerCase() !== existing.blockHash.toLowerCase());

    if (blockHashMismatch) {
      existing.status = "reorged";
      reorgedPurchaseIds.push(existing.id);
      for (const comm of commissions) {
        if (
          comm.purchaseId === existing.id &&
          (comm.status === "pending" || comm.status === "approved")
        ) {
          comm.status = "void";
          comm.voidReason = "chain_reorg";
          comm.netUsdcMicro = ZERO;
          comm.netPplMicro = ZERO;
        }
      }
    }
  }

  const confirmedByKey = new Map<string, StoredPurchaseRecord>();
  for (const p of purchases) {
    if (p.status === "confirmed") {
      confirmedByKey.set(purchaseKey(p.chainId, p.txHash, p.logIndex), p);
    }
  }

  let unconfirmedSkipped = 0;
  let duplicateSkipped = 0;

  // Sort incoming events deterministically by (blockNumber, logIndex)
  const sortedEvents = [...input.events].sort((a, b) =>
    a.blockNumber !== b.blockNumber ? a.blockNumber - b.blockNumber : a.logIndex - b.logIndex,
  );

  for (const ev of sortedEvents) {
    const confirmations = input.headBlockNumber - ev.blockNumber;
    if (confirmations < minConfirmations) {
      unconfirmedSkipped += 1;
      continue;
    }

    const key = purchaseKey(ev.chainId, ev.txHash, ev.logIndex);
    if (confirmedByKey.has(key)) {
      duplicateSkipped += 1;
      continue;
    }

    const match = matchBuyerAttribution(ev, input.directory);
    const purchaseId = `pur_${ev.chainId}_${ev.txHash.slice(0, 18)}_${ev.logIndex}`;

    const record: StoredPurchaseRecord = {
      id: purchaseId,
      chainId: ev.chainId,
      contractAddress: ev.contractAddress,
      txHash: ev.txHash.toLowerCase(),
      logIndex: ev.logIndex,
      blockNumber: ev.blockNumber,
      blockHash: ev.blockHash.toLowerCase(),
      blockTimestamp: ev.blockTimestamp,
      eventKind: ev.eventKind,
      buyerAddress: ev.buyerAddress.toLowerCase(),
      beneficiaryAddress: ev.beneficiaryAddress.toLowerCase(),
      tokenAddress: ev.tokenAddress.toLowerCase(),
      usdMicro: ev.usdMicro,
      pplMicro: ev.pplMicro,
      soldAfterMicro: ev.soldAfterMicro,
      buyerUserId: match.buyerUserId,
      referrerUserId: match.referrerUserId,
      kolCode: match.kolCode,
      attributionMethod: match.attributionMethod,
      status: "confirmed",
      deviceHash: match.deviceHash,
      ipHash: match.ipHash,
    };

    purchases.push(record);
    newPurchases.push(record);
    confirmedByKey.set(key, record);

    if (ev.eventKind === "buy" && match.beneficiaryUserId) {
      const priorPurchasesForAbuse = purchases
        .filter((p) => p.id !== record.id && p.status === "confirmed" && p.eventKind === "buy")
        .map((p) => ({
          buyerAddress: p.buyerAddress,
          buyerUserId: p.buyerUserId,
          beneficiaryUserId: p.referrerUserId,
          deviceHash: p.deviceHash,
          ipHash: p.ipHash,
        }));

      const voidReason = detectPurchaseAbuse({
        buyerAddress: ev.buyerAddress,
        beneficiaryAddress: ev.beneficiaryAddress,
        match,
        directory: input.directory,
        priorPurchases: priorPurchasesForAbuse,
      });

      const beneficiaryProfile = input.directory.partnersByUserId.get(match.beneficiaryUserId);
      const priorVol = volumeByUser.get(match.beneficiaryUserId) ?? ZERO;

      const calc = calculatePurchaseCommission({
        purchaseId: record.id,
        chainId: ev.chainId,
        txHash: ev.txHash,
        logIndex: ev.logIndex,
        beneficiaryUserId: match.beneficiaryUserId,
        buyerUserId: match.buyerUserId,
        buyerAddress: ev.buyerAddress,
        usdPurchaseMicro: ev.usdMicro,
        pplPurchaseMicro: ev.pplMicro,
        priorNetVolumeUsdMicro: priorVol,
        kolTierOverrideBps: beneficiaryProfile?.kolTierOverrideBps ?? null,
        program: match.program,
        level: 1,
        blockTimestamp: ev.blockTimestamp,
        voidReason,
        tierConfig: input.tierConfig,
      });

      newCommissions.push(calc);
      commissions.push({
        id: `comm_${calc.idempotencyKey}`,
        purchaseId: calc.purchaseId,
        buyerAddress: calc.buyerAddress,
        pplPurchaseMicro: calc.pplPurchaseMicro,
        grossUsdcMicro: calc.grossUsdcMicro,
        grossPplMicro: calc.grossPplMicro,
        clawedBackUsdcMicro: calc.clawedBackUsdcMicro,
        clawedBackPplMicro: calc.clawedBackPplMicro,
        netUsdcMicro: calc.netUsdcMicro,
        netPplMicro: calc.netPplMicro,
        status: calc.status,
        voidReason: calc.voidReason,
        holdUntil: calc.holdUntil,
        createdAt: ev.blockTimestamp,
      });

      if (!voidReason) {
        volumeByUser.set(match.beneficiaryUserId, priorVol + ev.usdMicro);
      }
    } else if (ev.eventKind === "sell") {
      // Apply LIFO clawback across active commissions for this seller wallet
      const sellerLower = ev.buyerAddress.toLowerCase();
      const sellerRows = commissions.filter((c) => c.buyerAddress.toLowerCase() === sellerLower);
      if (sellerRows.length > 0) {
        const { updated } = applySellBackClawback(sellerRows, ev.pplMicro);
        const byId = new Map(updated.map((u) => [u.id, u]));
        commissions = commissions.map((c) => byId.get(c.id) ?? c);
      }
    }
  }

  return {
    purchases,
    newPurchases,
    reorgedPurchaseIds,
    commissions,
    newCommissions,
    unconfirmedSkipped,
    duplicateSkipped,
  };
}

/** Injectable JSON-RPC transport for mockable chain reads (no live RPC in tests). */
export type JsonRpcTransport = (method: string, params: unknown[]) => Promise<unknown>;

/**
 * Fetches and decodes `Bought` and `Sold` events from `PplCurveHub` on Base over an
 * injectable `JsonRpcTransport`.
 */
export async function fetchCurveHubEventsFromRpc(input: {
  rpc: JsonRpcTransport;
  contractAddress?: string;
  fromBlock: number;
  toBlock: number;
  chainId?: number;
  defaultTimestamp?: Date;
}): Promise<{ headBlockNumber: number; events: DecodedCurveHubEvent[] }> {
  const contractAddress = (input.contractAddress ?? BASE_PPL_CURVE_HUB_ADDRESS).toLowerCase();
  const hexBlock = (await input.rpc("eth_blockNumber", [])) as `0x${string}`;
  const headBlockNumber = Number(BigInt(hexBlock));

  if (input.toBlock < input.fromBlock) {
    return { headBlockNumber, events: [] };
  }

  const topics = getPplCurveHubEventTopics();
  const rawLogs = (await input.rpc("eth_getLogs", [
    {
      address: contractAddress,
      fromBlock: `0x${input.fromBlock.toString(16)}`,
      toBlock: `0x${input.toBlock.toString(16)}`,
      topics: [topics],
    },
  ])) as RawEvmLog[];

  const events: DecodedCurveHubEvent[] = [];
  for (const log of rawLogs ?? []) {
    const decoded = decodePplCurveHubLog(log, {
      chainId: input.chainId ?? BASE_CHAIN_ID,
      defaultTimestamp: input.defaultTimestamp,
    });
    if (decoded) events.push(decoded);
  }
  return { headBlockNumber, events };
}
