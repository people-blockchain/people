import { NextResponse } from "next/server";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { discoverApiGuard, clientIp } from "@/lib/discover/api-guard";
import { getProjectById, setReaction } from "@/lib/discover/service";
import { tryAwardFounderPoints } from "@/lib/founders/service";
import { DISCOVER_SCORING, type DiscoverVote } from "@/lib/discover/scoring-config";

type Params = { params: Promise<{ id: string }> };

const VOTES = new Set<DiscoverVote>(["interesting", "unclear", "not_interesting"]);

export async function POST(request: Request, { params }: Params) {
  const guard = await discoverApiGuard();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = (await request.json()) as { vote?: string };
  const vote = body.vote as DiscoverVote;
  if (!VOTES.has(vote)) {
    return NextResponse.json({ error: "invalid_vote" }, { status: 400 });
  }
  const key = `${guard.userId}:${clientIp(request)}`;
  if (
    !checkSlidingWindowRateLimit(
      "discover-react",
      key,
      DISCOVER_SCORING.rateLimits.reactionsPerUserPerHour,
      60 * 60 * 1000,
    )
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const project = await getProjectById(id);
  await setReaction(id, guard.userId, vote);
  await tryAwardFounderPoints(
    guard.userId,
    "discover_reaction",
    `discover:react:${id}:${guard.userId}:${vote}`,
    { projectAuthorUserId: project?.authorUserId ?? undefined },
  );
  return NextResponse.json({ ok: true });
}
