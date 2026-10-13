"use client";

import { useLanguage } from "@/context/LanguageContext";
import { roadmapPublic } from "@/lib/roadmap-public-content";
import {
  ROADMAP_STATUS_ORDER,
  roadmapCatalog,
  type RoadmapStatus,
} from "@/lib/roadmap-catalog";
import { Eyebrow } from "@/components/ui/primitives";

function statusBadgeClass(status: RoadmapStatus): string {
  if (status === "done") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "live_on_testnet")
    return "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200";
  if (status === "in_progress") return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  if (status === "proposed_pending_vote")
    return "border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-200";
  return "border-line bg-surface-2 text-ink-2";
}

export function RoadmapPublic() {
  const { lang } = useLanguage();
  const t = roadmapPublic[lang];

  const grouped = ROADMAP_STATUS_ORDER.map((status) => ({
    status,
    title: t.sectionTitles[status],
    items: roadmapCatalog.items.filter((item) => item.status === status),
  }));

  return (
    <div className="relative isolate mx-auto max-w-3xl overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-[radial-gradient(45%_70%_at_85%_0%,rgba(245,158,11,0.14),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(45%_70%_at_85%_0%,rgba(251,191,36,0.12),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(76,196,248,0.12),transparent_70%)]"
        aria-hidden="true"
      />
      <Eyebrow tone="brand">People&apos;s Blockchain</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.meta.title}</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">{t.intro}</p>
      <p className="mt-2 text-xs text-ink-3">
        {roadmapCatalog.updated} · v{roadmapCatalog.version}
      </p>

      {grouped.map((section) =>
        section.items.length === 0 ? null : (
          <section key={section.status} className="mt-12">
            <h2 className="text-h3 font-bold text-ink">{section.title}</h2>
            <ul className="mt-4 space-y-4">
              {section.items.map((item) => {
                const copy = t.items[item.id as keyof typeof t.items];
                return (
                  <li
                    key={item.id}
                    className="surface-elevated rounded-2xl border border-line p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="font-semibold text-ink">{copy?.title ?? item.id}</p>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                      >
                        {t.statusLabels[item.status]}
                      </span>
                    </div>
                    {copy?.summary ? (
                      <p className="mt-2 text-sm leading-relaxed text-ink-2">{copy.summary}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
