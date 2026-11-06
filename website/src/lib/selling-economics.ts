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
 * Public cap when curve leftovers join the pool (explanation copy only — not the headline figure).
 * Headlines use `TOKEN_COMMUNITY_ALLOCATION_PCT` (guaranteed at launch).
 */
export const TOKEN_COMMUNITY_SHARE_PCT = TOKEN_COMMUNITY_SHARE_MAX_PCT;

/** Big-number headline on community blocks, factory, and diagrams — guaranteed launch slice only. */
export const TOKEN_COMMUNITY_SHARE_HEADLINE = `${TOKEN_COMMUNITY_ALLOCATION_PCT}%` as const;

/** Owner-approved EN section headline (locale JSON mirrors this structure). */
export const TOKEN_COMMUNITY_SHARE_HEADLINE_SENTENCE_EN =
  "10% of every new token goes to its community pool — guaranteed." as const;

/** Localized big-number headline (`10%` is universal; wording lives in locale JSON titles). */
export const TOKEN_COMMUNITY_SHARE_HEADLINE_BY_LANG: Record<Language, string> = {
  en: TOKEN_COMMUNITY_SHARE_HEADLINE,
  ru: "10%",
  de: "10 %",
  es: "10%",
  fr: "10 %",
  it: "10%",
  pt: "10%",
  tr: "%10",
  id: "10%",
  vi: "10%",
  zh: "10%",
  ar: "10%",
};

export function communityShareHeadline(lang: Language): string {
  return TOKEN_COMMUNITY_SHARE_HEADLINE_BY_LANG[lang] ?? TOKEN_COMMUNITY_SHARE_HEADLINE;
}

/** Short public explanation beside the headline — optional curve remainder and total cap only here. */
export const TOKEN_COMMUNITY_SHARE_EXPLANATION_BY_LANG: Record<Language, string> = {
  en: `At launch the creator can also send the unsold curve remainder (up to ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%) to the pool instead of burning it — up to ${TOKEN_COMMUNITY_SHARE_MAX_PCT}% in total.`,
  ru: `При запуске создатель может также направить остаток непроданной кривой (до ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%) в пул вместо сжигания — до ${TOKEN_COMMUNITY_SHARE_MAX_PCT}% суммарно.`,
  de: `Beim Start kann der Ersteller den unverkauften Kurvenrest (bis ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT} %) statt Verbrennung in den Pool senden — insgesamt bis ${TOKEN_COMMUNITY_SHARE_MAX_PCT} %.`,
  es: `Al lanzar, el creador puede enviar el resto no vendido de la curva (hasta ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%) al pool en lugar de quemarlo — hasta ${TOKEN_COMMUNITY_SHARE_MAX_PCT}% en total.`,
  fr: `Au lancement, le créateur peut aussi envoyer le reliquat invendu de la courbe (jusqu'à ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT} %) au pool au lieu de le brûler — jusqu'à ${TOKEN_COMMUNITY_SHARE_MAX_PCT} % au total.`,
  it: `Al lancio il creatore può anche inviare l'invenduto sulla curva (fino a ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%) al pool invece di bruciarlo — fino al ${TOKEN_COMMUNITY_SHARE_MAX_PCT}% in totale.`,
  pt: `No lançamento, o criador também pode enviar o restante não vendido da curva (até ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%) para o pool em vez de queimar — até ${TOKEN_COMMUNITY_SHARE_MAX_PCT}% no total.`,
  tr: `Lansmanda kurucu, satılmayan eğri artığını (~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%'ye kadar) yakmak yerine havuza gönderebilir — toplamda %${TOKEN_COMMUNITY_SHARE_MAX_PCT}'ye kadar.`,
  id: `Saat peluncuran, kreator juga dapat mengirim sisa kurva yang belum terjual (hingga ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%) ke pool alih-alih membakar — hingga ${TOKEN_COMMUNITY_SHARE_MAX_PCT}% total.`,
  vi: `Khi ra mắt, người tạo cũng có thể gửi phần còn lại trên đường cong chưa bán (tới ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%) vào quỹ thay vì đốt — tối đa ${TOKEN_COMMUNITY_SHARE_MAX_PCT}% tổng cộng.`,
  zh: `发布时，创建者也可将曲线上未售出部分（最多约 ${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%）送入社区池而非销毁 — 合计最高 ${TOKEN_COMMUNITY_SHARE_MAX_PCT}%。`,
  ar: `عند الإطلاق يمكن للمنشئ أيضًا إرسال بقية المنحنى غير المباع (حتى ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%) إلى المجمع بدل الحرق — حتى ${TOKEN_COMMUNITY_SHARE_MAX_PCT}% إجمالاً.`,
};

export function communityShareExplanation(lang: Language): string {
  return TOKEN_COMMUNITY_SHARE_EXPLANATION_BY_LANG[lang] ?? TOKEN_COMMUNITY_SHARE_EXPLANATION_BY_LANG.en;
}

/** Owner-approved EN explanation (locale JSON should mirror; asserted in copy guards). */
export const TOKEN_COMMUNITY_SHARE_EXPLANATION_EN =
  `At launch the creator can also send the unsold curve remainder (up to ~${TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT}%) to the pool instead of burning it — up to ${TOKEN_COMMUNITY_SHARE_MAX_PCT}% in total.`;

export const TOKEN_COMMUNITY_TIMELOCK_NOTE_EN =
  "The pool is governed by the PEOPLE timelock and paid out to verified people over time, not instantly; this is not a yield promise.";

/** Public copy uses explicit totals in explanations; headlines stay on the guaranteed 10%. */
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
