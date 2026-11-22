import { buyCopy } from "@/lib/buy-content";
import { resolveHelpFaq } from "@/lib/help/faq";
import { buyCopyVars, formatOpenDate } from "@/lib/sale/buy-page";
import { fillCopy } from "@/lib/sale/format";
import { parseV2OpenDate, V2_OPEN_DATE_DEFAULT } from "@/lib/sale/v2/stats-copy";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import { SOCIAL_SAME_AS } from "@/lib/social-profiles";
import type { Language } from "@/lib/preferences";

export type FaqPair = { question: string; answer: string };

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    sameAs: SOCIAL_SAME_AS,
  };
}

export function webSiteJsonLd() {
  return {
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
  };
}

/** Launch date is already stated across `/buy`, tokenomics and litepaper copy. */
export function mainnetBetaEventJsonLd() {
  const openDate = parseV2OpenDate(process.env.NEXT_PUBLIC_PPL_V2_OPEN_DATE ?? V2_OPEN_DATE_DEFAULT);
  const openDay = openDate.toISOString().slice(0, 10);
  return {
    "@type": "Event",
    name: "PEOPLE Mainnet Beta",
    description:
      "Opening of PEOPLE Mainnet Beta and the public PPL sale on Base (USDC/USDT). PPL are credited on the PEOPLE network after purchase.",
    startDate: openDay,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "VirtualLocation",
      url: new URL("/buy", SITE_URL).toString(),
    },
    organizer: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

export function faqPageJsonLd(entries: readonly FaqPair[]) {
  if (entries.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: entries.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}

export function breadcrumbJsonLd(
  crumbs: readonly { name: string; path: string }[],
) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: new URL(crumb.path, SITE_URL).toString(),
    })),
  };
}

export function jsonLdGraph(...nodes: Array<Record<string, unknown> | null>) {
  const graph = nodes.filter((n): n is Record<string, unknown> => n !== null);
  return { "@context": "https://schema.org", "@graph": graph };
}

export function helpFaqPairs(lang: Language): FaqPair[] {
  return resolveHelpFaq(lang).flatMap((topic) =>
    topic.entries.map((entry) => ({ question: entry.q, answer: entry.a })),
  );
}

export function buyFaqPairs(lang: Language): FaqPair[] {
  const t = buyCopy[lang].faq;
  const vars = buyCopyVars(lang);
  return t.items.map((item) => ({
    question: fillCopy(item.q, vars),
    answer: fillCopy(item.a, vars),
  }));
}

export function mainnetOpenDateLabel(lang: Language): string {
  const openDate = parseV2OpenDate(process.env.NEXT_PUBLIC_PPL_V2_OPEN_DATE ?? V2_OPEN_DATE_DEFAULT);
  return formatOpenDate(openDate, lang);
}