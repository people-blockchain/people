import { displayAssetSymbol } from "@/lib/hidden-assets";
import type { Language } from "@/lib/preferences";
import uxEn from "./locales/surfaces/ux-en.json" with { type: "json" };
import uxRu from "./locales/surfaces/ux-ru.json" with { type: "json" };
import uxEs from "./locales/surfaces/ux-es.json" with { type: "json" };
import uxPt from "./locales/surfaces/ux-pt.json" with { type: "json" };
import uxFr from "./locales/surfaces/ux-fr.json" with { type: "json" };
import uxDe from "./locales/surfaces/ux-de.json" with { type: "json" };
import uxIt from "./locales/surfaces/ux-it.json" with { type: "json" };
import uxTr from "./locales/surfaces/ux-tr.json" with { type: "json" };
import uxVi from "./locales/surfaces/ux-vi.json" with { type: "json" };
import uxId from "./locales/surfaces/ux-id.json" with { type: "json" };
import uxZh from "./locales/surfaces/ux-zh.json" with { type: "json" };
import uxAr from "./locales/surfaces/ux-ar.json" with { type: "json" };

/** Shared plain-language strings for amounts, swap, liquidity, explorer and create forms. */
export type UxCopy = typeof uxEn;

export const uxCopy: Record<Language, UxCopy> = {
  en: uxEn,
  ru: uxRu,
  es: uxEs,
  pt: uxPt,
  fr: uxFr,
  de: uxDe,
  it: uxIt,
  tr: uxTr,
  vi: uxVi,
  id: uxId,
  zh: uxZh,
  ar: uxAr,
};

/** Replace `{name}` placeholders. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}

/** Display symbol: the testnet USDT is always labelled as a test token. */
export function displaySymbol(assetId: string, symbol: string | undefined, t: UxCopy): string {
  const id = assetId.toLowerCase();
  if (id === "ppl") return "PPL";
  if (id === "usdt") return t.testUsdt;
  return displayAssetSymbol(assetId, symbol);
}

export function txTypeLabel(type: string | undefined, t: UxCopy): string {
  const map = t.txTypes as Record<string, string>;
  return (type && map[type]) || map.other;
}
