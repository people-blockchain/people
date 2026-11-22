import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { readTelegramVerifyBotToken, telegramVerifyDeepLink } from "@/lib/founders/telegram-bot";
import { createFounderTelegramStartCode } from "@/lib/founders/telegram-start-code";
import { telegramColdStartLink } from "@/lib/founding/contract";

export async function GET(request: Request) {
  const urlObj = new URL(request.url);
  const site = urlObj.searchParams.get("locale")?.toLowerCase() ?? "";
  const ref = urlObj.searchParams.get("ref")?.trim() ?? null;

  const guard = await foundersApiGuard();
  if (!guard.ok) {
    // Visitor without a signed-in wallet session gets the cold-start @PeopleVerifyBot link
    const coldUrl = telegramColdStartLink(/^[a-z]{2,3}$/.test(site) ? site : null, ref);
    return NextResponse.json({ url: coldUrl, code: null, mode: "cold_start" });
  }

  if (!readTelegramVerifyBotToken()) {
    return NextResponse.json({ error: "bot_not_configured" }, { status: 503 });
  }
  try {
    const code = await createFounderTelegramStartCode(guard.userId);
    // Site locale rides in the start param (`<code>_<locale>`) so the bot answers in it.
    const url = telegramVerifyDeepLink(/^[a-z]{2,3}$/.test(site) ? `${code}_${site}` : code);
    return NextResponse.json({ url, code, mode: "session" });
  } catch {
    const coldUrl = telegramColdStartLink(/^[a-z]{2,3}$/.test(site) ? site : null, ref);
    return NextResponse.json({ url: coldUrl, code: null, mode: "cold_start" });
  }
}
