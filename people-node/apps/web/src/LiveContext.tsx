import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Block, ChainSnapshot, GovernanceProposal, RewardDistribution, Transaction } from "@ovn/protocol";

export interface LiveMetrics {
  ok?: boolean;
  height?: number;
  epoch?: number;
  finalizedHeight?: number;
  finalizedLag?: number;
  validators?: number;
  activeValidators?: number;
  mempoolSize?: number;
  peerCount?: number;
  feePool?: number;
  chainId?: string;
  peerId?: string;
  transactionCount?: number;
  totalValidatorRewards?: number;
  tokenPriceUsd?: number;
  apiLatencyP95Ms?: number;
  maxThroughputTps?: number;
  blockIntervalMs?: number;
  maxTxPerBlock?: number;
  missedProposalCount?: number;
  attestationQuorumHeights?: number;
  suggestedTransferFee?: number;
}

export interface LiveSlashCandidate {
  type: "double_sign" | "conflicting_attestation";
  validator: string;
  height: number;
  blockHashA: string;
  blockHashB: string;
  reporter?: string;
}

export interface LiveAccount {
  address: string;
  balance: number;
  nonce: number;
  incomingTxs: number;
  outgoingTxs: number;
}

export interface LiveTransaction extends Transaction {
  blockHeight: number;
  blockHash: string;
}

export interface LiveFeed {
  accounts: LiveAccount[];
  blocks: Block[];
  transactions: LiveTransaction[];
  proposals: GovernanceProposal[];
}

interface LiveState {
  connected: boolean;
  offline: boolean;
  snapshot: (ChainSnapshot & { epoch?: number; peerCount?: number; mempoolSize?: number }) | null;
  metrics: LiveMetrics | null;
  rewards: RewardDistribution | null;
  feed: LiveFeed | null;
  latestBlock: Block | null;
  headHeight: number;
  blockVersion: number;
  slashCandidate: LiveSlashCandidate | null;
}

interface LiveContextValue extends LiveState {}

const LiveContext = createContext<LiveContextValue | null>(null);

function resolveWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) {
    return configured;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

async function probeApiHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

function mergeBlock(feed: LiveFeed | null, block: Block): LiveFeed | null {
  if (!feed) {
    return null;
  }
  const blocks = [block, ...feed.blocks.filter((item) => item.hash !== block.hash)].slice(0, 20);
  const transactions = block.transactions.map((tx) => ({
    ...tx,
    blockHeight: block.header.height,
    blockHash: block.hash
  }));
  return {
    ...feed,
    blocks,
    transactions: [...transactions, ...feed.transactions].slice(0, 100)
  };
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [offline, setOffline] = useState(false);
  const [snapshot, setSnapshot] = useState<LiveState["snapshot"]>(null);
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [rewards, setRewards] = useState<RewardDistribution | null>(null);
  const [feed, setFeed] = useState<LiveFeed | null>(null);
  const [latestBlock, setLatestBlock] = useState<Block | null>(null);
  const [blockVersion, setBlockVersion] = useState(0);
  const [slashCandidate, setSlashCandidate] = useState<LiveSlashCandidate | null>(null);

  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let healthTimer: number | undefined;
    let attempt = 0;

    async function refreshOfflineState(): Promise<void> {
      if (closed) {
        return;
      }
      const apiUp = await probeApiHealth();
      setOffline(!apiUp);
    }

    function scheduleReconnect() {
      if (closed) {
        return;
      }
      const delay = Math.min(10_000, 800 + attempt * 700);
      attempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    }

    function connect() {
      socket = new WebSocket(resolveWsUrl());

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        setOffline(false);
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 20_000);
      };

      socket.onclose = () => {
        setConnected(false);
        void refreshOfflineState();
        if (pingTimer) {
          window.clearInterval(pingTimer);
        }
        scheduleReconnect();
      };

      socket.onerror = () => {
        void refreshOfflineState();
        socket?.close();
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type: string;
            payload?: unknown;
          };
          if (message.type === "hello" || message.type === "snapshot") {
            setOffline(false);
          }
          if (message.type === "snapshot") {
            setSnapshot(message.payload as LiveState["snapshot"]);
          } else if (message.type === "metrics") {
            setMetrics(message.payload as LiveMetrics);
          } else if (message.type === "feed") {
            setFeed(message.payload as LiveFeed);
          } else if (message.type === "rewards") {
            setRewards(message.payload as RewardDistribution | null);
          } else if (message.type === "block") {
            const block = message.payload as Block;
            setLatestBlock(block);
            setBlockVersion((value) => value + 1);
            setFeed((current) => mergeBlock(current, block));
          } else if (message.type === "tx") {
            setMetrics((current) => ({
              ...current,
              mempoolSize: (current?.mempoolSize ?? 0) + 1
            }));
          } else if (message.type === "slash_candidate") {
            setSlashCandidate(message.payload as LiveSlashCandidate);
          }
        } catch {
          // ignore malformed frames
        }
      };
    }

    void refreshOfflineState();
    healthTimer = window.setInterval(() => {
      void refreshOfflineState();
    }, 15_000);
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (pingTimer) {
        window.clearInterval(pingTimer);
      }
      if (healthTimer) {
        window.clearInterval(healthTimer);
      }
      socket?.close();
    };
  }, []);

  const value = useMemo<LiveContextValue>(
    () => ({
      connected,
      offline,
      snapshot,
      metrics,
      rewards,
      feed,
      latestBlock,
      headHeight: snapshot?.head.height ?? metrics?.height ?? 0,
      blockVersion,
      slashCandidate
    }),
    [connected, offline, snapshot, metrics, rewards, feed, latestBlock, blockVersion, slashCandidate]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveContextValue {
  const value = useContext(LiveContext);
  if (!value) {
    throw new Error("useLive must be used within LiveProvider");
  }
  return value;
}
