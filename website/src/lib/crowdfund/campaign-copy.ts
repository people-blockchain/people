/**
 * Text for the crowdfund campaign page and the wizard's days + hours input. EN is the base; each
 * locale has a full `crowdfund-<lang>.json`, deep-merged over EN so a missing key never renders
 * `undefined` (same pattern as `tx-preflight-copy.ts`).
 */
import type { Language } from "@/lib/preferences";
import en from "@/lib/locales/surfaces/crowdfund-en.json" with { type: "json" };
import ru from "@/lib/locales/surfaces/crowdfund-ru.json" with { type: "json" };
import es from "@/lib/locales/surfaces/crowdfund-es.json" with { type: "json" };
import pt from "@/lib/locales/surfaces/crowdfund-pt.json" with { type: "json" };
import fr from "@/lib/locales/surfaces/crowdfund-fr.json" with { type: "json" };
import de from "@/lib/locales/surfaces/crowdfund-de.json" with { type: "json" };
import it from "@/lib/locales/surfaces/crowdfund-it.json" with { type: "json" };
import tr from "@/lib/locales/surfaces/crowdfund-tr.json" with { type: "json" };
import vi from "@/lib/locales/surfaces/crowdfund-vi.json" with { type: "json" };
import id from "@/lib/locales/surfaces/crowdfund-id.json" with { type: "json" };
import zh from "@/lib/locales/surfaces/crowdfund-zh.json" with { type: "json" };
import ar from "@/lib/locales/surfaces/crowdfund-ar.json" with { type: "json" };

export type CrowdfundCopy = typeof en;

const rawByLanguage: Record<Language, Partial<CrowdfundCopy>> = { en, ru, es, pt, fr, de, it, tr, vi, id, zh, ar };

export const crowdfundCopy: Record<Language, CrowdfundCopy> = Object.fromEntries(
  Object.entries(rawByLanguage).map(([lang, copy]) => [lang, { ...en, ...copy }]),
) as Record<Language, CrowdfundCopy>;
