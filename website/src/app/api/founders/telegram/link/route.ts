import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { readTelegramVerifyBotToken, telegramVerifyDeepLink } from "@/lib/founders/telegram-bot";
import { createFounderTelegramStartCode } from "@/lib/founders/telegram-start-code";

export async function GET(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;
  if (!readTelegramVerifyBotToken()) {
    return NextResponse.json({ error: "bot_not_configured" }, { status: 503 });
  }
  try {
    const code = await createFounderTelegramStartCode(guard.userId);
    const site = new URL(request.url).searchParams.get("locale")?.toLowerCase() ?? "";
    // Site locale rides in the start param (`<code>_<locale>`) so the bot answers in it.
    const url = telegramVerifyDeepLink(/^[a-z]{2,3}$/.test(site) ? `${code}_${site}` : code);
    return NextResponse.json({ url, code });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
