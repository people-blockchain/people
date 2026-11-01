import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import {
  countVerifiedQuestInvitees,
  getQuestProfile,
  readQuestLeaderboard,
  readQuestTaskStatus,
} from "@/lib/founders/quest/service";
import { getFounderByUserId } from "@/lib/founders/service";
import { QUEST_POINTS_CAP } from "@/lib/founders/quest/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;
  const founder = await getFounderByUserId(guard.userId);
  if (!founder) {
    return NextResponse.json({ error: "not_registered" }, { status: 404 });
  }
  const [profile, tasks, verifiedInvitees, leaderboard] = await Promise.all([
    getQuestProfile(guard.userId),
    readQuestTaskStatus(guard.userId),
    countVerifiedQuestInvitees(guard.userId),
    readQuestLeaderboard(20),
  ]);
  return NextResponse.json({
    questPoints: profile.questPoints,
    cap: QUEST_POINTS_CAP,
    projectedPpl: profile.projectedPpl,
    founderPoints: founder.totalPoints,
    personalCode: profile.personalCode,
    xHandle: profile.xHandle,
    tasks,
    verifiedInvitees,
    referralPplCap: Math.min(verifiedInvitees, 50) * 1_000,
    leaderboard,
  });
}

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;
  if (!(await checkSharedRateLimit("founders-quest-action", guard.userId, 60, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = (await request.json()) as { action?: string; handle?: string; replyUrl?: string; word?: string; platform?: string; mode?: string };
  const action = body.action?.trim();
  const quest = await import("@/lib/founders/quest/service");

  if (action === "telegram_check") {
    const result = await quest.checkTelegramJoinQuest(guard.userId);
    return NextResponse.json(result);
  }
  if (action === "set_x_handle") {
    const result = await quest.setQuestXHandle(guard.userId, body.handle ?? "");
    return NextResponse.json(result);
  }
  if (action === "x_reply") {
    const mode = body.mode === "daily" ? "daily" : "engagement";
    const result = await quest.submitXEngagementQuest(guard.userId, body.replyUrl ?? "", mode);
    return NextResponse.json(result);
  }
  if (action === "secret_word") {
    const platform = body.platform === "medium" ? "medium" : "youtube";
    const result = await quest.submitSecretWordQuest(guard.userId, platform, body.word ?? "");
    return NextResponse.json(result);
  }
  if (action === "x_card_share") {
    const result = await quest.recordXCardShareQuest(guard.userId);
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
