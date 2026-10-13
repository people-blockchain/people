import { getAddress } from "viem";
import { evmJsonRpc, weiToPpl } from "@/lib/evm/rpc-server";
import { readEvmDeployments } from "@/lib/evm/config";

const AGENT_SPEND_TOPIC = "0x01dea9e942d4b524a073c8dd6160dee9ee4ea0c986c2f56171be67d0fdc149da";

/** CommunityAgentWallet v2 redeploy block (AUD-M3/M4); scanning from genesis is wasteful on a long-lived testnet. */
const AGENT_WALLET_V2_DEPLOY_BLOCK = 174_800;

export type AgentSpendEvent = {
  recipient: string;
  amountPpl: number;
  blockNumber: number;
  transactionHash: string;
  timestampMs: number | null;
};

export type CommunityAgentSnapshot = {
  wallet: string;
  executor: string;
  guardian: string;
  balancePpl: number;
  events: AgentSpendEvent[];
};

export function communityAgentAddresses(): { wallet: string | null; executor: string | null; guardian: string | null } {
  const contracts = readEvmDeployments().contracts;
  return {
    wallet: contracts.agentWallet ?? null,
    executor: contracts.agentWalletExecutor ?? null,
    guardian: contracts.peopleMultisig ?? null,
  };
}

function hexToNumber(hex: string | undefined): number {
  if (!hex) return 0;
  return Number.parseInt(hex, 16);
}

type RpcLog = {
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
};

async function fetchAgentSpendLogs(wallet: string, fromBlock: number, latest: number): Promise<RpcLog[]> {
  const logs: RpcLog[] = [];
  // Cosmos EVM caps eth_getLogs at 10,000 blocks per query; scan in windows.
  for (let start = Math.max(0, fromBlock); start <= latest; start += 9_000) {
    const end = Math.min(latest, start + 8_999);
    const chunk = await evmJsonRpc<RpcLog[]>("eth_getLogs", [
      {
        address: wallet,
        topics: [AGENT_SPEND_TOPIC],
        fromBlock: `0x${start.toString(16)}`,
        toBlock: `0x${end.toString(16)}`,
      },
    ]);
    if (Array.isArray(chunk)) logs.push(...chunk);
  }
  return logs;
}

export async function fetchCommunityAgentSnapshot(limit = 10): Promise<CommunityAgentSnapshot> {
  const { wallet, executor, guardian } = communityAgentAddresses();
  if (!wallet || !executor || !guardian) throw new Error("community_agent_wallet_unconfigured");
  const walletAddr = getAddress(wallet);

  const [balanceHex, latestHex] = await Promise.all([
    evmJsonRpc<string>("eth_getBalance", [walletAddr, "latest"]),
    evmJsonRpc<string>("eth_blockNumber", []),
  ]);
  const latest = hexToNumber(latestHex);

  const logs = await fetchAgentSpendLogs(walletAddr, AGENT_WALLET_V2_DEPLOY_BLOCK, latest);
  const parsed = logs
    .map((log) => {
      const topics = log.topics ?? [];
      const recipientTopic = topics[2];
      const recipient = recipientTopic && recipientTopic.length >= 66 ? getAddress(`0x${recipientTopic.slice(26)}`) : "";
      const amountPpl = weiToPpl(BigInt(log.data ?? "0x0"));
      return {
        recipient,
        amountPpl,
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash ?? "",
      };
    })
    .filter((event) => event.recipient && event.transactionHash)
    .sort((a, b) => b.blockNumber - a.blockNumber)
    .slice(0, limit);

  const uniqueBlocks = [...new Set(parsed.map((e) => e.blockNumber))];
  const blockTimestamps = new Map<number, number | null>();
  await Promise.all(
    uniqueBlocks.map(async (blockNumber) => {
      try {
        const block = await evmJsonRpc<{ timestamp?: string }>("eth_getBlockByNumber", [
          `0x${blockNumber.toString(16)}`,
          false,
        ]);
        const seconds = hexToNumber(block?.timestamp);
        blockTimestamps.set(blockNumber, seconds > 0 ? seconds * 1000 : null);
      } catch {
        blockTimestamps.set(blockNumber, null);
      }
    }),
  );
  const events: AgentSpendEvent[] = parsed.map((event) => ({
    ...event,
    timestampMs: blockTimestamps.get(event.blockNumber) ?? null,
  }));

  return {
    wallet: walletAddr,
    executor: getAddress(executor),
    guardian: getAddress(guardian),
    balancePpl: weiToPpl(BigInt(balanceHex ?? "0x0")),
    events,
  };
}
