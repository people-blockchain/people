"use client";

import { useLanguage } from "@/context/LanguageContext";
import { agentsPublic } from "@/lib/agents-public-content";
import { Eyebrow } from "@/components/ui/primitives";
import { AgentsWorkflowAnimation } from "./AgentsWorkflowAnimation";
import { CommunityAgentLive } from "./CommunityAgentLive";

export function AgentsPublic() {
  const { lang } = useLanguage();
  const t = agentsPublic[lang];
  const { how, limits, security, comingNext } = t.sections;

  return (
    <div className="relative isolate mx-auto max-w-3xl overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-[radial-gradient(45%_70%_at_85%_0%,rgba(245,158,11,0.14),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(45%_70%_at_85%_0%,rgba(251,191,36,0.12),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(76,196,248,0.12),transparent_70%)]"
        aria-hidden="true"
      />
      <Eyebrow tone="brand">PEOPLE Blockchain</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.hero.title}</h1>
      <p className="mt-4 text-lg font-medium leading-relaxed text-ink-2">{t.hero.lead}</p>

      <CommunityAgentLive copy={t.liveAgent} lang={lang} />

      <section className="mt-12">
        <h2 className="text-h3 font-bold text-ink">{how.title}</h2>
        <p className="mt-4 text-sm leading-relaxed text-ink-2">{how.body}</p>
        <AgentsWorkflowAnimation copy={t.workflow} />
      </section>

      <section className="mt-12" id="limits">
        <h2 className="text-h3 font-bold text-ink">{limits.title}</h2>
        <ul className="mt-4 space-y-4">
          {limits.items.map((item) => (
            <li key={item.title} className="surface-elevated rounded-3xl border border-line p-4">
              <p className="font-semibold text-ink">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" id="security">
        <h2 className="text-h3 font-bold text-ink">{security.title}</h2>
        <ul className="mt-4 space-y-4">
          {security.items.map((item) => (
            <li key={item.title} className="surface-elevated rounded-3xl border border-line p-4">
              <p className="font-semibold text-ink">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {comingNext ? (
        <section className="mt-12" id="coming-next" data-testid="agents-coming-next">
          <h2 className="text-h3 font-bold text-ink">{comingNext.title}</h2>
          {comingNext.lead ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-2">{comingNext.lead}</p>
          ) : null}
          <ul className="mt-4 space-y-4">
            {comingNext.items.map((item) => (
              <li key={item.title} className="surface-elevated rounded-3xl border border-line p-4">
                <p className="font-semibold text-ink">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
