import { NextResponse } from "next/server";
import { checkRateLimitDurableFirst } from "@/lib/api-rate-limit";
import { discoverApiGuard, clientIp } from "@/lib/discover/api-guard";
import { addQuestion } from "@/lib/discover/service";
import { DISCOVER_SCORING } from "@/lib/discover/scoring-config";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const guard = await discoverApiGuard();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = (await request.json()) as { text?: string };
  const text = String(body.text ?? "").trim();
  if (text.length < 3 || text.length > 500) {
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  }
  const key = `${guard.userId}:${clientIp(request)}`;
  if (
    !(await checkRateLimitDurableFirst(
      "discover-question",
      key,
      DISCOVER_SCORING.rateLimits.questionsPerUserPerHour,
      60 * 60 * 1000,
    ))
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  await addQuestion(id, guard.userId, text);
  return NextResponse.json({ ok: true });
}
