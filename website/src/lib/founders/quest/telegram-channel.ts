import { readTelegramVerifyBotToken } from "../telegram-bot.ts";
import { QUEST_TELEGRAM_CHANNEL } from "./config.ts";

export type TelegramMemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

export type GetChatMemberResult =
  | { ok: true; status: TelegramMemberStatus }
  | { ok: false; reason: "no_token" | "api_error" | "not_found" };

const ACTIVE: ReadonlySet<TelegramMemberStatus> = new Set([
  "creator",
  "administrator",
  "member",
  "restricted",
]);

export function isActiveTelegramMember(status: TelegramMemberStatus): boolean {
  return ACTIVE.has(status);
}

export async function fetchTelegramChannelMember(
  telegramUserId: string,
  deps?: {
    botToken?: string | null;
    fetchImpl?: typeof fetch;
    chatId?: string;
  },
): Promise<GetChatMemberResult> {
  const token = deps?.botToken ?? readTelegramVerifyBotToken();
  if (!token) return { ok: false, reason: "no_token" };
  const chatId = deps?.chatId ?? QUEST_TELEGRAM_CHANNEL;
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(telegramUserId)}`;
  const res = await fetchImpl(url);
  if (!res.ok) return { ok: false, reason: "api_error" };
  const body = (await res.json()) as { ok?: boolean; result?: { status?: TelegramMemberStatus } };
  if (!body.ok || !body.result?.status) return { ok: false, reason: "not_found" };
  return { ok: true, status: body.result.status };
}
