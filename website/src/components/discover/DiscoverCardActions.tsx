"use client";

import Link from "next/link";
import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { discoverCopy } from "@/lib/discover-content";

type Props = {
  projectId: string;
  productUrl: string | null;
  tokenLink: string;
  compact?: boolean;
  initialVote?: string | null;
  initialFollowing?: boolean;
  onUpdated?: () => void;
};

export function DiscoverCardActions({
  projectId,
  productUrl,
  tokenLink,
  compact,
  initialVote = null,
  initialFollowing = false,
  onUpdated,
}: Props) {
  const { lang } = useLanguage();
  const t = discoverCopy[lang];
  const [vote, setVote] = useState<string | null>(initialVote);
  const [following, setFollowing] = useState(initialFollowing);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429) {
        setError(t.errors.rateLimited);
        return false;
      }
      if (!res.ok) {
        setError(t.errors.generic);
        return false;
      }
      onUpdated?.();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function onVote(next: "interesting" | "unclear" | "not_interesting") {
    const ok = await post(`/api/discover/projects/${projectId}/react`, { vote: next });
    if (ok) setVote(next);
  }

  async function onFollow() {
    const ok = await post(`/api/discover/projects/${projectId}/follow`);
    if (ok) setFollowing(true);
  }

  async function onQuestion() {
    const ok = await post(`/api/discover/projects/${projectId}/question`, { text: question });
    if (ok) {
      setQuestion("");
      setQuestionOpen(false);
    }
  }

  async function onProduct() {
    if (!productUrl) return;
    void post(`/api/discover/projects/${projectId}/product-click`);
    const target =
      productUrl.startsWith("/") && typeof window !== "undefined"
        ? `${window.location.origin}${productUrl}`
        : productUrl;
    if (productUrl.startsWith("/")) {
      window.location.assign(productUrl);
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  }

  const voteBtn =
    "rounded-lg border border-line px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";

  return (
    <div className={compact ? "mt-4" : "mt-6"}>
      {error ? <p className="mb-2 text-sm text-warm">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {(["interesting", "unclear", "not_interesting"] as const).map((key) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => void onVote(key)}
            className={`${voteBtn} ${vote === key ? "border-brand bg-surface-2 text-brand" : "text-ink-2 hover:border-line-strong"}`}
          >
            {t.votes[key]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setQuestionOpen((v) => !v)}
          className={`${voteBtn} text-ink-2`}
        >
          {t.askQuestion}
        </button>
        <button
          type="button"
          disabled={busy || following}
          onClick={() => void onFollow()}
          className={`${voteBtn} text-ink-2`}
        >
          {following ? t.following : t.follow}
        </button>
        {productUrl ? (
          <button type="button" disabled={busy} onClick={() => void onProduct()} className={`${voteBtn} text-brand`}>
            {t.tryProduct}
          </button>
        ) : null}
        <Link href={tokenLink} className={`${voteBtn} inline-flex items-center text-ink-2`}>
          {t.tokenLink}
        </Link>
      </div>
      {questionOpen ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t.questionPlaceholder}
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || question.trim().length < 3}
            onClick={() => void onQuestion()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
          >
            {t.sendQuestion}
          </button>
        </div>
      ) : null}
    </div>
  );
}
