import { NextResponse } from "next/server";
import { discoverApiGuard } from "@/lib/discover/api-guard";
import { addFollow, getProjectById } from "@/lib/discover/service";
import { tryAwardFounderPoints } from "@/lib/founders/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const guard = await discoverApiGuard();
  if (!guard.ok) return guard.response;
  const { id } = await params;
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
