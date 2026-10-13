import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  readTelegramVerifyBotToken,
  telegramVerifyWebhookSecret,
} from "@/lib/founders/telegram-bot";
import { handleSupportBotUpdate } from "@/lib/bug-reports/telegram-support-bot";
import {
  handleTelegramVerifyUpdate,
  type TelegramUpdate,
} from "@/lib/founders/telegram-verify-webhook";

function safeEqualSecret(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const botToken = readTelegramVerifyBotToken();
  if (!botToken) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const expected = telegramVerifyWebhookSecret(botToken);
  if (!safeEqualSecret(secret, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate & Parameters<typeof handleSupportBotUpdate>[0];
  try {
    // Support/bug intake + owner triage first; founder verification (/start <code>, contact) falls through.
    if (await handleSupportBotUpdate(update)) return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[support-bot] update failed:", err instanceof Error ? err.message : err);
    if (!update.message?.contact && !/^\/start\s+\S/.test(update.message?.text ?? "")) {
      return NextResponse.json({ ok: true });
    }
  }
  await handleTelegramVerifyUpdate(update);
  return NextResponse.json({ ok: true });
}
