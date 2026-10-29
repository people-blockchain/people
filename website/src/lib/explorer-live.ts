export interface LiveTransaction {
  id: string;
  type?: string;
  from?: string;
  to?: string;
  amount?: number;
  fee?: number;
  blockHeight?: number;
  payload?: { memo: string };
}

export interface LiveBlock {
  hash: string;
  header: { height: number; chainId?: string; proposer?: string; timestamp?: number };
  transactions: LiveTransaction[];
}

export type LivePhase = "checking" | "online" | "offline";
export type ExplorerFeed = { blocks: LiveBlock[]; transactions: LiveTransaction[] };

function isTransaction(value: unknown): value is LiveTransaction {
  return !!value && typeof value === "object" && typeof (value as LiveTransaction).id === "string";
}

function isBlock(value: unknown): value is LiveBlock {
  const block = value as LiveBlock | null;
  return !!block && typeof block.hash === "string" && Number.isSafeInteger(block.header?.height)
    && block.header.height >= 0 && Array.isArray(block.transactions) && block.transactions.every(isTransaction);
}

/** A reconnect always receives a fresh authoritative feed, including missed blocks. */
export function connectExplorer(options: {
  url: string;
  chainId: string;
  onPhase: (phase: LivePhase) => void;
  onFeed: (feed: ExplorerFeed) => void;
  createSocket?: (url: string) => WebSocket;
}) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let attempts = 0;
  let feed: ExplorerFeed = { blocks: [], transactions: [] };

  function connect() {
    if (stopped) return;
    options.onPhase("checking");
    let verified = false;
    let lastMessage = Date.now();
    let current: WebSocket;
    function reconnect() {
      if (stopped || retry || (current && current !== socket)) return;
      clearInterval(watchdog);
      options.onPhase("offline");
      retry = setTimeout(() => {
        retry = undefined;
        connect();
      }, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
    }
    try {
      current = (options.createSocket ?? ((url) => new WebSocket(url)))(options.url);
      socket = current;
    } catch {
      reconnect();
      return;
    }
    current.onclose = reconnect;
    current.onerror = () => { current.close(); reconnect(); };
    current.onmessage = (event) => {
      if (stopped || current !== socket || retry) return;
      try {
        const message = JSON.parse(String(event.data));
        lastMessage = Date.now();
        if (message.type === "hello") {
          if (message.payload?.chainId !== options.chainId) {
            current.close();
            reconnect();
            return;
          }
          verified = true;
        }
        if (!verified) return;
        if (message.type === "feed") {
          const payload = message.payload;
          if (!Array.isArray(payload?.blocks) || !payload.blocks.every(isBlock)
            || !Array.isArray(payload.transactions) || !payload.transactions.every(isTransaction)) return;
          if (payload.blocks.some((block: LiveBlock) => block.header.chainId !== options.chainId)) return;
          feed = { blocks: payload.blocks.slice(0, 12), transactions: payload.transactions.slice(0, 12) };
        } else if (message.type === "block" && isBlock(message.payload)) {
          const block: LiveBlock = message.payload;
          if (block.header.chainId !== options.chainId) return;
          // Discard rows from a replaced height; repeated events remain idempotent.
          feed = {
            blocks: [block, ...feed.blocks.filter((row) => row.header.height < block.header.height)].slice(0, 12),
            transactions: [
              ...block.transactions.map((tx) => ({ ...tx, blockHeight: block.header.height })),
              ...feed.transactions.filter((tx) => tx.blockHeight !== undefined && tx.blockHeight < block.header.height
                && !block.transactions.some((next) => next.id === tx.id)),
            ].slice(0, 12),
          };
        } else return;
        attempts = 0;
        options.onPhase("online");
        options.onFeed(feed);
      } catch { /* Malformed messages do not replace the last valid feed. */ }
    };
    watchdog = setInterval(() => {
      if (Date.now() - lastMessage > 45_000) {
        current.close();
        reconnect();
      } else if (current.readyState === 1) {
        current.send(JSON.stringify({ type: "ping" }));
      }
    }, 15_000);
  }
  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(watchdog);
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    }
  };
}
