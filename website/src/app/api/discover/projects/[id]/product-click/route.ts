import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { auth } from "@/auth";
import { clientIp, discoverApiGuard } from "@/lib/discover/api-guard";
import { getProjectById, trackProductClick } from "@/lib/discover/service";
import { DISCOVER_SCORING } from "@/lib/discover/scoring-config";
import { isVerifiedHuman } from "@/lib/discover/verified-human";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ip = clientIp(request);
  if (!(await checkSharedRateLimit("discover-product-ip", `${id}:${ip}`, 30, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  let trackedUser: string | null = null;
  if (userId && (await isVerifiedHuman(userId))) {
    const guard = await discoverApiGuard();
    if (!guard.ok) return guard.response;
    trackedUser = guard.userId;
    const key = `${guard.userId}:${ip}`;
    if (
      !(await checkSharedRateLimit(
        "discover-product",
        key,
        DISCOVER_SCORING.rateLimits.productClicksPerUserPerHour,
        60 * 60 * 1000,
      ))
    ) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }
  // Anonymous clicks must not flood the product-click table (WEB-03); they are still
  // rate-limited per IP above. Scoring only counts unique verified clickers.
  if (trackedUser) {
    await trackProductClick(id, trackedUser);
  }
  return NextResponse.json({ ok: true });
}
