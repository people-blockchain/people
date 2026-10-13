import { gunzipSync } from "node:zlib";

/** Read one archived block through the existing gossip protocol; never submit transactions. */
export function archivedBlockTime(url: string, chainId: string, height: number, createSocket = (url: string) => new WebSocket(url)): Promise<number | null> {
  if (!Number.isSafeInteger(height) || height < 0) return Promise.resolve(null);
  return new Promise(resolve => {
    let socket: WebSocket;
    let finished = false;
    let verified = false;
    const peerId = `explorer-date-${crypto.randomUUID()}`;
    const finish = (value: number | null) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (socket) { socket.onmessage = null; socket.onerror = null; socket.onclose = null; socket.close(); }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 5000);
    try { socket = createSocket(url); } catch { finish(null); return; }
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
    socket.onopen = () => socket.send(JSON.stringify({ type: "hello", peerId, payload: { chainId } }));
    socket.onmessage = event => {
      try {
        const raw = String(event.data);
        if (raw.length > 1_048_576) { finish(null); return; }
        const message = JSON.parse(raw);
        if (message.type === "hello") {
          if (message.payload?.chainId !== chainId) { finish(null); return; }
          verified = true;
          socket.send(JSON.stringify({ type: "request_blocks", peerId, payload: { fromHeight: height, toHeight: height } }));
        }
        if (!verified || message.type !== "blocks_response") return;
        const payload = message.payload;
        const blocks = payload?.gz ? JSON.parse(gunzipSync(Buffer.from(payload.gz, "base64"), { maxOutputLength: 1_048_576 }).toString("utf8")) : payload?.blocks;
        const header = Array.isArray(blocks) && blocks.length === 1 ? blocks[0]?.header : null;
        finish(header?.height === height && header.chainId === chainId && Number.isFinite(header.timestamp) && header.timestamp > 0 ? header.timestamp : null);
      } catch { finish(null); }
    };
  });
}
