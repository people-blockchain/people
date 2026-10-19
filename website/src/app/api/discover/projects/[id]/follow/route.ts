import { NextResponse } from "next/server";
import { checkRateLimitDurableFirst } from "@/lib/api-rate-limit";
import { discoverApiGuard, clientIp } from "@/lib/discover/api-guard";
import { addFollow, getProjectById } from "@/lib/discover/service";
import { DISCOVER_SCORING } from "@/lib/discover/scoring-config";
import { tryAwardFounderPoints } from "@/lib/founders/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const guard = await discoverApiGuard();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const key = `${guard.userId}:${clientIp(request)}`;
  if (
    !(await checkRateLimitDurableFirst(
      "discover-follow",
      key,
      DISCOVER_SCORING.rateLimits.followsPerUserPerHour,
      60 * 60 * 1000,
    ))
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const project = await getProjectById(id);
  await addFollow(id, guard.userId);
  await tryAwardFounderPoints(
    guard.userId,
    "discover_follow",
    `discover:follow:${id}:${guard.userId}`,
    { projectAuthorUserId: project?.authorUserId ?? undefined },
  );
  return NextResponse.json({ ok: true });
}
