import { decodeEventLog, decodeFunctionData, type Hex } from "viem";
import { evmPublicClient } from "@/lib/evm/legacy-gas";
import { readEvmDeployments } from "@/lib/evm/config";
import { STAKING_PRECOMPILE_ADDRESS, stakingAbi } from "@/lib/evm/staking-abi";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

const swapEventAbi = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount0In", type: "uint256", indexed: false },
      { name: "amount1In", type: "uint256", indexed: false },
      { name: "amount0Out", type: "uint256", indexed: false },
      { name: "amount1Out", type: "uint256", indexed: false },
      { name: "to", type: "address", indexed: true },
    ],
  },
] as const;

const token0Abi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const creatorAbi = [
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const TOKEN_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * `PeopleProjectToken.creator` is set once at mint (`TokenFactory.createToken`) and immutable.
 * Used to gate issuer-only actions (e.g. `registerIssuerReferralProgram`) so a wallet cannot
 * claim the issuer role, and its referral allocation, on a token it did not launch.
 */
export async function verifyTokenCreatorOnChain(
  tokenAddress: string,
  walletAddress: string,
): Promise<boolean> {
  if (!TOKEN_ADDRESS_RE.test(tokenAddress) || !TOKEN_ADDRESS_RE.test(walletAddress)) {
    return false;
  }
  const client = evmPublicClient();
  const creator = await client
    .readContract({ address: tokenAddress as Hex, abi: creatorAbi, functionName: "creator" })
    .catch(() => null);
  return typeof creator === "string" && creator.toLowerCase() === walletAddress.toLowerCase();
}

export type ChainVerifyError =
  | "invalid_tx_hash"
  | "tx_not_found"
  | "tx_failed"
  | "wallet_mismatch"
  | "wrong_contract"
  | "event_missing"
  | "not_verifiable";

export type ChainVerifyResult =
  | { ok: true; swapAmountPpl?: number; stakeAmountPpl?: number }
  | { ok: false; error: ChainVerifyError };

/**
 * "swap" and "stake" have a real on-chain contract call we can check against (the swap UI
 * calls PeopleRouter directly; the staking UI calls the cosmos-evm staking precompile's
 * `delegate`). The other action types in FOUNDER_ACTION_TYPES have no wired chain call we
 * can verify yet, so they are rejected rather than trusted on the client's word.
 */
export async function verifyFounderActionOnChain(
  action: string,
  txHash: string,
  walletAddress: string,
): Promise<ChainVerifyResult> {
  if (action !== "swap" && action !== "stake") {
    return { ok: false, error: "not_verifiable" };
  }
  if (!TX_HASH_RE.test(txHash)) {
    return { ok: false, error: "invalid_tx_hash" };
  }

  const client = evmPublicClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash as Hex }).catch(() => null);
  if (!receipt) return { ok: false, error: "tx_not_found" };
  if (receipt.status !== "success") return { ok: false, error: "tx_failed" };
  if (receipt.from.toLowerCase() !== walletAddress.toLowerCase()) {
    return { ok: false, error: "wallet_mismatch" };
  }

  if (action === "stake") {
    if (receipt.to?.toLowerCase() !== STAKING_PRECOMPILE_ADDRESS.toLowerCase()) {
      return { ok: false, error: "wrong_contract" };
    }
    const tx = await client.getTransaction({ hash: txHash as Hex }).catch(() => null);
    if (!tx) return { ok: false, error: "tx_not_found" };
    let decoded;
    try {
      decoded = decodeFunctionData({ abi: stakingAbi, data: tx.input });
    } catch {
      return { ok: false, error: "event_missing" };
    }
    if (decoded.functionName !== "delegate") {
      return { ok: false, error: "event_missing" };
    }
    const [delegatorAddress, , amount] = decoded.args as [string, string, bigint];
    if (delegatorAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return { ok: false, error: "wallet_mismatch" };
    }
    return { ok: true, stakeAmountPpl: Number(amount) / 1e18 };
  }

  const deployments = readEvmDeployments();
  const router = deployments.contracts.router?.toLowerCase();
  if (!router || receipt.to?.toLowerCase() !== router) {
    return { ok: false, error: "wrong_contract" };
  }
  const pairAddresses = new Set(deployments.pools.map((p) => p.poolId.toLowerCase()));
  const wppl = deployments.contracts.wppl?.toLowerCase();
  for (const log of receipt.logs) {
    if (!pairAddresses.has(log.address.toLowerCase())) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: swapEventAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName !== "Swap") continue;
    const args = decoded.args as {
      amount0In: bigint;
      amount1In: bigint;
      amount0Out: bigint;
      amount1Out: bigint;
    };
    const token0 = await client
      .readContract({ address: log.address, abi: token0Abi, functionName: "token0" })
      .catch(() => null);
    const wpplIsToken0 = typeof token0 === "string" && token0.toLowerCase() === wppl;
    const moved = wpplIsToken0
      ? (args.amount0In > args.amount0Out ? args.amount0In : args.amount0Out)
      : (args.amount1In > args.amount1Out ? args.amount1In : args.amount1Out);
    return { ok: true, swapAmountPpl: Number(moved) / 1e18 };
  }
  return { ok: false, error: "event_missing" };
}
