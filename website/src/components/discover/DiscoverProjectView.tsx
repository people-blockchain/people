"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { discoverCopy } from "@/lib/discover-content";
import { discoverSeedSummary, presentDiscoverProject } from "@/lib/discover/seed-present";
import { parseScreenshotUris } from "@/lib/discover/screenshots";
import { DiscoverCardActions } from "@/components/discover/DiscoverCardActions";
import { DiscoverProjectCardPresentation } from "@/components/discover/DiscoverProjectCardPresentation";
import { DiscoverResubmitForm } from "@/components/discover/DiscoverResubmitForm";
import type { DiscoverProjectDetailPayload } from "@/lib/discover/feed-server";
import { DiscoverProjectDetailSkeleton } from "@/components/discover/DiscoverFeedSkeleton";
import { TokenMarketPanel } from "@/components/market/TokenMarketPanel";
import { resolveMarketTokenAddress } from "@/lib/evm/market-token";

type ProjectDetail = DiscoverProjectDetailPayload;

type Props = {
  id: string;
  initialDetail: ProjectDetail | null;
};

export function DiscoverProjectView({ id, initialDetail }: Props) {
  const { lang } = useLanguage();
  const t = discoverCopy[lang];
  const [data, setData] = useState<ProjectDetail | null>(initialDetail);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(!initialDetail);
  const [loadError, setLoadError] = useState<"not_found" | "generic" | null>(null);

  const load = () => {
    if (!data) setLoading(true);
    setLoadError(null);
    return fetch(`/api/discover/projects/${id}`)
      .then(async (r) => {
        const body = (await r.json()) as ProjectDetail & { error?: string };
        if (!r.ok || !body.project) {
          setData(null);
          setLoadError(r.status === 404 ? "not_found" : "generic");
          return;
        }
        setData(body);
      })
      .catch(() => {
        setData(null);
        setLoadError("generic");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when project id changes only
  }, [id]);

  if (loading && !data) {
    return <DiscoverProjectDetailSkeleton />;
  }

  if (!data?.project) {
    return (
      <p className="px-4 py-16 text-sm text-ink-2">
        {loadError === "not_found" ? t.errors.notFound : t.errors.generic}
      </p>
    );
  }

  const { tallies, myVote, following, authorFeedback } = data;
  const project = presentDiscoverProject(lang, { ...data.project, tags: [], isSeed: data.project.id.startsWith("discover-seed-v1-") });
  const marketTokenAddress = project.tokenAssetId ? resolveMarketTokenAddress(project.tokenAssetId) : null;

  if (editMode) {
    return (
      <DiscoverResubmitForm
        projectId={project.id}
        initial={{
          title: project.title,
          videoUri: project.videoUri,
          screenshotUris: parseScreenshotUris(project.screenshotUris),
          idea: project.idea,
          audience: project.audience,
          whyToken: project.whyToken,
          tokenAssetId: project.tokenAssetId,
          tokenLink: project.tokenLink,
          tokenIconUri: project.tokenIconUri ?? null,
          productUrl: project.productUrl,
        }}
        onCancel={() => setEditMode(false)}
        onDone={() => {
          setEditMode(false);
          void load();
        }}
      />
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/discover" className="text-sm font-medium text-brand">
        {t.detail.back}
      </Link>
      {project.status === "needs_work" && authorFeedback ? (
        <p className="mt-4 rounded-xl border border-warm/40 bg-surface px-4 py-3 text-sm text-ink-2">{t.needsWork}</p>
      ) : null}
      <div className="mt-6">
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
        />
      </div>
      {marketTokenAddress ? <TokenMarketPanel tokenAddress={marketTokenAddress} className="mt-6" /> : null}
      <DiscoverCardActions
        projectId={project.id}
        productUrl={project.productUrl}
        tokenLink={project.tokenLink}
        initialVote={myVote}
        initialFollowing={following}
        onUpdated={() => void load()}
      />
      {authorFeedback ? (
        <section className="mt-10 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">{t.detail.feedback}</h2>
          <ul className="mt-3 flex flex-wrap gap-4 text-sm text-ink-2">
            <li>
              {t.votes.interesting}: {authorFeedback.tallies.interesting}
            </li>
            <li>
              {t.votes.unclear}: {authorFeedback.tallies.unclear}
            </li>
            <li>
              {t.votes.not_interesting}: {authorFeedback.tallies.not_interesting}
            </li>
          </ul>
          {authorFeedback.questions.length > 0 ? (
            <>
              <h3 className="mt-4 text-sm font-semibold text-ink">{t.detail.questions}</h3>
              <ul className="mt-2 space-y-2 text-sm text-ink-2">
                {authorFeedback.questions.map((q) => (
                  <li key={q.id} className="rounded-lg border border-line px-3 py-2">
                    {q.body}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {project.status === "needs_work" ? (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
            >
              {t.resubmit}
            </button>
          ) : null}
        </section>
      ) : (
        <p className="mt-6 text-xs text-ink-3">
          {t.votes.interesting}: {tallies.interesting} · {t.votes.unclear}: {tallies.unclear} ·{" "}
          {t.votes.not_interesting}: {tallies.not_interesting}
        </p>
      )}
    </article>
  );
}
