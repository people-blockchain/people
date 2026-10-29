import { decodeEventLog, decodeFunctionData, getAddress, type Abi, type Hex } from "viem";
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
  | "sender_mismatch"
  | "wrong_contract"
  | "event_missing"
  | "not_verifiable";

export type ChainVerifyResult =
  | { ok: true; swapAmountPpl?: number; stakeAmountPpl?: number }
  | { ok: false; error: ChainVerifyError };

export type ChainVerifyLog = { address: string; data: Hex; topics: readonly Hex[] };

export type ChainVerifyReceipt = {
  status: string;
  from: string;
  to?: string | null;
  logs: readonly ChainVerifyLog[];
};

/** The slice of a viem public client the verifier uses; tests inject a mock. */
export type ChainVerifyClient = {
  getTransactionReceipt(args: { hash: Hex }): Promise<ChainVerifyReceipt>;
  getTransaction(args: { hash: Hex }): Promise<{ input: Hex }>;
  readContract(args: { address: Hex; abi: Abi; functionName: string }): Promise<unknown>;
};

const tokenCreatedAbi = [
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "decimals", type: "uint8", indexed: false },
      { name: "totalSupply", type: "uint256", indexed: false },
      {
        name: "allocation",
        type: "tuple",
        indexed: false,
        components: [
          { name: "bondingCurve", type: "uint256" },
          { name: "communityPool", type: "uint256" },
          { name: "creator", type: "uint256" },
          { name: "liquidityReserve", type: "uint256" },
          { name: "ecosystemReserve", type: "uint256" },
        ],
      },
      { name: "leftoverMode", type: "uint8", indexed: false },
    ],
  },
  // Pre-leftoverMode factories emit the same event without the trailing field.
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "decimals", type: "uint8", indexed: false },
      { name: "totalSupply", type: "uint256", indexed: false },
      {
        name: "allocation",
        type: "tuple",
        indexed: false,
        components: [
          { name: "bondingCurve", type: "uint256" },
          { name: "communityPool", type: "uint256" },
          { name: "creator", type: "uint256" },
          { name: "liquidityReserve", type: "uint256" },
          { name: "ecosystemReserve", type: "uint256" },
        ],
      },
    ],
  },
] as const;

const nftMintedAbi = [
  {
    type: "event",
    name: "NftMinted",
    inputs: [
      { name: "collection", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "tokenURI", type: "string", indexed: false },
    ],
  },
] as const;

const pairCreatedAbi = [
  {
    type: "event",
    name: "PairCreated",
    inputs: [
      { name: "token0", type: "address", indexed: true },
      { name: "token1", type: "address", indexed: true },
      { name: "pair", type: "address", indexed: false },
      { name: "", type: "uint256", indexed: false },
    ],
  },
] as const;

