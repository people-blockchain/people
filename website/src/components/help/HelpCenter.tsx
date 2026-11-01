"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, LifeBuoy, Search } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { helpLang, helpUi, resolveHelpFaq, searchHelpFaq } from "@/lib/help/faq";

export function HelpCenter() {
  const { lang } = useLanguage();
  const t = helpUi[helpLang(lang)];
  const all = useMemo(() => resolveHelpFaq(lang), [lang]);
  const [query, setQuery] = useState("");
  const topics = searchHelpFaq(all, query);

  return (
    <div className="mx-auto max-w-4xl px-5 pb-24 sm:px-8" data-testid="help-center">
      <header className="border-b border-line py-14 md:py-20">
        <p className="flex items-center gap-2 font-mono text-xs tracking-widest text-brand">
          <LifeBuoy size={16} aria-hidden="true" />
          {t.eyebrow}
        </p>
        <h1 className="mt-7 text-5xl font-semibold leading-[1.06] tracking-tight sm:text-6xl">{t.title}</h1>
        <p className="mt-6 max-w-2xl text-xl leading-relaxed text-ink-2">{t.lead}</p>
        <label htmlFor="help-search" className="mb-3 mt-10 block text-sm font-medium">{t.search}</label>
        <div className="relative max-w-md">
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-ink-3" />
          <input
            id="help-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-line bg-surface py-3 pl-10 pr-3 text-sm outline-none focus:border-brand"
          />
        </div>
      </header>

      <div className="pt-10">
        {topics.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8" role="status">{t.empty}</div>
        ) : null}
        {topics.map((topic) => (
          <section key={topic.id} id={topic.id} className="mb-12 scroll-mt-24" data-testid={`help-topic-${topic.id}`}>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{topic.title}</h2>
            <div className="mt-5 space-y-3">
              {topic.entries.map((entry) => (
                <details
                  key={entry.id}
                  id={entry.id}
                  className="group rounded-2xl border border-line bg-surface p-4 open:shadow-[var(--elev-1)]"
                  data-testid={`help-entry-${entry.id}`}
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink marker:hidden">
                    <span>{entry.q}</span>
                    <span aria-hidden="true" className="shrink-0 text-ink-3 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2.5 break-words text-sm leading-relaxed text-ink-2">{entry.a}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                    {entry.links.length > 0 ? (
                      <span>
                        {t.source}:{" "}
                        {entry.links.map((href, i) => (
                          <span key={href}>
                            {i > 0 ? ", " : null}
                            <Link prefetch={false} href={href} className="font-medium text-brand hover:underline">{href}</Link>
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span>{t.verified}: <time dateTime={entry.verifiedAt}>{entry.verifiedAt}</time></span>
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
        <Link prefetch={false} href="/docs" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-brand hover:border-brand">
          {t.more}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
