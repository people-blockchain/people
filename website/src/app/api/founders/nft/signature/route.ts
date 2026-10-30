import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { founderNftErrorResponse, founderNftServiceDeps } from "@/lib/founders/founder-nft-server";
import { issueFounderNftSignature } from "@/lib/founders/founder-nft-service";

export const dynamic = "force-dynamic";

/**
 * EIP-712 Mint / Rebind signature for the Founder NFT.
 * Body: `{ action: "mint" | "rebind", address, nonce, chainId, walletSignature }`.
 * The wallet signature must recover to `address` over the server nonce (see auth-nonce).
 * Issued only after the server re-checks Human Passport verification; the signer key stays in the
 * server environment (`FOUNDER_NFT_SIGNER_PK`). `FOUNDER_NFT_TEST_ALLOWLIST` may skip only the
 * level-2 check, and only outside production on chain 97401. Login and the verified-human gate
 * still apply. 503 `not_configured` when the contract or the key is unset.
 */
export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    address?: unknown;
    nonce?: unknown;
    chainId?: unknown;
    walletSignature?: unknown;
  } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const address = typeof body?.address === "string" ? body.address : "";
  const chainId = typeof body?.chainId === "number" ? body.chainId : Number(body?.chainId);
  const result = await issueFounderNftSignature(
    action,
    guard.userId,
    address,
    {
      nonce: typeof body?.nonce === "string" ? body.nonce : "",
      signature: typeof body?.walletSignature === "string" ? body.walletSignature : "",
      chainId: Number.isInteger(chainId) ? chainId : undefined,
    },
    founderNftServiceDeps(),
  );
  if (!result.ok) return founderNftErrorResponse(result);
  return NextResponse.json(result.signature, { headers: { "Cache-Control": "no-store" } });
}
