"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { discoverCopy } from "@/lib/discover-content";
import { discoverSeedSummary, presentDiscoverProject } from "@/lib/discover/seed-present";
import type { DiscoverFeedProjectPayload, DiscoverFeedViewer } from "@/lib/discover/feed-server";
import { Eyebrow } from "@/components/ui/primitives";
import { DiscoverCardActions } from "@/components/discover/DiscoverCardActions";
import { DiscoverProjectCardPresentation } from "@/components/discover/DiscoverProjectCardPresentation";
import { DiscoverFeedSkeleton } from "@/components/discover/DiscoverFeedSkeleton";
import { OpenSignInModalButton } from "@/components/wallet/OpenSignInModalButton";

export type FeedProject = DiscoverFeedProjectPayload;

type Props = {
  initialProjects: FeedProject[];
  initialViewer: DiscoverFeedViewer;
};

export function DiscoverFeed({ initialProjects, initialViewer }: Props) {
  const { lang } = useLanguage();
  const t = discoverCopy[lang];
  const [projects, setProjects] = useState<FeedProject[]>(initialProjects);
  const [viewer, setViewer] = useState<DiscoverFeedViewer>(initialViewer);
  const [loading, setLoading] = useState(initialProjects.length === 0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/discover/feed");
      const data = (await res.json()) as {
        projects?: FeedProject[];
        viewer?: DiscoverFeedViewer;
      };
      if (data.projects?.length) setProjects(data.projects);
      if (data.viewer) setViewer(data.viewer);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="relative mx-auto max-w-3xl overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(45%_70%_at_85%_0%,rgba(245,158,11,0.14),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(45%_70%_at_85%_0%,rgba(251,191,36,0.12),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(76,196,248,0.12),transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative">
      <Eyebrow>{t.navLabel.toUpperCase()}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.title}</h1>
      <p className="mt-2 text-lead text-brand">{t.tagline}</p>
      <p className="mt-3 max-w-2xl text-sm text-ink-2">{t.lead}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/discover/new"
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t.createCta}
        </Link>
      </div>

      {!viewer.verified && (
        <p className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
          {!viewer.signedIn ? (
            <>
              {t.signInHint}{" "}
              <OpenSignInModalButton className="font-semibold text-brand underline-offset-2 hover:underline">
                {t.loginLink}
              </OpenSignInModalButton>
            </>
          ) : (
            <>
              {t.walletHint}{" "}
              <Link href="/partner" className="font-semibold text-brand underline-offset-2 hover:underline">
                {t.walletLink}
              </Link>
            </>
          )}
        </p>
      )}
      </div>

      <ul className="relative mt-10 flex flex-col gap-8">
        {loading && projects.length === 0 ? (
          <DiscoverFeedSkeleton />
        ) : projects.length === 0 ? (
          <li className="text-sm text-ink-2">{t.empty}</li>
        ) : (
          projects.map((raw) => {
            const project = presentDiscoverProject(lang, { ...raw, tags: [] });
            return (
            <li key={project.id} className="surface-elevated overflow-hidden rounded-3xl p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="mono-label text-ink-3">
                  {t.stageLabel}: {(project.stageIndex ?? 0) >= 3 ? t.stageAll : (project.stageIndex ?? 0) + 1}
                </span>
              </div>
              <DiscoverProjectCardPresentation
                title={project.title}
                summary={discoverSeedSummary(lang, project.id)}
                idea={project.idea}
                audience={project.audience}
                whyToken={project.whyToken}
                tags={project.tags}
                tokenAssetId={project.tokenAssetId}
                tokenIconUri={project.tokenIconUri}
                videoUri={project.videoUri}
                screenshotUrisJson={project.screenshotUris}
                compact
              />
              <DiscoverCardActions projectId={project.id} productUrl={project.productUrl} tokenLink={project.tokenLink} compact />
              <Link
                href={`/discover/${project.id}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand"
              >
                {t.readMore}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
