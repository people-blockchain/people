/**
 * Persists off-chain PplCurveHub event matching: cursor in `sale_chain_cursor`,
 * purchases in `sale_purchase`, commissions in `referral_commission_ledger`.
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDbReady } from "@/db";
import {
  founders,
  partners,
  referralCommissionLedgers,
  saleBuyerBindings,
  saleChainCursors,
  salePurchases,
  userWalletVaults,
} from "@/db/schema";
import {
  BASE_CHAIN_ID,
  BASE_PPL_CURVE_HUB_ADDRESS,
  MIN_BASE_CONFIRMATIONS,
  REORG_LOOKBACK_BLOCKS,
  fetchCurveHubEventsFromRpc,
  processCurveHubEventsBatch,
  type AttributionDirectory,
  type JsonRpcTransport,
  type StoredPurchaseRecord,
} from "./bought-matcher";
import {
  evaluateHoldMaturity,
  loadKolTierConfig,
  type CalculatedCommissionEntry,
  type MutableCommissionRow,
} from "./commission";

const CONTRACT = BASE_PPL_CURVE_HUB_ADDRESS.toLowerCase();
const SCAN_CHUNK = 2_000;

function microFromDb(value: string | null | undefined): bigint {
  if (value == null || value === "") return BigInt(0);
  return BigInt(value);
}

function microToDb(value: bigint): string {
  return value.toString();
}

export async function loadAttributionDirectory(): Promise<AttributionDirectory> {
  const db = await getDbReady();
  const buyerBindings = new Map<string, AttributionDirectory["buyerBindings"] extends Map<string, infer V> ? V : never>();
  const bindingRows = await db.select().from(saleBuyerBindings);
  for (const row of bindingRows) {
    const key = row.buyerWallet.trim().toLowerCase();
    buyerBindings.set(key, {
      buyerWallet: key,
      peopleAddress: row.peopleAddress,
      userId: row.userId,
      referrerUserId: row.referrerUserId,
      kolCode: row.kolCode,
      cookieSetAt: row.cookieSetAt,
      ipHash: row.ipHash,
      deviceHash: row.deviceHash,
    });
  }

  const walletToUserId = new Map<string, string>();
  const partnerRows = await db.select().from(partners);
  const partnersByUserId = new Map<string, AttributionDirectory["partnersByUserId"] extends Map<string, infer V> ? V : never>();
  const userIdByKolCode = new Map<string, string>();
  const userIdByReferralCode = new Map<string, string>();

  for (const row of partnerRows) {
    const wallets: string[] = [];
    if (row.walletAddress) wallets.push(row.walletAddress.trim().toLowerCase());
    partnersByUserId.set(row.userId, {
      userId: row.userId,
      referralCode: row.referralCode,
      kolCode: row.kolCode,
      referredByUserId: row.referredByUserId,
      referredByKolCode: row.referredByKolCode,
      kolTierOverrideBps: row.kolTierOverrideBps,
      kolStatus: row.kolStatus,
      walletAddresses: wallets,
      ipHash: null,
      deviceHash: null,
      isBot: false,
    });
    userIdByReferralCode.set(row.referralCode.toLowerCase(), row.userId);
    if (row.kolCode) userIdByKolCode.set(row.kolCode.toLowerCase(), row.userId);
    for (const w of wallets) walletToUserId.set(w, row.userId);
  }

  const vaultRows = await db.select({ userId: userWalletVaults.userId, address: userWalletVaults.address }).from(userWalletVaults);
  for (const row of vaultRows) {
    walletToUserId.set(row.address.trim().toLowerCase(), row.userId);
    const profile = partnersByUserId.get(row.userId);
    if (profile && !profile.walletAddresses.includes(row.address.trim().toLowerCase())) {
      profile.walletAddresses.push(row.address.trim().toLowerCase());
    }
  }

  const founderRows = await db
    .select({
      userId: founders.userId,
      walletAddress: founders.walletAddress,
      passportWallet: founders.passportWallet,
    })
    .from(founders);
  for (const row of founderRows) {
    if (!row.userId) continue;
    for (const w of [row.walletAddress, row.passportWallet]) {
      if (!w) continue;
      const lower = w.trim().toLowerCase();
      walletToUserId.set(lower, row.userId);
      const profile = partnersByUserId.get(row.userId);
      if (profile && !profile.walletAddresses.includes(lower)) {
        profile.walletAddresses.push(lower);
      }
    }
  }

  return {
    buyerBindings,
    walletToUserId,
    partnersByUserId,
    userIdByKolCode,
    userIdByReferralCode,
  };
}

function mapPurchaseRow(row: typeof salePurchases.$inferSelect): StoredPurchaseRecord {
  return {
    id: row.id,
    chainId: row.chainId,
    contractAddress: row.contractAddress.toLowerCase(),
    txHash: row.txHash.toLowerCase(),
    logIndex: row.logIndex,
    blockNumber: row.blockNumber,
    blockHash: row.blockHash.toLowerCase(),
    blockTimestamp: row.blockTimestamp,
    eventKind: row.eventKind as "buy" | "sell",
    buyerAddress: row.buyerAddress.toLowerCase(),
    beneficiaryAddress: row.beneficiaryAddress.toLowerCase(),
    tokenAddress: row.tokenAddress.toLowerCase(),
    usdMicro: microFromDb(row.usdMicro),
    pplMicro: microFromDb(row.pplMicro),
    soldAfterMicro: microFromDb(row.soldAfterMicro),
    buyerUserId: row.buyerUserId,
    referrerUserId: row.referrerUserId,
    kolCode: row.kolCode,
    attributionMethod: row.attributionMethod as StoredPurchaseRecord["attributionMethod"],
    status: row.status as "confirmed" | "reorged",
  };
}

function mapCommissionRow(row: typeof referralCommissionLedgers.$inferSelect): MutableCommissionRow {
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    buyerAddress: row.buyerAddress,
    pplPurchaseMicro: microFromDb(row.pplPurchaseMicro),
    grossUsdcMicro: microFromDb(row.grossUsdcMicro),
    grossPplMicro: microFromDb(row.grossPplMicro),
    clawedBackUsdcMicro: microFromDb(row.clawedBackUsdcMicro),
    clawedBackPplMicro: microFromDb(row.clawedBackPplMicro),
    netUsdcMicro: microFromDb(row.netUsdcMicro),
    netPplMicro: microFromDb(row.netPplMicro),
    status: row.status as MutableCommissionRow["status"],
    voidReason: row.voidReason as MutableCommissionRow["voidReason"],
    holdUntil: row.holdUntil,
    createdAt: row.createdAt,
  };
}

async function loadPriorVolumeByUser(): Promise<Map<string, bigint>> {
  const db = await getDbReady();
  const rows = await db
    .select({
      beneficiaryUserId: referralCommissionLedgers.beneficiaryUserId,
      usd: referralCommissionLedgers.usdPurchaseMicro,
      status: referralCommissionLedgers.status,
    })
    .from(referralCommissionLedgers);
  const volume = new Map<string, bigint>();
  for (const row of rows) {
    if (row.status === "void") continue;
    const prev = volume.get(row.beneficiaryUserId) ?? BigInt(0);
    volume.set(row.beneficiaryUserId, prev + microFromDb(row.usd));
  }
  return volume;
}

async function persistSyncResults(input: {
  headBlockNumber: number;
  headBlockHash: string | null;
  existingCommissionIds: Set<string>;
  output: ReturnType<typeof processCurveHubEventsBatch>;
  newCommissionEntries: CalculatedCommissionEntry[];
  now: Date;
}): Promise<void> {
  const db = await getDbReady();

  for (const purchaseId of input.output.reorgedPurchaseIds) {
    await db
      .update(salePurchases)
      .set({ status: "reorged", updatedAt: input.now })
      .where(eq(salePurchases.id, purchaseId));
  }

  for (const purchase of input.output.newPurchases) {
    await db
      .insert(salePurchases)
      .values({
        id: purchase.id,
        chainId: purchase.chainId,
        contractAddress: purchase.contractAddress,
        txHash: purchase.txHash,
        logIndex: purchase.logIndex,
        blockNumber: purchase.blockNumber,
        blockHash: purchase.blockHash,
        blockTimestamp: purchase.blockTimestamp,
        eventKind: purchase.eventKind,
        buyerAddress: purchase.buyerAddress,
        beneficiaryAddress: purchase.beneficiaryAddress,
        tokenAddress: purchase.tokenAddress,
        usdMicro: microToDb(purchase.usdMicro),
        pplMicro: microToDb(purchase.pplMicro),
        soldAfterMicro: microToDb(purchase.soldAfterMicro),
        buyerUserId: purchase.buyerUserId,
        referrerUserId: purchase.referrerUserId,
        kolCode: purchase.kolCode,
        attributionMethod: purchase.attributionMethod,
        status: purchase.status,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing();
  }

  for (const comm of input.output.commissions) {
    if (!input.existingCommissionIds.has(comm.id)) continue;
    await db
      .update(referralCommissionLedgers)
      .set({
        clawedBackUsdcMicro: microToDb(comm.clawedBackUsdcMicro),
        clawedBackPplMicro: microToDb(comm.clawedBackPplMicro),
        netUsdcMicro: microToDb(comm.netUsdcMicro),
        netPplMicro: microToDb(comm.netPplMicro),
        status: comm.status,
        voidReason: comm.voidReason,
        updatedAt: input.now,
      })
      .where(eq(referralCommissionLedgers.id, comm.id));
  }

  for (const entry of input.newCommissionEntries) {
    await db
      .insert(referralCommissionLedgers)
      .values({
        id: `comm_${entry.idempotencyKey}`,
        purchaseId: entry.purchaseId,
        beneficiaryUserId: entry.beneficiaryUserId,
        buyerUserId: entry.buyerUserId,
        buyerAddress: entry.buyerAddress,
        program: entry.program,
        level: entry.level,
        usdcRateBps: entry.usdcRateBps,
        pplRateBps: entry.pplRateBps,
        usdPurchaseMicro: microToDb(entry.usdPurchaseMicro),
        pplPurchaseMicro: microToDb(entry.pplPurchaseMicro),
        grossUsdcMicro: microToDb(entry.grossUsdcMicro),
        grossPplMicro: microToDb(entry.grossPplMicro),
        clawedBackUsdcMicro: microToDb(entry.clawedBackUsdcMicro),
        clawedBackPplMicro: microToDb(entry.clawedBackPplMicro),
        netUsdcMicro: microToDb(entry.netUsdcMicro),
        netPplMicro: microToDb(entry.netPplMicro),
        usdcSettlementNetwork: entry.usdcSettlementNetwork,
        pplSettlementNetwork: entry.pplSettlementNetwork,
        isPplLocked: entry.isPplLocked,
        status: entry.status,
        voidReason: entry.voidReason,
        holdUntil: entry.holdUntil,
        idempotencyKey: entry.idempotencyKey,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing({ target: referralCommissionLedgers.idempotencyKey });
  }

  await db
    .insert(saleChainCursors)
    .values({
      chainId: BASE_CHAIN_ID,
      contractAddress: CONTRACT,
      lastScannedBlock: input.headBlockNumber,
      lastBlockHash: input.headBlockHash,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [saleChainCursors.chainId, saleChainCursors.contractAddress],
      set: {
        lastScannedBlock: input.headBlockNumber,
        lastBlockHash: input.headBlockHash,
        updatedAt: input.now,
      },
    });
}

async function maturePendingCommissions(now: Date): Promise<number> {
  const db = await getDbReady();
  const pending = await db
    .select()
    .from(referralCommissionLedgers)
    .where(eq(referralCommissionLedgers.status, "pending"));
  let matured = 0;
  for (const row of pending) {
    const next = evaluateHoldMaturity(
      {
        status: row.status as MutableCommissionRow["status"],
        holdUntil: row.holdUntil,
        netUsdcMicro: microFromDb(row.netUsdcMicro),
        netPplMicro: microFromDb(row.netPplMicro),
      },
      now,
    );
    if (next === "approved" && row.status === "pending") {
      await db
        .update(referralCommissionLedgers)
        .set({ status: "approved", updatedAt: now })
        .where(eq(referralCommissionLedgers.id, row.id));
      matured += 1;
    }
  }
  return matured;
}

export type CurveHubSyncResult =
  | {
      ok: true;
      fromBlock: number;
      toBlock: number;
      headBlockNumber: number;
      eventsFetched: number;
      newPurchases: number;
      newCommissions: number;
      unconfirmedSkipped: number;
      duplicateSkipped: number;
      reorged: number;
      maturedCommissions: number;
    }
  | { ok: false; reason: string };

export async function runCurveHubReferralSync(input?: {
  rpc?: JsonRpcTransport;
  rpcUrl?: string;
  now?: Date;
}): Promise<CurveHubSyncResult> {
  const rpcUrl =
    input?.rpcUrl?.trim() ||
    process.env.SALE_RPC_BASE?.trim() ||
    process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() ||
    "https://mainnet.base.org";

  const rpc: JsonRpcTransport =
    input?.rpc ??
    (async (method, params) => {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `rpc_http_${res.status}`);
      }
      return json.result;
    });

  const now = input?.now ?? new Date();
  const db = await getDbReady();

  const [cursorRow] = await db
    .select()
    .from(saleChainCursors)
    .where(
      and(
        eq(saleChainCursors.chainId, BASE_CHAIN_ID),
        eq(saleChainCursors.contractAddress, CONTRACT),
      ),
    )
    .limit(1);

  const headHex = (await rpc("eth_blockNumber", [])) as `0x${string}`;
  const headBlockNumber = Number(BigInt(headHex));

  let fromBlock = cursorRow?.lastScannedBlock ?? 0;
  if (fromBlock > 0) {
    fromBlock = Math.max(0, fromBlock - REORG_LOOKBACK_BLOCKS);
  } else {
    fromBlock = Math.max(0, headBlockNumber - REORG_LOOKBACK_BLOCKS);
  }

  const events: Awaited<ReturnType<typeof fetchCurveHubEventsFromRpc>>["events"] = [];
  for (let start = fromBlock; start <= headBlockNumber; start += SCAN_CHUNK + 1) {
    const end = Math.min(headBlockNumber, start + SCAN_CHUNK);
    const chunk = await fetchCurveHubEventsFromRpc({
      rpc,
      contractAddress: CONTRACT,
      fromBlock: start,
      toBlock: end,
    });
    events.push(...chunk.events);
  }

  const minBlock = Math.max(0, fromBlock - REORG_LOOKBACK_BLOCKS);
  const purchaseRows = await db
    .select()
    .from(salePurchases)
    .where(
      and(
        eq(salePurchases.chainId, BASE_CHAIN_ID),
        eq(salePurchases.contractAddress, CONTRACT),
        gte(salePurchases.blockNumber, minBlock),
      ),
    );

  const existingPurchases = purchaseRows.map(mapPurchaseRow);
  const purchaseIds = existingPurchases.map((p) => p.id);

  const commissionRows =
    purchaseIds.length > 0
      ? await db
          .select()
          .from(referralCommissionLedgers)
          .where(inArray(referralCommissionLedgers.purchaseId, purchaseIds))
      : [];

  const existingCommissions = commissionRows.map(mapCommissionRow);
  const existingCommissionIds = new Set(existingCommissions.map((c) => c.id));
  const directory = await loadAttributionDirectory();
  const priorVolumeByUserMicro = await loadPriorVolumeByUser();

  const headBlockHashHex = (await rpc("eth_getBlockByNumber", [
    `0x${headBlockNumber.toString(16)}`,
    false,
  ])) as { hash?: string } | null;

  const output = processCurveHubEventsBatch({
    headBlockNumber,
    minConfirmations: MIN_BASE_CONFIRMATIONS,
    canonicalBlockHashes: new Map(),
    events,
    existingPurchases,
    existingCommissions,
    directory,
    priorVolumeByUserMicro,
    tierConfig: loadKolTierConfig(),
  });

  await persistSyncResults({
    headBlockNumber,
    headBlockHash: headBlockHashHex?.hash?.toLowerCase() ?? null,
    existingCommissionIds,
    output,
    newCommissionEntries: output.newCommissions,
    now,
  });

  const maturedCommissions = await maturePendingCommissions(now);

  return {
    ok: true,
    fromBlock,
    toBlock: headBlockNumber,
    headBlockNumber,
    eventsFetched: events.length,
    newPurchases: output.newPurchases.length,
    newCommissions: output.newCommissions.length,
    unconfirmedSkipped: output.unconfirmedSkipped,
    duplicateSkipped: output.duplicateSkipped,
    reorged: output.reorgedPurchaseIds.length,
    maturedCommissions,
  };
}
