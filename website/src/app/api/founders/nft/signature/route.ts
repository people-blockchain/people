import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { founderNftErrorResponse, founderNftServiceDeps } from "@/lib/founders/founder-nft-server";
import { issueFounderNftSignature } from "@/lib/founders/founder-nft-service";

export const dynamic = "force-dynamic";

/**
 * EIP-712 Mint / Rebind signature for the Founder NFT. Body: `{ action: "mint" | "rebind", address }`.
 * Issued only after the server re-checks Human Passport verification; the signer key stays in the
 * server environment (`FOUNDER_NFT_SIGNER_PK`). 503 `not_configured` when the contract or the key is unset.
 */
export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as { action?: unknown; address?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const address = typeof body?.address === "string" ? body.address : "";
  const result = await issueFounderNftSignature(action, guard.userId, address, founderNftServiceDeps());
  if (!result.ok) return founderNftErrorResponse(result);
  return NextResponse.json(result.signature, { headers: { "Cache-Control": "no-store" } });
}
