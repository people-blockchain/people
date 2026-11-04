/**
 * Public-site presentation constants for the selling landing.
 *
 * These numbers mirror approved / runtime economics for display only.
 * This file does not change protocol, Token Factory, BondingCurveEngine,
 * Growth Pool settlement, fee routing, or referral engines.
 */

import type { Language } from "./preferences";

/** Mandatory Token Factory community allocation at launch (always credited to the token's community vault). */
export const TOKEN_COMMUNITY_ALLOCATION_PCT = 10;

/**
 * Public headline cap when the creator chooses curve leftovers for the community pool at launch.
 * Not guaranteed on every launch (default leftover mode burns unsold curve tokens).
 */
export const TOKEN_COMMUNITY_SHARE_MAX_PCT = 27;

/** Rounded public estimate of curve leftovers that may join the pool (~⅙ of supply in typical migration math). */
export const TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT = 17;

/**
 * Headline percentage for hero stats, diagrams, and OG labels ("Up to 27%").
 * Distinct from the guaranteed launch slice (`TOKEN_COMMUNITY_ALLOCATION_PCT`).
 */
export const TOKEN_COMMUNITY_SHARE_PCT = TOKEN_COMMUNITY_SHARE_MAX_PCT;

export const TOKEN_COMMUNITY_SHARE_HEADLINE = `Up to ${TOKEN_COMMUNITY_SHARE_MAX_PCT}%` as const;

/** Localized headline next to the 27% figure (EN constant above stays for OG/assertions). */
export const TOKEN_COMMUNITY_SHARE_HEADLINE_BY_LANG: Record<Language, string> = {
  en: TOKEN_COMMUNITY_SHARE_HEADLINE,
  ru: "До 27%",
  de: "Bis zu 27%",
  es: "Hasta un 27%",
  fr: "Jusqu'à 27%",
  it: "Fino al 27%",
  pt: "Até 27%",
  tr: "%27'ye kadar",
  id: "Hingga 27%",
  vi: "Lên đến 27%",
  zh: "最高27%",
  ar: "حتى 27%",
};

export function communityShareHeadline(lang: Language): string {
  return TOKEN_COMMUNITY_SHARE_HEADLINE_BY_LANG[lang] ?? TOKEN_COMMUNITY_SHARE_HEADLINE;
}

/** Short public explanation beside the headline (mirrors approved economics; locale JSON may expand). */
export const TOKEN_COMMUNITY_SHARE_EXPLANATION_BY_LANG: Record<Language, string> = {
  en: "10% always go to the community pool. Up to 17% more is chosen by the creator at launch: either also to the participants' pool, or burned.",
  ru: "10% всегда уходят в пул сообщества. Ещё до 17% создатель выбирает при запуске: либо тоже в пул участников, либо сжигание.",
  de: "10 % gehen immer in den Community-Pool. Bis zu 17 % mehr wählt der Ersteller beim Start: entweder ebenfalls in den Teilnehmer-Pool oder Verbrennung.",
  es: "El 10% siempre va al pool de la comunidad. Hasta un 17% más lo elige el creador al lanzar: también al pool de participantes o quema.",
  fr: "10 % vont toujours au pool communautaire. Jusqu'à 17 % de plus sont choisis par le créateur au lancement : pool des participants ou brûlage.",
  it: "Il 10% va sempre al pool della comunità. Fino al 17% in più lo sceglie il creatore al lancio: pool dei partecipanti o burn.",
  pt: "10% vão sempre para o pool da comunidade. Até 17% a mais são escolhidos pelo criador no lançamento: pool dos participantes ou queima.",
  tr: "10% her zaman topluluk havuzuna gider. En fazla 17% daha kurucu tarafından lansmanda seçilir: katılımcı havuzuna veya yakma.",
  id: "10% selalu masuk ke kolam komunitas. Hingga 17% lagi dipilih kreator saat peluncuran: ke kolam peserta atau dibakar.",
  vi: "10% luôn vào quỹ cộng đồng. Thêm tối đa 17% do người tạo chọn khi ra mắt: vào quỹ người tham gia hoặc đốt.",
  zh: "10% 始终进入社区池。另最多 17% 由创建者在发布时选择：进入参与者池或销毁。",
  ar: "10% تذهب دائمًا إلى مجمع المجتمع. حتى 17% إضافية يختارها المنشئ عند الإطلاق: إما إلى مجمع المشاركين أو الحرق.",
};

export function communityShareExplanation(lang: Language): string {
  return TOKEN_COMMUNITY_SHARE_EXPLANATION_BY_LANG[lang] ?? TOKEN_COMMUNITY_SHARE_EXPLANATION_BY_LANG.en;
}

/** Owner-approved EN explanation (locale JSON should mirror; asserted in copy guards). */
export const TOKEN_COMMUNITY_SHARE_EXPLANATION_EN =
  "10% of every new token goes to its community pool at launch, guaranteed. The rest of the curve leftovers (~17%) goes to the community pool or is burned — the creator chooses once at launch.";

export const TOKEN_COMMUNITY_TIMELOCK_NOTE_EN =
  "The pool is governed by the PEOPLE timelock and paid out to verified people over time, not instantly; this is not a yield promise.";

/** Public copy uses "Up to 27%", not bare "27%" or open-ended "27%+". */
export const TOKEN_COMMUNITY_ALLOCATION_PLUS = false;

/** Approved Model A split of eligible integer network fees (percent). */
export const MODEL_A_FEE_SPLIT = [
  { id: "validators", pct: 30, tone: "brand" as const },
  { id: "community", pct: 25, tone: "value" as const },
  { id: "treasury", pct: 20, tone: "violet" as const },
  { id: "liquidity", pct: 10, tone: "warm" as const },
  { id: "growth", pct: 15, tone: "brand" as const },
  { id: "burn", pct: 0, tone: "neutral" as const },
] as const;

/**
 * Public mirror of runtime Beta Growth payout weights:
 * `GROWTH_L1_WEIGHT` / `GROWTH_L2_WEIGHT` in
 * `packages/core/src/growth-settlement.ts` in the People's node monorepo.
 *
 * Shares of the Growth reward budget (not of total network fees).
 * Growth Pool itself remains 15% of eligible fees (Model A).
 * Public surfaces expose only these two paid lines. Website does not import
 * protocol packages.
 */
export const GROWTH_L1_WEIGHT = 70;
export const GROWTH_L2_WEIGHT = 30;

export const GROWTH_PAID_LINES = [
  { id: "L1", pct: 70 }, // must equal GROWTH_L1_WEIGHT (runtime mirror)
  { id: "L2", pct: 30 }, // must equal GROWTH_L2_WEIGHT (runtime mirror)
] as const;

export const GROWTH_PAID_LINE_IDS = GROWTH_PAID_LINES.map((line) => line.id);
