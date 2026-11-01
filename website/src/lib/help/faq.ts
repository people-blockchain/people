/**
 * Help centre (`/help`) and the wallet "Help" button.
 *
 * One registry of participant questions. Answers are not written here: each
 * published entry points at copy that already ships on the site (`/docs`,
 * `/staking`, `/buy`) and is rendered from that source, so the two can never
 * drift. This module only owns the question wording and the topic grouping.
 *
 * Entries marked `needs-confirmation` cover sale, transfer, unbonding, token
 * and Season 0 facts the owner has not confirmed yet. They are never rendered
 * on the public page; `resolveHelpFaq(lang, { includePending: true })` exists
 * so tests can prove their sources and placeholders already resolve.
 *
 * No React, no network, no env reads — tested in `scripts/help-faq.test.mjs`.
 */

import type { Language } from "../preferences";
import { docsContent } from "../docs-content";
import { buyCopy } from "../buy-content";
import { buyCopyVars } from "../sale/buy-page";
import { fillCopy } from "../sale/format";
import { stakingCopy } from "../staking-content";
import { helpLang, helpUi, type HelpLang, type HelpTopicId } from "./ui";

export { helpLang, helpUi, type HelpLang, type HelpTopicId };

/** Date every published answer below was last checked against `main`. */
export const HELP_VERIFIED_AT = "2026-11-01";

export type HelpSource =
  /** An item of a `/docs` section; `title` is the EN item title, pinned so a reorder fails the tests. */
  | { kind: "docs"; section: string; item: number; title: string }
  /** An item of the `/buy` FAQ, filled with the live sale config. */
  | { kind: "buy"; item: number }
  /** Keys of the `/staking` copy joined in order. */
  | { kind: "staking"; keys: readonly string[] }
  /** No published source yet. */
  | { kind: "none" };

export type HelpEntryStatus = "published" | "needs-confirmation";

export type HelpEntry = {
  id: string;
  topic: HelpTopicId;
  q: Record<HelpLang, string>;
  source: HelpSource;
  /** Site routes the answer points to; each must exist under `src/app`. */
  links: readonly string[];
  status: HelpEntryStatus;
  /** For `needs-confirmation`: what the owner must confirm before publishing. */
  blocker?: string;
};

export const HELP_TOPICS: readonly HelpTopicId[] = ["ppl", "participation", "wallet", "staking", "buy", "network", "safety"];

