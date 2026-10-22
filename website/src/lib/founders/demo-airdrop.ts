import { and, count, eq, isNull } from "drizzle-orm";
import { encodeFunctionData, getAddress, isAddress, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getDbReady } from "@/db";
import { founderDemoTokenAirdrops, founders } from "@/db/schema";
import { peopleEvmChain, readEvmDeployments } from "@/lib/evm/config";
import { evmPublicClient, estimateGasMargin, legacyGasOverrides } from "@/lib/evm/legacy-gas";
import { VERIFICATION_LEVEL_TELEGRAM_PHONE } from "./verification";
import {
  isAirdropDelivered,
  isLeaseHeld,
  parseAirdropProgress,
  serializeAirdropProgress,
  type AirdropProgress,
} from "./demo-airdrop-progress";

export const FOUNDER_DEMO_AIRDROP_CAP = 10_000;
export const FOUNDER_DEMO_TOKENS_PER_KIND = 100;
export const FOUNDER_DEMO_ASSET_IDS = ["trosc2", "tpitp2", "tmark2", "tkrda", "tmem", "tgood"] as const;

const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export type FounderDemoAirdropStatus =
  | { state: "disabled" }
  | { state: "ineligible" }
  | { state: "cap_reached" }
  | { state: "pending" }
  | { state: "received"; tokensPerKind: number; kinds: number };

function distributorPrivateKey(): Hex | null {
  const raw = process.env.FOUNDERS_AIRDROP_PRIVATE_KEY?.trim();
  if (!raw?.startsWith("0x")) return null;
  return raw as Hex;
}

export async function getFounderDemoAirdropStatus(userId: string): Promise<FounderDemoAirdropStatus> {
  if (!distributorPrivateKey()) return { state: "disabled" };
  const db = await getDbReady();
  const row = await db.select().from(founderDemoTokenAirdrops).where(eq(founderDemoTokenAirdrops.userId, userId)).limit(1);
  if (row[0]) {
    // A row without a completed tx summary is a claim reserved but not yet delivered.
    if (!isAirdropDelivered(row[0].txSummary)) return { state: "pending" };
    return {
      state: "received",
      tokensPerKind: FOUNDER_DEMO_TOKENS_PER_KIND,
      kinds: FOUNDER_DEMO_ASSET_IDS.length,
    };
  }
  const founder = await db.select().from(founders).where(eq(founders.userId, userId)).limit(1);
  if (!founder[0] || founder[0].verificationLevel < VERIFICATION_LEVEL_TELEGRAM_PHONE) {
    return { state: "ineligible" };
  }
  if (founder[0].isBot) {
    return { state: "ineligible" };
  }
  const total = await db.select({ c: count() }).from(founderDemoTokenAirdrops);
  if (Number(total[0]?.c ?? 0) >= FOUNDER_DEMO_AIRDROP_CAP) {
    return { state: "cap_reached" };
  }
  const assetMap = readEvmDeployments().assetMap ?? {};
  const ready = FOUNDER_DEMO_ASSET_IDS.every((id) => assetMap[id] && isAddress(assetMap[id]));
  if (!ready) return { state: "pending" };
  return { state: "pending" };
}

/** One request drives delivery at a time; a crashed/timed-out request's lease expires. */
const AIRDROP_LEASE_MS = 90_000;
/** Bound on how long one HTTP request waits for receipts; the client re-POSTs while pending. */
const AIRDROP_RECEIPT_WAIT_MS = 20_000;

const NONCE_TOO_LOW = /nonce too low|lower than the current nonce/i;

const summaryIs = (userId: string, prev: string | null) =>
  and(
    eq(founderDemoTokenAirdrops.userId, userId),
    prev === null ? isNull(founderDemoTokenAirdrops.txSummary) : eq(founderDemoTokenAirdrops.txSummary, prev),
  );

/**
 * AUDIT M3: the claim is idempotent. Every transfer is signed locally and recorded (hash + raw
 * tx) via a compare-and-swap on `txSummary` *before* it is broadcast, so after a partial
 * failure or a killed function the next attempt confirms or re-broadcasts the recorded
 * transactions and only sends the missing ones — it never pays out twice. Transfers are sent
 * back-to-back with explicit nonces and receipts are awaited in parallel with a bounded wait;
 * if they are not mined yet the claim stays `pending` and the next POST picks it up.
 */
