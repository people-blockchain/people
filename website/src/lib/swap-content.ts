import type { Language } from "@/lib/preferences";
import swapAr from "./locales/surfaces/swap-ar.json" with { type: "json" };
import swapDe from "./locales/surfaces/swap-de.json" with { type: "json" };
import swapEn from "./locales/surfaces/swap-en.json" with { type: "json" };
import swapEs from "./locales/surfaces/swap-es.json" with { type: "json" };
import swapFr from "./locales/surfaces/swap-fr.json" with { type: "json" };
import swapId from "./locales/surfaces/swap-id.json" with { type: "json" };
import swapIt from "./locales/surfaces/swap-it.json" with { type: "json" };
import swapPt from "./locales/surfaces/swap-pt.json" with { type: "json" };
import swapRu from "./locales/surfaces/swap-ru.json" with { type: "json" };
import swapTr from "./locales/surfaces/swap-tr.json" with { type: "json" };
import swapVi from "./locales/surfaces/swap-vi.json" with { type: "json" };
import swapZh from "./locales/surfaces/swap-zh.json" with { type: "json" };

export type SwapCopyContent = typeof swapEn;

const baseSwapCopy: Record<string, SwapCopyContent> = {
  en: swapEn,
  ru: swapRu as SwapCopyContent,
  es: swapEs as SwapCopyContent,
  pt: swapPt as SwapCopyContent,
  fr: swapFr as SwapCopyContent,
  de: swapDe as SwapCopyContent,
  it: swapIt as SwapCopyContent,
  tr: swapTr as SwapCopyContent,
  vi: swapVi as SwapCopyContent,
  id: swapId as SwapCopyContent,
  zh: swapZh as SwapCopyContent,
  ar: swapAr as SwapCopyContent,
};

export const swapCopy: Record<Language, SwapCopyContent> = new Proxy(
  baseSwapCopy as unknown as Record<Language, SwapCopyContent>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
