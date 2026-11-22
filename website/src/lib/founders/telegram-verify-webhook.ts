import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderTelegramChats } from "@/db/schema";
import { parseColdStartPayload } from "@/lib/founding/contract";
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
import {
  COLD_START_CHAT_TTL_MS,
  clearColdStartChatSession,
  createPendingTelegramClaim,
  getColdStartChatSession,
  isMissingTableOrDbError,
  setColdStartChatSession,
} from "./telegram-cold-start.ts";
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
    const raw = text.replace(/^\/start(?:@\w+)?\s*/, "").trim();

    // 1. Cold-start flow: bare `/start` or `/start f1000[_<locale>[_<ref>]]` (no wallet required)
    const coldStart = raw === "" ? { locale: null, ref: null } : parseColdStartPayload(raw);
    if (coldStart !== null) {
      if (coldStart.locale) {
        await setChatSiteLocale(chatId, coldStart.locale);
        locale = telegramBotLocale(msg.from?.language_code, coldStart.locale);
      }
      await setColdStartChatSession(chatId, {
        locale: coldStart.locale ?? locale,
        ref: coldStart.ref,
        expiresAtMs: Date.now() + COLD_START_CHAT_TTL_MS,
      });
      try {
        const db = await getDbReady();
        await db.delete(founderTelegramChats).where(eq(founderTelegramChats.chatId, chatId));
      } catch (err) {
        if (!isMissingTableOrDbError(err)) throw err;
      }
      await sendTelegramContactRequest(botToken, msg.chat.id, locale);
      return;
    }

    // 2. Existing session-code flow for already-authenticated wallet users: `<24-char code>[_<locale>]`
    let payload = raw;
    let userId = raw
      ? await resolveFounderTelegramStartCode(raw).catch((err) => {
          if (isMissingTableOrDbError(err)) return null;
          throw err;
        })
      : null;
    const m = /^(.{24})_([a-z]{2,3})$/.exec(raw);
    if (!userId && m) {
      payload = m[1];
      userId = await resolveFounderTelegramStartCode(payload).catch((err) => {
        if (isMissingTableOrDbError(err)) return null;
        throw err;
      });
      await setChatSiteLocale(chatId, m[2]);
      locale = telegramBotLocale(msg.from?.language_code, m[2]);
    }
    if (!userId) {
      await sendTelegramMessage(botToken, msg.chat.id, tgMsg("invalidLink", locale));
      return;
    }
    await clearColdStartChatSession(chatId);
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

  // Check if this chat initiated a cold-start verification (no wallet yet)
  const coldSession = await getColdStartChatSession(chatId);
  if (coldSession) {
    if (coldSession.expiresAtMs <= Date.now()) {
      await clearColdStartChatSession(chatId);
      await sendTelegramMessage(botToken, msg.chat.id, tgMsg("sessionExpired", locale));
      return;
    }
    if (coldSession.locale) {
      locale = telegramBotLocale(msg.from?.language_code, coldSession.locale);
    }
    const pending = await createPendingTelegramClaim({
      phoneE164: phone,
      telegramUserId: String(fromId),
      chatId,
      locale,
      referredByCode: coldSession.ref,
    });
    if (!pending.ok) {
      const failKey = failureMessageKey(pending.error);
      await sendTelegramMessage(botToken, msg.chat.id, tgMsg(failKey, locale));
      return;
    }
    await clearColdStartChatSession(chatId);
    const replyText = tgMsg("coldStartPending", locale)
      .replace("{{refUrl}}", pending.referralUrl)
      .replace("{{claimUrl}}", pending.claimUrl);
    await sendTelegramMessage(botToken, msg.chat.id, replyText, {
      removeKeyboard: true,
      inlineButton: {
        text: tgMsg("coldStartClaimButton", locale),
        url: pending.claimUrl,
      },
    });
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
  opts?: { removeKeyboard?: boolean; inlineButton?: { text: string; url: string } },
) {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (opts?.inlineButton) {
    body.reply_markup = {
      inline_keyboard: [[{ text: opts.inlineButton.text, url: opts.inlineButton.url }]],
    };
  } else if (opts?.removeKeyboard) {
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
