import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { founderNftErrorResponse, founderNftServiceDeps } from "@/lib/founders/founder-nft-server";
import { getFounderNftStatus } from "@/lib/founders/founder-nft-service";

export const dynamic = "force-dynamic";

/** What the founders page may offer for `?address=` (the connected wallet). Read-only. */
export async function GET(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const address = new URL(request.url).searchParams.get("address") ?? "";
  const result = await getFounderNftStatus(guard.userId, address, founderNftServiceDeps());
  if (!result.ok) return founderNftErrorResponse(result);
  return NextResponse.json(
    { status: result.status, signerReady: result.signerReady },
    { headers: { "Cache-Control": "no-store" } },
  );
}