export async function claimFounderDemoAirdrop(userId: string): Promise<FounderDemoAirdropStatus> {
  const status = await getFounderDemoAirdropStatus(userId);
  if (status.state === "received" || status.state === "disabled" || status.state === "ineligible" || status.state === "cap_reached") {
    return status;
  }

  const pk = distributorPrivateKey();
  if (!pk) return { state: "disabled" };

  const db = await getDbReady();
  const founder = await db.select().from(founders).where(eq(founders.userId, userId)).limit(1);
  if (!founder[0] || founder[0].verificationLevel < VERIFICATION_LEVEL_TELEGRAM_PHONE) {
    return { state: "ineligible" };
  }
  if (founder[0].isBot) return { state: "ineligible" };

  const wallet = founder[0].walletAddress?.trim();
  if (!wallet || !isAddress(wallet)) return { state: "ineligible" };

  const received: FounderDemoAirdropStatus = {
    state: "received",
    tokensPerKind: FOUNDER_DEMO_TOKENS_PER_KIND,
    kinds: FOUNDER_DEMO_ASSET_IDS.length,
  };

  // Reserve the (unique) claim row before any transfer. A parallel request loses this
  // insert, so one user cannot overshoot the global cap.
  const reserved = await db
    .insert(founderDemoTokenAirdrops)
    .values({ userId, walletAddress: getAddress(wallet).toLowerCase(), txSummary: null })
    .onConflictDoNothing()
    .returning({ userId: founderDemoTokenAirdrops.userId });
  if (reserved.length > 0) {
    const total = await db.select({ c: count() }).from(founderDemoTokenAirdrops);
    if (Number(total[0]?.c ?? 0) > FOUNDER_DEMO_AIRDROP_CAP) {
      await db.delete(founderDemoTokenAirdrops).where(summaryIs(userId, null));
      return { state: "cap_reached" };
    }
  }

  const rows = await db.select().from(founderDemoTokenAirdrops).where(eq(founderDemoTokenAirdrops.userId, userId)).limit(1);
  if (!rows[0]) return { state: "pending" };
  // Pay the address recorded at reservation time, so a resumed claim never splits across wallets.
  const recipient = getAddress(rows[0].walletAddress);
  let stored: string | null = rows[0].txSummary;
  const initial = parseAirdropProgress(stored);
  if (!initial) return received;
  if (isLeaseHeld(initial)) return { state: "pending" };

  // Compare-and-swap the progress JSON; false means another request changed it under us.
  const save = async (next: AirdropProgress): Promise<boolean> => {
    const value = serializeAirdropProgress(next);
    const updated = await db
      .update(founderDemoTokenAirdrops)
      .set({ txSummary: value })
      .where(summaryIs(userId, stored))
      .returning({ userId: founderDemoTokenAirdrops.userId });
    if (updated.length === 0) return false;
    stored = value;
    return true;
  };

  const progress: AirdropProgress = { ...initial, leaseUntil: Date.now() + AIRDROP_LEASE_MS };
  if (!(await save(progress))) return { state: "pending" };

  const releaseLease = async () => {
    if (Object.keys(progress.sent).length === 0) {
      // Nothing was ever signed: drop the reservation so a later retry starts clean.
      await db.delete(founderDemoTokenAirdrops).where(summaryIs(userId, stored));
      return;
    }
    await save({ ...progress, leaseUntil: 0 });
  };

  try {
    const assetMap = readEvmDeployments().assetMap ?? {};
    if (!FOUNDER_DEMO_ASSET_IDS.every((id) => assetMap[id] && isAddress(assetMap[id]))) {
      // Tokens not deployed yet: release so the claim can retry later.
      await releaseLease();
      return { state: "pending" };
    }

    const publicClient = evmPublicClient();
    const account = privateKeyToAccount(pk);

    // 1) Reconcile transfers recorded by an earlier attempt.
    for (const [assetId, rec] of Object.entries(progress.sent)) {
      const receipt = await publicClient.getTransactionReceipt({ hash: rec.hash }).catch(() => null);
      if (receipt) {
        // Reverted: nothing moved, so it is safe to send this one again.
        if (receipt.status !== "success") delete progress.sent[assetId];
        continue;
      }
      try {
        await publicClient.sendRawTransaction({ serializedTransaction: rec.raw });
      } catch (error) {
        const known = await publicClient.getTransaction({ hash: rec.hash }).catch(() => null);
        const message = error instanceof Error ? error.message : String(error);
        // Its nonce was taken by another tx and it is nowhere to be found: it can never mine.
        if (!known && NONCE_TOO_LOW.test(message)) delete progress.sent[assetId];
      }
    }

    // 2) Sign + record + broadcast whatever is still missing.
    const missing = FOUNDER_DEMO_ASSET_IDS.filter((id) => !progress.sent[id]);
    if (missing.length > 0) {
      const fees = await legacyGasOverrides(publicClient);
      let nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
      for (const assetId of missing) {
        const tokenAddr = getAddress(assetMap[assetId]);
        const decimals = Number(
          await publicClient.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "decimals" }),
        );
        const amount = BigInt(FOUNDER_DEMO_TOKENS_PER_KIND) * BigInt(10) ** BigInt(decimals);
        const gas = await estimateGasMargin(publicClient, () =>
          publicClient.estimateContractGas({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: "transfer",
            args: [recipient, amount],
            account,
          }),
        );
        const raw = await account.signTransaction({
          type: "legacy",
          chainId: peopleEvmChain.id,
          nonce,
          to: tokenAddr,
          data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, amount] }),
          gas,
          gasPrice: fees.gasPrice,
        });
        const hash = keccak256(raw);
        progress.sent[assetId] = { hash, raw };
        // Record before broadcasting: if this write fails, nothing has been sent.
        if (!(await save(progress))) {
          delete progress.sent[assetId];
          return { state: "pending" };
        }
        await publicClient.sendRawTransaction({ serializedTransaction: raw });
        nonce += 1;
      }
    }

    // 3) Bounded wait for receipts; anything still unmined is resumed by the next POST.
    const entries = Object.entries(progress.sent);
    const receipts = await Promise.allSettled(
      entries.map(([, rec]) =>
        publicClient.waitForTransactionReceipt({ hash: rec.hash, timeout: AIRDROP_RECEIPT_WAIT_MS }),
      ),
    );
    let done = true;
    receipts.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.status === "success") return;
      done = false;
      if (r.status === "fulfilled") delete progress.sent[entries[i][0]];
    });

    if (done && FOUNDER_DEMO_ASSET_IDS.every((id) => progress.sent[id])) {
      const hashes = FOUNDER_DEMO_ASSET_IDS.map((id) => progress.sent[id].hash);
      await db
        .update(founderDemoTokenAirdrops)
        .set({ txSummary: JSON.stringify(hashes) })
        .where(summaryIs(userId, stored));
      return received;
    }
    await releaseLease();
    return { state: "pending" };
  } catch (error) {
    // Keep every recorded transfer (they may already be on chain); only give up the lease so a
    // retry reconciles them instead of paying out again.
    await releaseLease().catch(() => {});
    throw error;
  }
}
