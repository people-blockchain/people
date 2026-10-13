"use client";

import { NodeQuickStart } from "./NodeQuickStart";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Search, Server, Wallet, Sparkles } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { docsContent, searchSections } from "@/lib/docs-content";

const icons = [Wallet, Sparkles, Server];
export function Documentation() {
  const { lang } = useLanguage();
  const t = docsContent[lang] ?? docsContent.en;
  const [query, setQuery] = useState("");
  const sections = searchSections(t.sections, query);
  function navigate() { setQuery(""); }
  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
      <header className="border-b border-line py-14 md:py-20">
        <p className="flex items-center gap-2 font-mono text-xs tracking-widest text-brand"><BookOpen size={16} aria-hidden="true" />{t.eyebrow}</p>
        <div className="mt-7 grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <h1 className="whitespace-pre-line text-5xl font-semibold leading-[1.06] tracking-tight sm:text-6xl lg:text-7xl">{t.title}</h1>
          <div><p className="max-w-lg text-xl leading-relaxed text-ink-2">{t.description}</p>
            <div className="mt-7 rounded-2xl border border-line bg-surface p-5"><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-warm" />{t.notice}</p><p className="text-sm leading-relaxed text-ink-2">{t.noticeText}</p></div>
          </div>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-3">{t.cards.map((card, i) => { const Icon = icons[i]; return <a onClick={navigate} key={card.href} href={card.href} className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"><div className="mb-5 flex items-center justify-between text-brand"><Icon size={22} aria-hidden="true"/><ArrowRight size={18} aria-hidden="true" className="transition-transform group-hover:translate-x-1"/></div><h2 className="text-lg font-semibold">{card.title}</h2><p className="mt-1 text-sm text-ink-2">{card.text}</p></a>; })}</div>
      </header>
      <div className="grid gap-10 pt-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <aside><div className="lg:sticky lg:top-24"><label htmlFor="docs-search" className="mb-3 block text-sm font-medium">{t.search}</label><div className="relative"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-ink-3"/><input id="docs-search" type="search" value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-xl border border-line bg-surface py-3 pl-10 pr-3 text-sm outline-none focus:border-brand" /></div>
          {query && <button onClick={navigate} className="mt-3 text-sm text-brand underline underline-offset-4">{t.clear}</button>}
          <nav aria-label={t.contents} className="mt-7"><p className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">{t.contents}</p><ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">{t.sections.map((section, i) => <li key={section.id}><a href={`#${section.id}`} onClick={navigate} className="flex gap-3 rounded-lg px-2 py-2 text-sm text-ink-2 hover:bg-surface hover:text-ink"><span className="font-mono text-xs text-ink-3">{String(i+1).padStart(2,"0")}</span>{section.title}</a></li>)}</ol></nav>
        </div></aside>
        <div className="min-w-0"><p role="status" className={query ? "mb-6 text-sm text-ink-2" : "sr-only"}>{query ? `${t.results}: ${sections.length}` : ""}</p>
          {sections.length === 0 && <div className="rounded-2xl border border-line bg-surface p-8"><p>{t.empty}</p><button onClick={navigate} className="mt-4 text-brand underline">{t.clear}</button></div>}
          {sections.map(section => <section key={section.id} id={section.id} className="mb-14 scroll-mt-24 border-b border-line pb-12 last:mb-0 last:border-0"><p className="mb-3 font-mono text-xs tracking-wider text-brand">{String(t.sections.findIndex(s => s.id === section.id)+1).padStart(2,"0")} / PEOPLE</p><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{section.title}</h2><p className="mt-4 text-lg leading-relaxed text-ink-2">{section.lead}</p>
            {section.id === "node" && <NodeQuickStart />}
            <div className="mt-7 space-y-6">{section.items.map(item => section.id === "help" ? <details key={item.title} className="rounded-xl border border-line bg-surface p-5"><summary className="cursor-pointer font-medium">{item.title}</summary><p className="mt-3 break-words leading-relaxed text-ink-2">{item.text}</p></details> : <div key={item.title}><h3 className="font-semibold">{item.title}</h3><p className="mt-2 max-w-prose break-words leading-relaxed text-ink-2">{item.text}</p></div>)}</div>
            {section.code && <pre tabIndex={0} aria-label={section.title} className="mt-7 overflow-x-auto rounded-xl border border-line bg-surface p-5 text-xs leading-7 sm:text-sm"><code>{section.code}</code></pre>}
            {section.links.length > 0 && <div className="mt-7 flex flex-wrap gap-3">{section.links.map(link => <Link onClick={link.href.startsWith("#") ? navigate : undefined} key={link.href} href={link.href} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-brand hover:border-brand">{link.label}<ArrowRight size={14} aria-hidden="true"/></Link>)}</div>}
          </section>)}
        </div>
      </div>
    </div>
  );
}
