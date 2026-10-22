import { memoFromInput } from "./memo";
import type { ExplorerFeed, LiveBlock, LivePhase, LiveTransaction } from "../explorer-live";

/** A bounded recent window, not a full transaction-history index. */
export const EVM_EXPLORER_WINDOW = 40;
const BLOCK_READ_CONCURRENCY = 4;

type RpcBlock = {
  hash: string;
  number: string;
  timestamp: string;
  miner?: string;
  transactions: Array<{ hash: string; from?: string; to?: string; value?: string; input?: string }>;
};

function heightOf(value: unknown): number {
  if (typeof value !== "string" || !/^0x[\da-f]+$/i.test(value)) throw new Error("invalid_height");
  const height = Number(BigInt(value));
  if (!Number.isSafeInteger(height) || height < 0) throw new Error("invalid_height");
  return height;
}

function decodeBlock(value: unknown, height: number): LiveBlock {
  const block = value as RpcBlock | null;
  if (!block || typeof block.hash !== "string" || heightOf(block.number) !== height
    || !Array.isArray(block.transactions)) throw new Error("invalid_block");
  const transactions: LiveTransaction[] = block.transactions.map((tx) => {
    if (!tx || typeof tx !== "object" || typeof tx.hash !== "string") throw new Error("invalid_transaction");
    const wei = BigInt(tx.value ?? "0x0");
    return {
      id: tx.hash, from: tx.from, to: tx.to ?? undefined,
      type: tx.input && tx.input !== "0x" && !memoFromInput(tx.input) ? "contract" : "transfer",
      amount: Number(wei) / 1e18, blockHeight: height,
    };
  });
  return {
    hash: block.hash,
    header: { height, proposer: block.miner, timestamp: heightOf(block.timestamp) * 1000 },
    transactions,
  };
}

/** EVM JSON-RPC subscriptions and reads share one socket. No periodic HTTP scans. */
export function connectEvmExplorer(options: {
  url: string;
  chainId: string;
  onPhase: (phase: LivePhase) => void;
  onFeed: (feed: ExplorerFeed) => void;
  createSocket?: (url: string) => WebSocket;
}) {
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let dispose: (() => void) | undefined;
  let attempts = 0;

  function connect() {
    if (stopped) return;
    options.onPhase("checking");
    let socket: WebSocket;
    let dead = false;
    let nextId = 0;
    let subscription: string | undefined;
    let lastHead = Date.now();
    let target = -1;
    let syncing = false;
    let ready = false;
    let blocks: LiveBlock[] = [];
    const pending = new Map<number, {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }>();
    let watchdog: ReturnType<typeof setInterval> | undefined;
    const opening = setTimeout(() => fail(), 20_000);

    function cleanup() {
      dead = true;
      clearTimeout(opening);
      clearInterval(watchdog);
      for (const request of pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error("connection_closed"));
      }
      pending.clear();
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        socket.close();
      }
    }
    function fail() {
      if (stopped || dead) return;
      cleanup();
      options.onPhase("offline");
      retry = setTimeout(() => {
        retry = undefined;
        connect();
      }, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
    }
    function request(method: string, params: unknown[] = []): Promise<unknown> {
      if (dead || stopped) return Promise.reject(new Error("connection_closed"));
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error("rpc_timeout"));
          fail();
        }, 20_000);
        pending.set(id, { resolve, reject, timeout });
        try { socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params })); }
        catch { fail(); }
      });
    }
    async function sync() {
      if (syncing || dead || stopped || !ready) return;
      syncing = true;
      try {
        while (!dead && !stopped && (blocks[0]?.header.height ?? -1) < target) {
          const head = target;
          if (head < 1) throw new Error("chain_not_started");
          const previous = blocks[0]?.header.height ?? -1;
          const start = Math.max(1, head - EVM_EXPLORER_WINDOW + 1, previous + 1);
          const retained = blocks;
          const next: LiveBlock[] = [];
          let published = false;
          for (let h = head; h >= start; h -= BLOCK_READ_CONCURRENCY) {
            const heights = Array.from(
              { length: Math.min(BLOCK_READ_CONCURRENCY, h - start + 1) },
              (_, index) => h - index,
            );
            const batch = await Promise.all(heights.map(async (height) => {
              const raw = await request("eth_getBlockByNumber", [`0x${height.toString(16)}`, true]);
              return decodeBlock(raw, height);
            }));
            if (dead || stopped) return;
            next.push(...batch);
            blocks = [...next, ...retained].slice(0, EVM_EXPLORER_WINDOW);
            const transactions = blocks.flatMap((block) => block.transactions).slice(0, 12);
            attempts = 0;
            options.onFeed({ blocks: blocks.slice(0, 12), transactions });
            if (!published && !dead && !stopped) options.onPhase("online");
            published = true;
          }
        }
      } catch { fail(); }
      finally { syncing = false; }
    }
    dispose = cleanup;
    try { socket = (options.createSocket ?? ((url) => new WebSocket(url)))(options.url); }
    catch { fail(); return; }
    socket.onclose = socket.onerror = fail;
    socket.onmessage = (event) => {
      if (dead || stopped) return;
      try {
        const message = JSON.parse(String(event.data));
        if (message.id !== undefined) {
          const entry = pending.get(message.id);
          if (!entry) return;
          pending.delete(message.id);
          clearTimeout(entry.timeout);
          if (message.error || !("result" in message)) entry.reject(new Error("rpc_error"));
          else entry.resolve(message.result);
        } else if (message.method === "eth_subscription" && subscription
          && message.params?.subscription === subscription) {
          const height = heightOf(message.params.result?.number);
          lastHead = Date.now();
          target = Math.max(target, height);
          void sync();
        }
      } catch { /* Invalid unrelated messages cannot replace the feed. */ }
    };
    socket.onopen = () => {
      clearTimeout(opening);
      void (async () => {
        try {
          const chainId = await request("eth_chainId");
          if (typeof chainId !== "string" || heightOf(chainId) !== Number(options.chainId)) throw new Error("wrong_chain");
          const id = await request("eth_subscribe", ["newHeads"]);
          if (typeof id !== "string" || !id) throw new Error("invalid_subscription");
          subscription = id;
          target = Math.max(target, heightOf(await request("eth_blockNumber")));
          if (dead || stopped) return;
          ready = true;
          lastHead = Date.now();
          watchdog = setInterval(() => {
            if (Date.now() - lastHead > 45_000) fail();
          }, 15_000);
          await sync();
        } catch { fail(); }
      })();
    };
  }
  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    dispose?.();
  };
}
