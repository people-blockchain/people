import { NextResponse } from "next/server";
import { createPublicClient, custom, getAddress, isAddress } from "viem";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { evmJsonRpc } from "@/lib/evm/rpc-server";
import { EMPTY_ERC20_META, readErc20Meta, type Erc20ReadClient } from "@/lib/evm-token-meta";
import { clientIpFromRequest } from "@/lib/request-client-ip";

export const runtime = "nodejs";

/** ERC-20 name/symbol/decimals/totalSupply read straight from the contract (catalog lacks new tokens). */
export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  if (!isAddress(assetId, { strict: false })) return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  if (!await checkSharedRateLimit("explorer-token-meta", clientIpFromRequest(request), 120, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const client = createPublicClient({
    transport: custom({ request: ({ method, params }) => evmJsonRpc(method, (params as unknown[]) ?? []) }),
  }) as unknown as Erc20ReadClient;
  try {
    const meta = await readErc20Meta(client, getAddress(assetId));
    const found = Object.values(meta).some(value => value !== null);
    return NextResponse.json({ ...(found ? meta : EMPTY_ERC20_META), found }, { headers: { "Cache-Control": found ? "public, s-maxage=30, stale-while-revalidate=60" : "no-store" } });
  } catch {
    return NextResponse.json({ error: "rpc_unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
