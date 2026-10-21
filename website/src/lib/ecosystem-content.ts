import type { Language } from "./preferences";
import ecosystemAr from "./locales/surfaces/ecosystem-ar.json" with { type: "json" };
import ecosystemDe from "./locales/surfaces/ecosystem-de.json" with { type: "json" };
import ecosystemEn from "./locales/surfaces/ecosystem-en.json" with { type: "json" };
import ecosystemEs from "./locales/surfaces/ecosystem-es.json" with { type: "json" };
import ecosystemFr from "./locales/surfaces/ecosystem-fr.json" with { type: "json" };
import ecosystemId from "./locales/surfaces/ecosystem-id.json" with { type: "json" };
import ecosystemIt from "./locales/surfaces/ecosystem-it.json" with { type: "json" };
import ecosystemPt from "./locales/surfaces/ecosystem-pt.json" with { type: "json" };
import ecosystemRu from "./locales/surfaces/ecosystem-ru.json" with { type: "json" };
import ecosystemTr from "./locales/surfaces/ecosystem-tr.json" with { type: "json" };
import ecosystemVi from "./locales/surfaces/ecosystem-vi.json" with { type: "json" };
import ecosystemZh from "./locales/surfaces/ecosystem-zh.json" with { type: "json" };

export type EcosystemCategory = "payments" | "markets" | "communities" | "tools";
export type EcosystemStatus = "testnet" | "coming_soon";
export type EcosystemLabel = "built_by_people" | "community";

export type EcosystemProduct = {
  id: string;
  category: EcosystemCategory;
  name: string;
  monogram: string;
  href: string;
  external: boolean;
  status: EcosystemStatus;
  label: EcosystemLabel;
};

export type EcosystemPublicCopy = typeof ecosystemEn;

export const ECOSYSTEM_CATEGORIES: EcosystemCategory[] = [
  "payments",
  "markets",
  "communities",
  "tools",
];

export const ECOSYSTEM_PRODUCTS: EcosystemProduct[] = [
  {
    id: "people-lavka",
    category: "payments",
    name: "PEOPLE Lavka",
    monogram: "L",
    href: "https://peoplelavka.com",
    external: true,
    status: "testnet",
    label: "built_by_people",
  },
  {
    id: "people-predict",
    category: "markets",
    name: "PEOPLE Predict",
    monogram: "P",
    href: "https://peoplepredict.app",
    external: true,
    status: "coming_soon",
    label: "built_by_people",
  },
  {
    id: "people-clubs",
    category: "communities",
    name: "PEOPLE Clubs",
    monogram: "C",
    href: "https://peopleclubs.com",
    external: true,
    status: "coming_soon",
    label: "built_by_people",
  },
  {
    id: "people-multisig",
    category: "tools",
    name: "PEOPLE Multisig",
    monogram: "M",
    href: "/multisig",
    external: false,
    status: "testnet",
    label: "built_by_people",
  },
  {
    id: "people-wallet",
    category: "tools",
    name: "PEOPLE Wallet",
    monogram: "W",
    href: "/wallet",
    external: false,
    status: "testnet",
    label: "built_by_people",
  },
  {
    id: "people-explorer",
    category: "tools",
    name: "PEOPLE Explorer",
    monogram: "E",
    href: "/explorer",
    external: false,
    status: "testnet",
    label: "built_by_people",
  },
];

export const ecosystemPublic: Record<Language, EcosystemPublicCopy> = {
  en: ecosystemEn,
  ru: ecosystemRu,
  es: ecosystemEs,
  pt: ecosystemPt,
  fr: ecosystemFr,
  de: ecosystemDe,
  it: ecosystemIt,
  tr: ecosystemTr,
  vi: ecosystemVi,
  id: ecosystemId,
  zh: ecosystemZh,
  ar: ecosystemAr,
};
