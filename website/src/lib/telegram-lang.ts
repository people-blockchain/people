import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { telegramBotState } from "@/db/schema";

/**
 * Per-user language for @PeopleVerifyBot. Priority: site locale the user came from (deep-link
 * start param suffix, stored per chat in telegram_bot_state) > Telegram from.language_code >
 * English. Russian only for ru and CIS languages the site maps to ru. No module-level state.
 */

/** Base language from a BCP-47-ish code; CIS languages (be, kk, ky, tg, uz-Cyrl) map to ru. */
export function baseLang(code?: string | null): string {
  const c = (code ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!c) return "";
  if (/^uz-cyrl/.test(c)) return "ru";
  const base = c.split("-")[0];
  if (["be", "kk", "ky", "tg"].includes(base)) return "ru";
  return base;
}

/** Pick the first supported language among candidates (site locale first), else "en". */
export function pickLang<L extends string>(supported: readonly L[], ...candidates: (string | null | undefined)[]): L {
  for (const cand of candidates) {
    const b = baseLang(cand);
    if (b && (supported as readonly string[]).includes(b)) return b as L;
  }
  return "en" as L;
}

/** Site-locale suffix in a start param: `support_ka`, `<code>_ka` / `<code>_pt` (2-3 letters). */
export function splitStartLocale(payload: string): { base: string; siteLocale: string | null } {
  const m = /^(.*?)_([a-z]{2,3})$/.exec(payload);
  return m ? { base: m[1], siteLocale: m[2] } : { base: payload, siteLocale: null };
}

const chatLangKey = (chatId: string | number) => `lang:${chatId}`;

export async function getChatSiteLocale(chatId: string | number): Promise<string | null> {
  try {
    const db = await getDbReady();
    const [row] = await db.select().from(telegramBotState).where(eq(telegramBotState.key, chatLangKey(chatId))).limit(1);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setChatSiteLocale(chatId: string | number, locale: string): Promise<void> {
  const value = baseLang(locale).slice(0, 8);
  if (!value) return;
  try {
    const db = await getDbReady();
    await db
      .insert(telegramBotState)
      .values({ key: chatLangKey(chatId), value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: telegramBotState.key, set: { value, updatedAt: new Date() } });
  } catch {
    /* table unavailable: fall back to language_code */
  }
}
