/**
 * Labels for the help centre and the wallet "Help" button. Kept apart from
 * `faq.ts` so the wallet bundle does not pull in the docs and sale copy.
 */

import type { Language } from "../preferences";

export type HelpLang = "en" | "ru";

export type HelpTopicId = "ppl" | "participation" | "wallet" | "buy" | "staking" | "network" | "safety";

export const helpUi: Record<HelpLang, {
  eyebrow: string;
  title: string;
  lead: string;
  search: string;
  empty: string;
  source: string;
  verified: string;
  walletButton: string;
  more: string;
  topics: Record<HelpTopicId, string>;
}> = {
  en: {
    eyebrow: "HELP / PEOPLE",
    title: "Help",
    lead: "Short answers to the most common questions. Every answer comes from a page on this site and links to it.",
    search: "Search questions",
    empty: "Nothing found. Try “wallet”, “fees” or “staking”.",
    source: "Source",
    verified: "Checked",
    walletButton: "Help",
    more: "Didn’t find an answer? See the documentation.",
    topics: {
      ppl: "PPL",
      participation: "Taking part",
      wallet: "Wallet and transfers",
      staking: "Staking",
      buy: "Buying PPL",
      network: "Test network",
      safety: "Safety and support",
    },
  },
  ru: {
    eyebrow: "ПОМОЩЬ / PEOPLE",
    title: "Помощь",
    lead: "Короткие ответы на частые вопросы. Каждый ответ взят со страницы этого сайта и ведёт на неё.",
    search: "Найти вопрос",
    empty: "Ничего не найдено. Попробуйте «кошелёк», «комиссии» или «стейкинг».",
    source: "Источник",
    verified: "Проверено",
    walletButton: "Помощь",
    more: "Не нашли ответ? Загляните в документацию.",
    topics: {
      ppl: "PPL",
      participation: "Участие",
      wallet: "Кошелёк и переводы",
      staking: "Стейкинг",
      buy: "Покупка PPL",
      network: "Тестовая сеть",
      safety: "Безопасность и поддержка",
    },
  },
};

/** Only EN and RU are written; every other language reads EN. */
export function helpLang(lang: Language | string): HelpLang {
  return lang === "ru" ? "ru" : "en";
}

