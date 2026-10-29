import { NextResponse } from "next/server";
import { createPublicClient, custom } from "viem";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { evmJsonRpc } from "@/lib/evm/rpc-server";
import { peopleNftAbi } from "@/lib/evm/nft-factory";
import { ipfsGatewayBase } from "@/lib/factory-icon-config";
import { withTimeout } from "@/lib/fetch-timeout";
import { fetchNftMetadata, ipfsUriToPublicGateway, isRevertLike, normalizeNftMetadata, parseNftParams } from "@/lib/nft-explorer";
import { clientIpFromRequest } from "@/lib/request-client-ip";

export const runtime = "nodejs";

const nameAbi = [{ type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }] as const;
const READ_TIMEOUT_MS = 8_000;

/** ERC-721 reads (name, ownerOf, tokenURI) plus the metadata JSON for ipfs:// token URIs only. */
export async function GET(request: Request, context: { params: Promise<{ collection: string; id: string }> }) {
  const params = await context.params;
  const parsed = parseNftParams(params.collection, params.id);
  if (!parsed) return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  if (!await checkSharedRateLimit("explorer-nft", clientIpFromRequest(request), 90, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const client = createPublicClient({
    transport: custom({ request: ({ method, params: rpcParams }) => evmJsonRpc(method, (rpcParams as unknown[]) ?? []) }),
  });
  const tokenId = BigInt(parsed.tokenId);
  const read = <T,>(run: () => Promise<T>) => withTimeout(run, READ_TIMEOUT_MS);
  const [name, owner, uri] = await Promise.allSettled([
    read(() => client.readContract({ address: parsed.collection, abi: nameAbi, functionName: "name" })),
    read(() => client.readContract({ address: parsed.collection, abi: peopleNftAbi, functionName: "ownerOf", args: [tokenId] })),
    read(() => client.readContract({ address: parsed.collection, abi: peopleNftAbi, functionName: "tokenURI", args: [tokenId] })),
  ]);
  const headers = { "Cache-Control": "no-store" };
  if (owner.status === "rejected") {
    // A revert means "no such token"; anything else is the node being unreachable.
    return isRevertLike(owner.reason)
      ? NextResponse.json({ error: "not_found" }, { status: 404, headers })
      : NextResponse.json({ error: "rpc_unavailable" }, { status: 502, headers });
  }
  const tokenUri = uri.status === "fulfilled" && typeof uri.value === "string" ? uri.value.slice(0, 2000) : null;
  const rawMetadata = tokenUri ? await fetchNftMetadata(tokenUri, { gatewayBase: ipfsGatewayBase() }) : null;
  return NextResponse.json({
    collection: parsed.collection,
    tokenId: parsed.tokenId,
    collectionName: name.status === "fulfilled" && typeof name.value === "string" ? name.value.slice(0, 120) : null,
    owner: owner.value,
    tokenUri,
    gatewayUrl: tokenUri ? ipfsUriToPublicGateway(tokenUri) : null,
    metadata: rawMetadata === null ? null : normalizeNftMetadata(rawMetadata),
  }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
