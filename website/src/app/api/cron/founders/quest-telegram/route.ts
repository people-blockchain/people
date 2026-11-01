import { NextResponse } from "next/server";
import { recheckTelegramQuestMembers } from "@/lib/founders/quest/service";

/**
 * Weekly Telegram channel membership recheck. Protected by CRON_SECRET (Bearer).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 401 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await recheckTelegramQuestMembers();
  return NextResponse.json({ ok: true, ...result });
}