export const HELP_ENTRIES: readonly HelpEntry[] = [
  {
    id: "what-is-ppl",
    topic: "ppl",
    q: { en: "What is PPL?", ru: "Что такое PPL?" },
    source: { kind: "docs", section: "basics", item: 0, title: "PPL is the network coin" },
    links: ["/docs", "/tokenomics"],
    status: "published",
  },
  {
    id: "ppl-fees",
    topic: "ppl",
    q: { en: "What do I pay fees in?", ru: "В чём платятся комиссии?" },
    source: { kind: "docs", section: "ppl-native", item: 1, title: "Fees only in PPL" },
    links: ["/fees"],
    status: "published",
  },
  {
    id: "fee-split",
    topic: "ppl",
    q: { en: "Where do network fees go?", ru: "Куда идут комиссии сети?" },
    source: { kind: "docs", section: "fees", item: 0, title: "How protocol fees are split" },
    links: ["/fees"],
    status: "published",
  },
  {
    id: "ppl-supply",
    topic: "ppl",
    q: { en: "How much PPL exists and how is it allocated?", ru: "Сколько всего PPL и как он распределён?" },
    source: { kind: "none" },
    links: ["/tokenomics"],
    status: "needs-confirmation",
    blocker: "Canonical tokenomics source: docs/TOKEN-ECONOMY.md, docs/ECONOMIC-MODEL-v0.1.md or /tokenomics.",
  },
  {
    id: "roles",
    topic: "participation",
    q: { en: "Participant, node, validator — what is the difference?", ru: "Участник, нода, валидатор — в чём разница?" },
    source: { kind: "docs", section: "basics", item: 1, title: "Participant, node, validator" },
    links: ["/docs"],
    status: "published",
  },
  {
    id: "proof-of-humanity",
    topic: "participation",
    q: { en: "How does PEOPLE check that I am a real person?", ru: "Как PEOPLE проверяет, что я реальный человек?" },
    source: { kind: "docs", section: "earn", item: 4, title: "Proof of humanity" },
    links: ["/docs"],
    status: "published",
  },
  {
    id: "participation-power",
    topic: "participation",
    q: { en: "What are participation points?", ru: "Что такое очки участия?" },
    source: { kind: "docs", section: "participation-depth", item: 0, title: "Participation Power" },
    links: ["/how-it-works"],
    status: "published",
  },
  {
    id: "growth-referrals",
    topic: "participation",
    q: { en: "How do Growth referrals work?", ru: "Как работают рефералы Growth?" },
    source: { kind: "docs", section: "earn", item: 2, title: "Growth referrals" },
    links: ["/docs"],
    status: "published",
  },
  {
    id: "season-0",
    topic: "participation",
    q: { en: "What are Season 0 points and how do they convert to PPL?", ru: "Что такое очки Season 0 и как они превратятся в PPL?" },
    source: { kind: "none" },
    links: [],
    status: "needs-confirmation",
    blocker: "Season 0 accrual and mainnet conversion rules are not published anywhere on the site.",
  },
  {
    id: "create-wallet",
    topic: "wallet",
    q: { en: "How do I create or restore a wallet?", ru: "Как создать или восстановить кошелёк?" },
    source: { kind: "docs", section: "start", item: 0, title: "01 · Create or restore a wallet" },
    links: ["/wallet"],
    status: "published",
  },
  {
    id: "test-ppl",
    topic: "wallet",
    q: { en: "How do I get test PPL?", ru: "Как получить тестовые PPL?" },
    source: { kind: "docs", section: "start", item: 2, title: "03 · Get test PPL" },
    links: ["/wallet"],
    status: "published",
  },
  {
    id: "transfer-missing",
    topic: "wallet",
    q: { en: "I sent a transfer but the balance did not change", ru: "Я отправил перевод, а баланс не изменился" },
    source: { kind: "docs", section: "help", item: 1, title: "I sent a transfer but the balance did not change" },
    links: ["/explorer"],
    status: "published",
  },
  {
    id: "transfers-open",
    topic: "wallet",
    q: { en: "When can I send purchased PPL to other people?", ru: "Когда купленные PPL можно отправлять другим людям?" },
    source: { kind: "buy", item: 1 },
    links: ["/buy"],
    status: "needs-confirmation",
    blocker: "Transfers open at ~1,000 verified participants — confirm the threshold.",
  },
  {
    id: "how-to-stake",
    topic: "staking",
    q: { en: "How do I stake PPL?", ru: "Как стейкать PPL?" },
    source: { kind: "staking", keys: ["lead", "aprDisclaimer"] },
    links: ["/staking"],
    status: "published",
  },
  {
    id: "unbonding",
    topic: "staking",
    q: { en: "How long does it take to unstake?", ru: "Сколько ждать вывода из стейкинга?" },
    source: { kind: "none" },
    links: ["/staking"],
    status: "needs-confirmation",
    blocker: "21 days is the SDK default hard-coded in StakingApp; confirm staking.params.unbonding_time on the live network.",
  },
  {
    id: "how-to-buy",
    topic: "buy",
    q: { en: "How do I buy PPL?", ru: "Как купить PPL?" },
    source: { kind: "none" },
    links: ["/buy"],
    status: "needs-confirmation",
    blocker: "Confirm /buy is live in production and that /help may link to it.",
  },
  {
    id: "buy-verification",
    topic: "buy",
    q: { en: "Why do I need verification to buy?", ru: "Зачем нужна верификация для покупки?" },
    source: { kind: "buy", item: 0 },
    links: ["/buy"],
    status: "needs-confirmation",
    blocker: "Confirm whitelist days (V2_SALE.whitelistDays).",
  },
  {
    id: "payment-networks",
    topic: "buy",
    q: { en: "Which networks can I pay from?", ru: "Из каких сетей можно платить?" },
    source: { kind: "buy", item: 2 },
    links: ["/buy"],
    status: "needs-confirmation",
    blocker: "Confirm the payment networks, USDT→USDC swap and its fee.",
  },
  {
    id: "sell-back",
    topic: "buy",
    q: { en: "Can I sell PPL back, and what are the limits?", ru: "Можно ли продать PPL обратно и какие лимиты?" },
    source: { kind: "buy", item: 3 },
    links: ["/buy"],
    status: "needs-confirmation",
    blocker: "Confirm hold days, daily reserve cap, per-address cap and fees after the PplCurveHubV2 audit fixes (#72).",
  },
  {
    id: "refund",
    topic: "buy",
    q: { en: "Can I get a refund?", ru: "Можно ли вернуть деньги?" },
    source: { kind: "buy", item: 4 },
    links: ["/buy"],
    status: "needs-confirmation",
    blocker: "Legal wording for final sales and the risk notice.",
  },
  {
    id: "testnet",
    topic: "network",
    q: { en: "Are test PPL worth money?", ru: "Тестовые PPL чего-то стоят?" },
    source: { kind: "docs", section: "ppl-native", item: 0, title: "Test coins" },
    links: ["/docs"],
    status: "published",
  },
  {
    id: "available-now",
    topic: "network",
    q: { en: "What can I use on the test network today?", ru: "Что уже работает в тестовой сети?" },
    source: { kind: "docs", section: "product-phases", item: 0, title: "Available now · test network" },
    links: ["/wallet", "/swap", "/create"],
    status: "published",
  },
  {
    id: "recovery-phrase",
    topic: "safety",
    q: { en: "Who can I share my recovery phrase with?", ru: "Кому можно сообщать фразу восстановления?" },
    source: { kind: "docs", section: "safety", item: 0, title: "Your recovery phrase is yours alone" },
    links: [],
    status: "published",
  },
  {
    id: "before-signing",
    topic: "safety",
    q: { en: "What should I check before signing?", ru: "Что проверить перед подписью?" },
    source: { kind: "docs", section: "safety", item: 1, title: "Before signing" },
    links: [],
    status: "published",
  },
  {
    id: "support-report",
    topic: "safety",
    q: { en: "What should I include in a support request?", ru: "Что написать в поддержку?" },
    source: { kind: "docs", section: "help", item: 3, title: "What to include in a support report" },
    links: [],
    status: "published",
  },
];

