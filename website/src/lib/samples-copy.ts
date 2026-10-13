import type { Language } from "@/lib/preferences";
import samplesEn from "./locales/surfaces/samples-en.json" with { type: "json" };
import samplesRu from "./locales/surfaces/samples-ru.json" with { type: "json" };
import samplesAr from "./locales/surfaces/samples-ar.json" with { type: "json" };
import samplesDe from "./locales/surfaces/samples-de.json" with { type: "json" };
import samplesEs from "./locales/surfaces/samples-es.json" with { type: "json" };
import samplesFr from "./locales/surfaces/samples-fr.json" with { type: "json" };
import samplesId from "./locales/surfaces/samples-id.json" with { type: "json" };
import samplesIt from "./locales/surfaces/samples-it.json" with { type: "json" };
import samplesPt from "./locales/surfaces/samples-pt.json" with { type: "json" };
import samplesTr from "./locales/surfaces/samples-tr.json" with { type: "json" };
import samplesVi from "./locales/surfaces/samples-vi.json" with { type: "json" };
import samplesZh from "./locales/surfaces/samples-zh.json" with { type: "json" };

export type SamplesCopyContent = {
  title: string;
  lead: string;
  notDeployed: string;
  testnetAddress: string;
  viewSource: string;
  hideSource: string;
  copy: string;
  copied: string;
  deployCta: string;
  connectFirst: string;
  constructorArgs: string;
  deployButton: string;
  deploying: string;
  cancel: string;
  success: string;
  contractAddress: string;
  transaction: string;
  error: string;
  invalidAddress: string;
  invalidNumber: string;
  invalidText: string;
  faucetCta: string;
  faucetMinting: string;
  faucetDone: string;
  faucetBalance: string;
  faucetLimitHint: string;
  faucetCooldown: string;
  approveDepositLead: string;
  approveAndDeposit: string;
  approving: string;
  depositing: string;
  depositComplete: string;
  templates: Record<string, { title: string; description: string }>;
  fields: Record<string, string>;
};

const baseSamplesCopy: Record<string, SamplesCopyContent> = {
  en: samplesEn as SamplesCopyContent,
  ru: samplesRu as SamplesCopyContent,
  es: samplesEs as SamplesCopyContent,
  pt: samplesPt as SamplesCopyContent,
  fr: samplesFr as SamplesCopyContent,
  de: samplesDe as SamplesCopyContent,
  it: samplesIt as SamplesCopyContent,
  tr: samplesTr as SamplesCopyContent,
  vi: samplesVi as SamplesCopyContent,
  id: samplesId as SamplesCopyContent,
  zh: samplesZh as SamplesCopyContent,
  ar: samplesAr as SamplesCopyContent,
};

export const samplesCopy: Record<Language, SamplesCopyContent> = new Proxy(
  baseSamplesCopy as unknown as Record<Language, SamplesCopyContent>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
