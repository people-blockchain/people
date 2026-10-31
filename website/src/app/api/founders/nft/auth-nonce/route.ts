import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { createFounderNftAuthNonce } from "@/lib/founders/founder-nft-auth-nonce";
import { readFounderNftPublicConfig } from "@/lib/founders/founder-nft-config";

export const dynamic = "force-dynamic";

/**
 * Server nonce the wallet must sign before `POST /api/founders/nft/signature` will issue a
 * Mint or Rebind signature. 503 when the contract address is unset. No signer key is involved.
 */
export async function GET() {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const config = readFounderNftPublicConfig();
  if (!config) {
    return NextResponse.json(
      { error: "not_configured", reason: "contract" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const issued = await createFounderNftAuthNonce(guard.userId, config.chainId);
    return NextResponse.json(
      { nonce: issued.nonce, expiresAt: issued.expiresAt, chainId: issued.chainId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
