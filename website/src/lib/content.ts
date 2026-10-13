import { en } from "./locales/en";
import { ru } from "./locales/ru";
import { es } from "./locales/es";
import { pt } from "./locales/pt";
import { fr } from "./locales/fr";
import { it } from "./locales/it";
import { ar } from "./locales/ar";
import { id } from "./locales/id";
import { vi } from "./locales/vi";
import { tr } from "./locales/tr";
import { zh } from "./locales/zh";
import { de } from "./locales/de";

export interface ArchitectureNodeContent {
  id: string;
  name: string;
  phase: string;
  status: "IMPLEMENTED" | "DESIGN";
  summary: string;
  technicalDetails: string[];
  invariants: string[];
}

export const content = {
  en,
  ru,
  es,
  pt,
  fr,
  it,
  ar,
  id,
  vi,
  tr,
  zh,
  de,
};
