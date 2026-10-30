import { getAddress } from "viem";
import { evmJsonRpc, weiToPpl } from "@/lib/evm/rpc-server";
import { readEvmDeployments } from "@/lib/evm/config";
import { fetchLogsWindowed } from "@/lib/evm/chain-catalog";

const AGENT_SPEND_TOPIC = "0x01dea9e942d4b524a073c8dd6160dee9ee4ea0c986c2f56171be67d0fdc149da";

/**
 * CommunityAgentWallet v2 deploy block (first block with code: 220 464). Used only when the
 * deployment JSON has no `startBlocks.agentWallet` entry.
 */
const AGENT_WALLET_V2_DEPLOY_BLOCK = 220_464;

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

/**
 * Spend logs go through the shared windowed scanner: immutable windows are cached across requests
 * and server instances, node reads are capped at two windows in flight, and the RPC layer backs off
 * when the node is unhealthy (previously ~38 uncached sequential `eth_getLogs` per request).
 */
async function fetchAgentSpendLogs(wallet: string): Promise<RpcLog[]> {
  const configured = readEvmDeployments().startBlocks?.agentWallet;
  const fromBlock = typeof configured === "number" && configured > 0 ? configured : AGENT_WALLET_V2_DEPLOY_BLOCK;
  return fetchLogsWindowed(wallet, [AGENT_SPEND_TOPIC], fromBlock).catch(() => []);
}

export async function fetchCommunityAgentSnapshot(limit = 10): Promise<CommunityAgentSnapshot> {
  const { wallet, executor, guardian } = communityAgentAddresses();
  if (!wallet || !executor || !guardian) throw new Error("community_agent_wallet_unconfigured");
  const walletAddr = getAddress(wallet);

  const balanceHex = await evmJsonRpc<string>("eth_getBalance", [walletAddr, "latest"]);
  const logs = await fetchAgentSpendLogs(walletAddr);
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
