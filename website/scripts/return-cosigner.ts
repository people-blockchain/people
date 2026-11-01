/**
 * Sell-back cosigner server (see src/lib/sale/v2/return-cosigner.ts and docs/v2/RETURN-COSIGNER.md).
 *
 *   node --import ./scripts/register-ts-paths.mjs --experimental-strip-types scripts/return-cosigner.ts
 *
 * Env: PORT, COSIGNER_TOKEN (>= 32 chars, same as SALE_RETURN_COSIGNER_TOKEN on the site),
 * HUB_ADDRESS, HUB_CHAIN_ID, HUB_RPC_URL, RETURN_BURN_ADDRESS, PEOPLE_RPC_URL,
 * SALE_RETURN_COSIGNER_MODE=kms + SALE_RETURN_COSIGNER_KMS_KEY_ID (+ AWS credentials), or
 * SALE_RETURN_COSIGNER_LOCAL_KEY on Base Sepolia only,
 * COSIGNER_WARN_PPL_PER_HOUR, COSIGNER_MAX_PPL_PER_HOUR (whole PPL),
 * ALERT_TELEGRAM_BOT_TOKEN, ALERT_TELEGRAM_CHAT_ID.
 */
import { createServer } from "node:http";
import { createPublicClient, getAddress, http, type Address } from "viem";

import { PPL_CURVE_HUB_V2_ABI } from "../src/lib/sale/v2/abi.ts";
import { PEOPLE_MAINNET_CHAIN_ID, getReturnCosignerSigner } from "../src/lib/sale/v2/return-attestation.ts";
import { createCosigner, telegramAlert } from "../src/lib/sale/v2/return-cosigner.ts";

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const hubChainId = Number.parseInt(need("HUB_CHAIN_ID"), 10);
const hubAddress = getAddress(need("HUB_ADDRESS"));
const peopleRpc = need("PEOPLE_RPC_URL");
const people = createPublicClient({
  chain: {
    id: PEOPLE_MAINNET_CHAIN_ID,
    name: "PEOPLE",
    nativeCurrency: { name: "PPL", symbol: "PPL", decimals: 18 },
    rpcUrls: { default: { http: [peopleRpc] } },
  },
  transport: http(peopleRpc, { timeout: 12_000 }),
});
const hubRpc = need("HUB_RPC_URL");
const hub = createPublicClient({
  chain: {
    id: hubChainId,
    name: "hub",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [hubRpc] } },
  },
  transport: http(hubRpc, { timeout: 12_000 }),
});
const WEI = BigInt(10) ** BigInt(18);

const cosigner = createCosigner(
  {
    token: need("COSIGNER_TOKEN"),
    hubAddress,
    burnAddress: need("RETURN_BURN_ADDRESS"),
    hubChainId,
    warnPplPerHour: BigInt(need("COSIGNER_WARN_PPL_PER_HOUR")) * WEI,
    maxPplPerHour: BigInt(need("COSIGNER_MAX_PPL_PER_HOUR")) * WEI,
  },
  {
    signer: getReturnCosignerSigner(hubChainId),
    nowSec: () => Math.floor(Date.now() / 1000),
    getReceipt: async (hash) => {
      const r = await people.getTransactionReceipt({ hash });
      return { status: r.status, blockNumber: r.blockNumber, logs: r.logs };
    },
    headBlock: () => people.getBlockNumber(),
    finalizedBlock: async () => {
      try {
        return (await people.getBlock({ blockTag: "finalized" })).number ?? null;
      } catch {
        return null;
      }
    },
    returnCosigner: async () =>
      (await hub.readContract({ address: hubAddress, abi: PPL_CURVE_HUB_V2_ABI, functionName: "returnCosigner" })) as Address,
    alert: telegramAlert(process.env.ALERT_TELEGRAM_BOT_TOKEN, process.env.ALERT_TELEGRAM_CHAT_ID),
  },
);

const MAX_BODY = 4096;
createServer((req, res) => {
  const send = (status: number, body: Record<string, unknown>) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
  if (req.method !== "POST" || req.url !== "/cosign") return send(404, { error: "not_found" });
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > MAX_BODY) req.destroy();
  });
  req.on("end", async () => {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(400, { error: "invalid_json" });
    }
    try {
      const out = await cosigner.handle(req.headers.authorization ?? null, body);
      send(out.status, out.body);
    } catch {
      send(503, { error: "internal" });
    }
  });
}).listen(Number(process.env.PORT ?? 8787));
