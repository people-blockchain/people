#!/usr/bin/env node
// Read-only helper for docs/v2/SMOKE-ONE-TX.md. Builds the site's LI.FI /quote/contractCalls request
// (same code as the buy panel), fetches a live quote, validates it with the site's validateOneTxQuote and
// prints the source transaction to sign. It never signs or sends anything and reads no private key.
//
//   node --import ./scripts/node-test-paths.mjs --experimental-strip-types scripts/smoke-one-tx-quote.mjs
//
// Env:
//   HUB (required)          PplCurveHubV2 on Base (a placeholder works for a shape-only pre-check)
//   BUYER (required)        buyer wallet = LI.FI fromAddress = hub recipient (must hold the source token,
//                           LI.FI simulates the source step)
//   FROM_CHAIN=56           56 BNB | 137 Polygon | 8453 Base | 1 Ethereum | 42161 Arbitrum | ...
//   FROM_TOKEN              default: USDT on the source chain (BNB / Polygon)
//   USDC_IN=41000000        USDC (6 dp) the hub pulls; one-signature (router) minimum is 40 USDC
//   MIN_PPL_OUT             default 1 (shape check). For the live smoke use quoteBuy(USDC_IN) * 0.99;
//                           for the refund case use more than quoteBuy(USDC_IN)
//   REFERRER                default zero address
//   VERIFICATION            JSON {"personId","deadline","signature"} from /api/sale/verify-signature with
//                           routed=true (new buyer -> verifyAndBuy). Omit for an already bound buyer (buy).
import { buildContractCallsRequest, fetchOneTxQuote, validateOneTxQuote } from "../src/lib/sale/v2/lifi-route.ts";

const USDT = { 56: "0x55d398326f99059fF775485246999027B3197955", 137: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" };
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const fromChain = Number(env("FROM_CHAIN", "56"));
const params = {
  fromChain,
  fromToken: env("FROM_TOKEN", USDT[fromChain]),
  account: env("BUYER"),
  hub: env("HUB"),
  usdc: USDC,
  usdcIn: BigInt(env("USDC_IN", "41000000")),
  minPplOut: BigInt(env("MIN_PPL_OUT", "1")),
  referrer: env("REFERRER", "0x0000000000000000000000000000000000000000"),
  verification: process.env.VERIFICATION ? JSON.parse(process.env.VERIFICATION) : undefined,
};
if (!params.account || !params.hub || !params.fromToken) {
  console.error("HUB, BUYER and FROM_TOKEN (or FROM_CHAIN 56/137) are required");
  process.exit(2);
}
const request = buildContractCallsRequest(params);
// Explicit user-agent: Cloudflare in front of li.quest rejects some default non-browser agents (error 1010).
const fetchImpl = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, "user-agent": "people-smoke/1.0" } });
let quote;
try {
  quote = await fetchOneTxQuote(request, { fetchImpl });
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e), request }, null, 1));
  process.exit(1);
}
const check = validateOneTxQuote(quote, params);
console.log(JSON.stringify({ ok: check.ok, check, request }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 1));
process.exit(check.ok ? 0 : 1);
