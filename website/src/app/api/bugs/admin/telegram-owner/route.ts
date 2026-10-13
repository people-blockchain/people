import { NextResponse } from "next/server";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import { getOwnerChatId, ownerClaimDeepLink } from "@/lib/bug-reports/telegram-support-bot";

/**
 * GET /api/bugs/admin/telegram-owner — admin only. Redirects to the one-time owner-claim deep
 * link for @PeopleVerifyBot; pressing Start registers that private chat as the triage chat.
 * `?json=1` returns status instead (never the bot token).
 */
export async function GET(request: Request) {
  if (!(await isDiscoverAdmin())) {
    if (new URL(request.url).searchParams.get("json")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/admin/telegram-owner", request.url), 302);
  }
  const link = ownerClaimDeepLink();
  if (!link) return NextResponse.json({ error: "bot_not_configured" }, { status: 503 });
  const ownerRegistered = !!(await getOwnerChatId());
  if (new URL(request.url).searchParams.get("json")) {
    return NextResponse.json({ ownerRegistered, link });
  }
  return NextResponse.redirect(link, 302);
}
