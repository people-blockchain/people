import { count, eq } from "drizzle-orm";
import { getAddress, isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { getDbReady } from "@/db";
import { founderDemoTokenAirdrops, founders } from "@/db/schema";
import { peopleEvmChain, readEvmDeployments, readEvmRpcUrl } from "@/lib/evm/config";
import { evmPublicClient, estimateGasMargin, legacyGasOverrides } from "@/lib/evm/legacy-gas";
import { VERIFICATION_LEVEL_TELEGRAM_PHONE } from "./verification";

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
    // A row without a tx summary is a claim reserved but not yet delivered.
    if (!row[0].txSummary) return { state: "pending" };
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
  const recipient = getAddress(wallet);

  // Reserve the (unique) claim row before any transfer. A parallel request loses this
  // insert and bails out, so one user cannot double-claim or overshoot the global cap.
  const reserved = await db
    .insert(founderDemoTokenAirdrops)
    .values({ userId, walletAddress: recipient.toLowerCase(), txSummary: null })
    .onConflictDoNothing()
    .returning({ userId: founderDemoTokenAirdrops.userId });
  if (reserved.length === 0) {
    return { state: "pending" };
  }

  try {
    const total = await db.select({ c: count() }).from(founderDemoTokenAirdrops);
    if (Number(total[0]?.c ?? 0) > FOUNDER_DEMO_AIRDROP_CAP) {
      await db.delete(founderDemoTokenAirdrops).where(eq(founderDemoTokenAirdrops.userId, userId));
      return { state: "cap_reached" };
    }

    const dep = readEvmDeployments();
    const assetMap = dep.assetMap ?? {};
    const rpc = readEvmRpcUrl();
    const publicClient = evmPublicClient();
    const account = privateKeyToAccount(pk);
    const walletClient = createWalletClient({
      account,
      chain: { ...peopleEvmChain, rpcUrls: { default: { http: [rpc] } } },
      transport: http(rpc),
    });
    const fees = await legacyGasOverrides(publicClient);
    const txHashes: string[] = [];

    for (const assetId of FOUNDER_DEMO_ASSET_IDS) {
      const token = assetMap[assetId];
      if (!token || !isAddress(token)) {
        // Tokens not deployed yet: release the reservation so the claim can retry later.
        await db.delete(founderDemoTokenAirdrops).where(eq(founderDemoTokenAirdrops.userId, userId));
        return { state: "pending" };
      }
      const tokenAddr = getAddress(token);
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
      const hash = await walletClient.writeContract({
        address: tokenAddr,
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipient, amount],
        ...fees,
        gas,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      txHashes.push(hash);
    }

    await db
      .update(founderDemoTokenAirdrops)
      .set({ txSummary: JSON.stringify(txHashes) })
      .where(eq(founderDemoTokenAirdrops.userId, userId));

    return {
      state: "received",
      tokensPerKind: FOUNDER_DEMO_TOKENS_PER_KIND,
      kinds: FOUNDER_DEMO_ASSET_IDS.length,
    };
  } catch (error) {
    // Transfers failed part-way: drop the reservation so a retry is possible.
    await db.delete(founderDemoTokenAirdrops).where(eq(founderDemoTokenAirdrops.userId, userId)).catch(() => {});
    throw error;
  }
}
