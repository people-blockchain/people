import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendDailyTicketSummary } from "@/lib/bug-reports/telegram-support-bot";

/**
 * GET/POST /api/telegram/daily-summary — Vercel cron target (see `crons` in vercel.json).
 * Posts the open-ticket digest to the bot owner's DM. Protected by CRON_SECRET: Vercel sends it
 * as `Authorization: Bearer <CRON_SECRET>`. Fail closed — an unconfigured secret never leaves the
 * endpoint open.
 */
function safeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "daily_summary_not_configured" }, { status: 401 });
  }
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!safeEqual(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendDailyTicketSummary();
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
