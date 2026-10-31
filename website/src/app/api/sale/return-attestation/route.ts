import { NextResponse } from "next/server";
import { createPublicClient, getAddress, http, isAddress, type Address, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";

import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { readEvmRpcUrl } from "@/lib/evm/config";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { PPL_CURVE_HUB_V2_ABI } from "@/lib/sale/v2/abi";
import {
  PEOPLE_MAINNET_CHAIN_ID,
  createReturnAttestation,
  readHubChainId,
  readReturnVerifierKey,
} from "@/lib/sale/v2/return-attestation";

const RATE_NAMESPACE = "sale-return-attestation";
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function hubChain(chainId: number) {
  if (chainId === baseSepolia.id) return baseSepolia;
  if (chainId === base.id) return base;
  return { ...base, id: chainId };
}

/**
 * Signs a `MainnetReturn` only after a PEOPLE-mainnet `ReturnBurned` receipt
 * is finalized, or has `MIN_RETURN_CONFIRMATIONS` (12) confirmations. Until
 * then the route answers 202 `awaiting_confirmations` and does not sign.
 * The signed struct binds amount, this hub, the seller, the PEOPLE source
 * chain id and the destination hub chain id. The signing key is
 * `SALE_RETURN_VERIFIER_LOCAL_KEY`; if it is unset the route answers 503 and
 * does not sign.
 */
export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  if (!(await checkSharedRateLimit(RATE_NAMESPACE, guard.userId, RATE_MAX, RATE_WINDOW_MS))) {
    return errorResponse("rate_limited", 429);
  }

  let body: { txHash?: unknown; returnId?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_json", 400);
  }

  const hubAddress = process.env.NEXT_PUBLIC_PPL_V2_HUB_ADDRESS?.trim();
  const burnAddress = (process.env.SALE_RETURN_BURN_ADDRESS ?? process.env.NEXT_PUBLIC_PPL_RETURN_BURN_ADDRESS)?.trim();
  const hubChainId = readHubChainId(process.env.NEXT_PUBLIC_PPL_V2_CHAIN_ID);
  const peopleRpc = readEvmRpcUrl();
  const people = createPublicClient({
    chain: {
      id: PEOPLE_MAINNET_CHAIN_ID,
      name: "PEOPLE",
      nativeCurrency: { name: "PPL", symbol: "PPL", decimals: 18 },
      rpcUrls: { default: { http: [peopleRpc] } },
    },
    transport: http(peopleRpc, { timeout: 12_000 }),
  });
  const hubClient = createPublicClient({
    chain: hubChain(hubChainId),
    transport: http(undefined, { timeout: 12_000 }),
  });

  const result = await createReturnAttestation({
    txHash: typeof body.txHash === "string" ? body.txHash : "",
    returnId: typeof body.returnId === "string" ? body.returnId : undefined,
    key: readReturnVerifierKey(),
    burnAddress,
    hubAddress,
    hubChainId,
    nowSec: Math.floor(Date.now() / 1000),
    getReceipt: async (txHash) => {
      const receipt = await people.getTransactionReceipt({ hash: txHash });
      return { status: receipt.status, blockNumber: receipt.blockNumber, logs: receipt.logs };
    },
    headBlock: () => people.getBlockNumber(),
    finalizedBlock: async () => {
      try {
        const block = await people.getBlock({ blockTag: "finalized" });
        return block.number ?? null;
      } catch {
        return null;
      }
    },
    returnVerifier: async () => {
      if (!hubAddress || !isAddress(hubAddress)) throw new Error("not_configured");
      const verifier = await hubClient.readContract({
        address: getAddress(hubAddress),
        abi: PPL_CURVE_HUB_V2_ABI,
        functionName: "returnVerifier",
      });
      return verifier as Address;
    },
  });

  if (!result.ok) return errorResponse(result.error, result.status);
  return NextResponse.json(result.body satisfies { signature: Hex });
}