/** OpenZeppelin Governor (v5): `VoteCast` and `VoteCastWithParams` both carry the voter as topic 1. */
const voteCastAbi = [
  {
    type: "event",
    name: "VoteCast",
    inputs: [
      { name: "voter", type: "address", indexed: true },
      { name: "proposalId", type: "uint256", indexed: false },
      { name: "support", type: "uint8", indexed: false },
      { name: "weight", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VoteCastWithParams",
    inputs: [
      { name: "voter", type: "address", indexed: true },
      { name: "proposalId", type: "uint256", indexed: false },
      { name: "support", type: "uint8", indexed: false },
      { name: "weight", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
      { name: "params", type: "bytes", indexed: false },
    ],
  },
] as const;

const curveEventsAbi = [
  {
    type: "event",
    name: "CurveBuy",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "nativeIn", type: "uint256", indexed: false },
      { name: "tokensOut", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CurveSell",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "tokensIn", type: "uint256", indexed: false },
      { name: "nativeOut", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
] as const;

const factoryGetterAbi = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

type Deployments = ReturnType<typeof readEvmDeployments>;

/** Every configured address for a contract family, e.g. `tokenFactory`, `tokenFactoryV1`..`V4`. */
function familyAddresses(deployments: Deployments, family: string): Set<string> {
  const re = new RegExp(`^${family}(V\\d+)?$`);
  const out = new Set<string>();
  for (const [key, addr] of Object.entries(deployments.contracts)) {
    if (!re.test(key) || !addr) continue;
    try {
      out.add(getAddress(addr).toLowerCase());
    } catch {
      /* malformed config entry: ignore */
    }
  }
  return out;
}

function decodeLog(abi: Abi, log: ChainVerifyLog): { eventName: string; args: Record<string, unknown> } | null {
  try {
    const d = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    return { eventName: String(d.eventName), args: (d.args ?? {}) as Record<string, unknown> };
  } catch {
    return null;
  }
}

const sameAddress = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

/**
 * Verifies, from the tx receipt itself, that `walletAddress` really performed `action`.
 * Every action requires a successful tx sent by the wallet and an event emitted by a contract
 * configured in the deployments file (all versions of the relevant family).
 *
 * - swap: a Swap log from any pair whose `factory()` is a configured AMM factory (tx sent to a
 *   configured router), or a CurveBuy/CurveSell from a configured bonding curve by the wallet.
 * - stake: cosmos-evm staking precompile `delegate` call.
 * - token_launch / nft_mint / pool_create / governance_vote: the matching factory/governor event.
 *
 * `client` is injectable for tests and defaults to the live public client.
 */
export async function verifyFounderActionOnChain(
  action: string,
  txHash: string,
  walletAddress: string,
  client?: ChainVerifyClient,
): Promise<ChainVerifyResult> {
  const verifiable = ["swap", "stake", "token_launch", "nft_mint", "pool_create", "governance_vote"];
  if (!verifiable.includes(action)) {
    return { ok: false, error: "not_verifiable" };
  }
  if (!TX_HASH_RE.test(txHash)) {
    return { ok: false, error: "invalid_tx_hash" };
  }

  const rpc = client ?? (evmPublicClient() as unknown as ChainVerifyClient);
  const receipt = await rpc.getTransactionReceipt({ hash: txHash as Hex }).catch(() => null);
  if (!receipt) return { ok: false, error: "tx_not_found" };
  if (receipt.status !== "success") return { ok: false, error: "tx_failed" };
  if (receipt.from.toLowerCase() !== walletAddress.toLowerCase()) {
    return { ok: false, error: "wallet_mismatch" };
  }

  if (action === "stake") {
    if (receipt.to?.toLowerCase() !== STAKING_PRECOMPILE_ADDRESS.toLowerCase()) {
      return { ok: false, error: "wrong_contract" };
    }
    const tx = await rpc.getTransaction({ hash: txHash as Hex }).catch(() => null);
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
  const logsFrom = (addrs: Set<string>) => receipt.logs.filter((l) => addrs.has(l.address.toLowerCase()));

  if (action === "token_launch") {
    const logs = logsFrom(familyAddresses(deployments, "tokenFactory"));
    if (!logs.length) return { ok: false, error: receipt.logs.length ? "wrong_contract" : "event_missing" };
    let sawEvent = false;
    for (const log of logs) {
      const d = decodeLog(tokenCreatedAbi, log);
      if (!d || d.eventName !== "TokenCreated") continue;
      sawEvent = true;
      if (sameAddress(d.args.creator, walletAddress)) return { ok: true };
    }
    return { ok: false, error: sawEvent ? "sender_mismatch" : "event_missing" };
  }

  if (action === "nft_mint") {
    // NftFactory.mint emits NftMinted itself (owner = msg.sender), so the factory is the emitter.
    let sawEvent = false;
    for (const log of logsFrom(familyAddresses(deployments, "nftFactory"))) {
      const d = decodeLog(nftMintedAbi, log);
      if (!d || d.eventName !== "NftMinted") continue;
      sawEvent = true;
      if (sameAddress(d.args.owner, walletAddress)) return { ok: true };
    }
    return { ok: false, error: sawEvent ? "sender_mismatch" : "event_missing" };
  }

  if (action === "pool_create") {
    // Curve migration also creates a pair inside someone else's buy tx; only a direct
    // factory/router call counts as the wallet creating a pool.
    const factories = familyAddresses(deployments, "ammFactory");
    const target = receipt.to?.toLowerCase() ?? "";
    if (!factories.has(target) && !familyAddresses(deployments, "router").has(target)) {
      return { ok: false, error: "wrong_contract" };
    }
    for (const log of logsFrom(factories)) {
      const d = decodeLog(pairCreatedAbi, log);
      if (d?.eventName === "PairCreated") return { ok: true };
    }
    return { ok: false, error: "event_missing" };
  }

  if (action === "governance_vote") {
    const governor = deployments.contracts.governor;
    if (!governor) return { ok: false, error: "wrong_contract" };
    let sawEvent = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== governor.toLowerCase()) continue;
      const d = decodeLog(voteCastAbi, log);
      if (!d) continue;
      sawEvent = true;
      if (sameAddress(d.args.voter, walletAddress)) return { ok: true };
    }
    return { ok: false, error: sawEvent ? "sender_mismatch" : "event_missing" };
  }

  // swap
  const routers = familyAddresses(deployments, "router");
  const curves = familyAddresses(deployments, "bondingCurve");
  const target = receipt.to?.toLowerCase() ?? "";

  if (curves.has(target)) {
    let sawEvent = false;
    for (const log of logsFrom(curves)) {
      const d = decodeLog(curveEventsAbi, log);
      if (!d) continue;
      sawEvent = true;
      const trader = d.eventName === "CurveBuy" ? d.args.buyer : d.args.seller;
      if (!sameAddress(trader, walletAddress)) continue;
      const native = (d.eventName === "CurveBuy" ? d.args.nativeIn : d.args.nativeOut) as bigint;
      return { ok: true, swapAmountPpl: Number(native) / 1e18 };
    }
    return { ok: false, error: sawEvent ? "sender_mismatch" : "event_missing" };
  }

  if (!routers.has(target)) {
    return { ok: false, error: "wrong_contract" };
  }
  const factories = familyAddresses(deployments, "ammFactory");
  const wppl = deployments.contracts.wppl?.toLowerCase();
  const checkedPairs = new Map<string, boolean>();
  for (const log of receipt.logs) {
    const d = decodeLog(swapEventAbi as unknown as Abi, log);
    if (!d || d.eventName !== "Swap") continue;
    const pair = log.address.toLowerCase();
    let fromFactory = checkedPairs.get(pair);
    if (fromFactory === undefined) {
      const f = await rpc
        .readContract({ address: log.address as Hex, abi: factoryGetterAbi as unknown as Abi, functionName: "factory" })
        .catch(() => null);
      fromFactory = typeof f === "string" && factories.has(f.toLowerCase());
      checkedPairs.set(pair, fromFactory);
    }
    if (!fromFactory) continue;
    const args = d.args as {
      amount0In: bigint;
      amount1In: bigint;
      amount0Out: bigint;
      amount1Out: bigint;
    };
    const token0 = await rpc
      .readContract({ address: log.address as Hex, abi: token0Abi as unknown as Abi, functionName: "token0" })
      .catch(() => null);
    const wpplIsToken0 = typeof token0 === "string" && token0.toLowerCase() === wppl;
    const moved = wpplIsToken0
      ? (args.amount0In > args.amount0Out ? args.amount0In : args.amount0Out)
      : (args.amount1In > args.amount1Out ? args.amount1In : args.amount1Out);
    return { ok: true, swapAmountPpl: Number(moved) / 1e18 };
  }
  return { ok: false, error: "event_missing" };
}
