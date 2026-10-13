import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderTelegramChats } from "@/db/schema";
import { applyTelegramPhoneVerification } from "./verification-service.ts";
import {
  markFounderTelegramStartCodeUsed,
  resolveFounderTelegramStartCode,
} from "./telegram-start-code.ts";
import {
  telegramBotLocale,
  tgMsg,
  type TelegramBotLocale,
} from "./telegram-bot-messages.ts";
import { readTelegramVerifyBotToken } from "./telegram-bot.ts";
import { getChatSiteLocale, setChatSiteLocale } from "../telegram-lang.ts";

export type TelegramUpdate = {
  message?: {
    chat?: { id: number };
    from?: { id: number; language_code?: string };
    contact?: { phone_number?: string; user_id?: number };
    text?: string;
  };
};

export async function handleTelegramVerifyUpdate(update: TelegramUpdate): Promise<void> {
  const botToken = readTelegramVerifyBotToken();
  if (!botToken) return;

  const msg = update.message;
  if (!msg?.chat?.id) return;
  const chatId = String(msg.chat.id);
  let locale = telegramBotLocale(msg.from?.language_code, await getChatSiteLocale(chatId));

  const text = msg.text?.trim() ?? "";
  if (text.startsWith("/start")) {
    const raw = text.replace(/^\/start\s*/, "").trim();
    // Site deep link: `<24-char code>_<site locale>` (old links: bare code).
    let payload = raw;
    let userId = raw ? await resolveFounderTelegramStartCode(raw) : null;
    const m = /^(.{24})_([a-z]{2,3})$/.exec(raw);
    if (!userId && m) {
      payload = m[1];
      userId = await resolveFounderTelegramStartCode(payload);
      await setChatSiteLocale(chatId, m[2]);
      locale = telegramBotLocale(msg.from?.language_code, m[2]);
    }
    if (!userId) {
      await sendTelegramMessage(botToken, msg.chat.id, tgMsg("invalidLink", locale));
      return;
    }
    const expires = new Date(Date.now() + 30 * 60 * 1000);
    const db = await getDbReady();
    await db
      .insert(founderTelegramChats)
      .values({ chatId, userId, expiresAt: expires, startCode: payload })
      .onConflictDoUpdate({
        target: founderTelegramChats.chatId,
        set: { userId, expiresAt: expires, startCode: payload },
      });
    await sendTelegramContactRequest(botToken, msg.chat.id, locale);
    return;
  }

  const phone = msg.contact?.phone_number;
  if (!phone) return;

  const fromId = msg.from?.id;
  const contactUserId = msg.contact?.user_id;
  if (fromId == null || contactUserId == null || contactUserId !== fromId) {
    await sendTelegramMessage(botToken, msg.chat.id, tgMsg("wrongContact", locale));
    return;
  }

  const db = await getDbReady();
  const row = await db
    .select()
    .from(founderTelegramChats)
    .where(eq(founderTelegramChats.chatId, chatId))
    .limit(1);
  const link = row[0];
  if (!link || link.expiresAt.getTime() <= Date.now()) {
    await sendTelegramMessage(botToken, msg.chat.id, tgMsg("sessionExpired", locale));
    return;
  }

  const telegramUserId = String(fromId);
  const result = await applyTelegramPhoneVerification(link.userId, phone, telegramUserId);

  if (result.ok) {
    if (link.startCode) await markFounderTelegramStartCodeUsed(link.startCode);
    await sendTelegramMessage(botToken, msg.chat.id, tgMsg("success", locale), { removeKeyboard: true });
    return;
  }

  const failKey = failureMessageKey(result.error);
  await sendTelegramMessage(botToken, msg.chat.id, tgMsg(failKey, locale));
}

function failureMessageKey(
  error: "phone_taken" | "telegram_taken" | "invalid_phone" | "already_verified",
): "phoneTaken" | "telegramTaken" | "invalidLink" | "alreadyVerified" {
  switch (error) {
    case "phone_taken":
      return "phoneTaken";
    case "telegram_taken":
      return "telegramTaken";
    case "already_verified":
      return "alreadyVerified";
    default:
      return "invalidLink";
  }
}

async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
  opts?: { removeKeyboard?: boolean },
) {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (opts?.removeKeyboard) {
    body.reply_markup = { remove_keyboard: true };
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendTelegramContactRequest(
  token: string,
  chatId: number,
  locale: TelegramBotLocale,
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: tgMsg("sharePhonePrompt", locale),
      reply_markup: {
        keyboard: [[{ text: tgMsg("sharePhoneButton", locale), request_contact: true, style: "success" }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    }),
  });
}
