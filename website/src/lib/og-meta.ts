import type { Metadata } from "next";
import { DOCUMENT_TITLES, NETWORK_NAME_BY_LANG, SITE_NAME, SITE_OG_DESCRIPTION, SITE_OG_DESCRIPTION_RU, SITE_URL } from "@/lib/site";
import type { Language } from "./preferences";

const OG_LOCALE: Record<Language, string> = {
  en: "en_US", ru: "ru_RU", es: "es_ES", pt: "pt_BR", fr: "fr_FR", de: "de_DE",
  it: "it_IT", tr: "tr_TR", vi: "vi_VN", id: "id_ID", zh: "zh_CN", ar: "ar_AR",
};

/** 1200x630 JPEGs under 300 KB in /public. Only EN and RU artwork exist; other locales use EN. */
export const OG_IMAGE_BY_LANG: Partial<Record<Language, string>> = {
  en: "/og-image.jpg",
  ru: "/og-image-ru.jpg",
};

const FOUNDERS_DESCRIPTION: Partial<Record<Language, string>> = {
  en: "Be one of the first million people building a blockchain for everyone. Get your founder number, invite friends and earn points on the People testnet.",
  ru: "Станьте одним из первых миллиона людей, строящих блокчейн для всех. Получите номер основателя, приглашайте друзей и зарабатывайте баллы в тестовой сети People.",
};

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

const TRANSPARENCY_DESCRIPTION: Partial<Record<Language, string>> = {
  en: "How PEOPLE Blockchain is funded: no venture capital, a small core team, a fixed 1B PPL supply, a treasury multisig and a security audit before mainnet.",
  ru: "Как финансируется PEOPLE Blockchain: без венчурного капитала, небольшая команда, фиксированный выпуск 1 млрд PPL, мультисиг казны и аудит безопасности до mainnet.",
};

const LITEPAPER_DESCRIPTION: Partial<Record<Language, string>> = {
  en: "The People litepaper: a blockchain where every user is a verified human, owned by its community and not by VCs. Product, tokenomics, roadmap and risks.",
  ru: "Litepaper People: блокчейн, где каждый пользователь — верифицированный человек, принадлежащий сообществу, а не венчурным фондам. Продукт, токеномика, роадмап и риски.",
};

type PageKey = "home" | "founders" | "transparency" | "litepaper";

/**
 * Open Graph + Twitter metadata for a public page, localized where copy exists
 * (en/ru full copy; other locales get a localized title and the English description).
 * `og:url` is the canonical path and never carries `?ref=`, so every referral link
 * renders the identical preview.
 */
export function buildPageMetadata(page: PageKey, lang: Language): Metadata {
  const titles = DOCUMENT_TITLES[lang];
  const title =
    page === "home"
      ? titles.home
      : page === "founders"
        ? titles.founders
        : page === "litepaper"
          ? titles.litepaper
          : titles.transparency;
  const description =
    page === "home"
      ? lang === "ru" ? SITE_OG_DESCRIPTION_RU : SITE_OG_DESCRIPTION
      : page === "founders"
        ? FOUNDERS_DESCRIPTION[lang] ?? FOUNDERS_DESCRIPTION.en!
        : page === "litepaper"
          ? LITEPAPER_DESCRIPTION[lang] ?? LITEPAPER_DESCRIPTION.en!
          : TRANSPARENCY_DESCRIPTION[lang] ?? TRANSPARENCY_DESCRIPTION.en!;
  const path =
    page === "home" ? "/" : page === "founders" ? "/founders" : page === "litepaper" ? "/litepaper" : "/transparency";
  const image = absoluteUrl(OG_IMAGE_BY_LANG[lang] ?? OG_IMAGE_BY_LANG.en!);
  const alt = `${SITE_NAME} — ${NETWORK_NAME_BY_LANG[lang]}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: SITE_NAME,
      url: absoluteUrl(path),
      locale: OG_LOCALE[lang],
      images: [{ url: image, width: 1200, height: 630, alt, type: "image/jpeg" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt }],
    },
  };
}
