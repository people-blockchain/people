import { NextResponse } from "next/server";
import { checkRateLimitDurableFirst } from "@/lib/api-rate-limit";
import { auth } from "@/auth";
import { clientIp, discoverApiGuard } from "@/lib/discover/api-guard";
import { trackProductClick } from "@/lib/discover/service";
import { DISCOVER_SCORING } from "@/lib/discover/scoring-config";
import { isVerifiedHuman } from "@/lib/discover/verified-human";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  let trackedUser: string | null = null;
  if (userId && (await isVerifiedHuman(userId))) {
    const guard = await discoverApiGuard();
    if (!guard.ok) return guard.response;
    trackedUser = guard.userId;
    const key = `${guard.userId}:${clientIp(request)}`;
    if (
      !(await checkRateLimitDurableFirst(
        "discover-product",
        key,
        DISCOVER_SCORING.rateLimits.productClicksPerUserPerHour,
        60 * 60 * 1000,
      ))
    ) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }
  await trackProductClick(id, trackedUser);
  return NextResponse.json({ ok: true });
}
