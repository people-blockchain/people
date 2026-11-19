import { getOwnerChatId, tgApi } from "@/lib/bug-reports/telegram-support-bot";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Pings the owner's Telegram chat about a new live-chat message. Never throws. */
export async function notifySupportMessage(opts: {
  threadId: string;
  from: string;
  text: string;
}): Promise<void> {
  try {
    const chatId = await getOwnerChatId();
    if (!chatId) return;
    const preview = opts.text.length > 500 ? `${opts.text.slice(0, 500)}…` : opts.text;
    const text = `💬 <b>Live chat</b> · ${escapeHtml(opts.from)}\nThread: <code>${escapeHtml(opts.threadId.slice(0, 8))}</code>\n\n${escapeHtml(preview)}`;
    await tgApi("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("[support-chat] notify failed:", err instanceof Error ? err.message : err);
  }
}