/** The answer text for one source, or null when the source has none. */
export function answerFor(source: HelpSource, lang: HelpLang): string | null {
  switch (source.kind) {
    case "docs": {
      const section = docsContent[lang].sections.find((s) => s.id === source.section);
      return section?.items[source.item]?.text ?? null;
    }
    case "buy": {
      const item = buyCopy[lang].faq.items[source.item];
      return item ? fillCopy(item.a, buyCopyVars(lang)) : null;
    }
    case "staking": {
      const copy = stakingCopy[lang] as Record<string, unknown>;
      const parts = source.keys.map((key) => copy[key]);
      return parts.every((part) => typeof part === "string" && part) ? parts.join(" ") : null;
    }
    case "none":
      return null;
  }
}

export type ResolvedHelpEntry = {
  id: string;
  topic: HelpTopicId;
  q: string;
  a: string;
  links: readonly string[];
  status: HelpEntryStatus;
  verifiedAt: string;
};

export type ResolvedHelpTopic = { id: HelpTopicId; title: string; entries: ResolvedHelpEntry[] };

/**
 * Topics with their answerable entries, in display order. Pending entries are
 * left out unless `includePending` is set; entries without an answer and
 * empty topics are always left out.
 */
export function resolveHelpFaq(lang: Language | string, options: { includePending?: boolean } = {}): ResolvedHelpTopic[] {
  const l = helpLang(lang);
  return HELP_TOPICS.map((topic) => ({
    id: topic,
    title: helpUi[l].topics[topic],
    entries: HELP_ENTRIES.filter((e) => e.topic === topic && (options.includePending || e.status === "published")).flatMap((e) => {
      const a = answerFor(e.source, l);
      return a ? [{ id: e.id, topic, q: e.q[l], a, links: e.links, status: e.status, verifiedAt: HELP_VERIFIED_AT }] : [];
    }),
  })).filter((t) => t.entries.length > 0);
}

/** Topics whose question or answer contains every word of the query. */
export function searchHelpFaq(topics: ResolvedHelpTopic[], query: string): ResolvedHelpTopic[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return topics;
  return topics
    .map((t) => ({
      ...t,
      entries: t.entries.filter((e) => {
        const text = `${t.title} ${e.q} ${e.a}`.toLocaleLowerCase();
        return words.every((w) => text.includes(w));
      }),
    }))
    .filter((t) => t.entries.length > 0);
}

/** Questions held back from `/help` until the owner confirms them. */
export function pendingHelpEntries(): HelpEntry[] {
  return HELP_ENTRIES.filter((e) => e.status === "needs-confirmation");
}
