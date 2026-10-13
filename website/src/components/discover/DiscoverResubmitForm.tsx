"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { discoverCopy } from "@/lib/discover-content";

type Props = {
  projectId: string;
  initial: {
    title: string;
    videoUri: string | null;
    screenshotUris: string[];
    idea: string;
    audience: string;
    whyToken: string;
    tokenAssetId: string;
    tokenLink: string;
    tokenIconUri: string | null;
    productUrl: string | null;
  };
  onDone: () => void;
  onCancel: () => void;
};

export function DiscoverResubmitForm({ projectId, initial, onDone, onCancel }: Props) {
  const { lang } = useLanguage();
  const t = discoverCopy[lang];
  const [title, setTitle] = useState(initial.title);
  const [videoUri, setVideoUri] = useState(initial.videoUri ?? "");
  const [screenshots, setScreenshots] = useState(initial.screenshotUris);
  const [idea, setIdea] = useState(initial.idea);
  const [audience, setAudience] = useState(initial.audience);
  const [whyToken, setWhyToken] = useState(initial.whyToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/discover/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          videoUri: videoUri.trim() || null,
          screenshotUris: screenshots,
          tokenIconUri: initial.tokenIconUri,
          idea,
          audience,
          whyToken,
          tokenAssetId: initial.tokenAssetId,
          tokenLink: initial.tokenLink,
          productUrl: initial.productUrl,
        }),
      });
      if (!res.ok) {
        setError(t.errors.generic);
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function onScreenshot(file: File | null) {
    if (!file || screenshots.length >= 8) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/discover/screenshots", { method: "POST", body: form });
    const data = (await res.json()) as { uri?: string };
    if (data.uri) setScreenshots((prev) => [...prev, data.uri!]);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-8">
      <h2 className="text-lg font-semibold text-ink">{t.resubmit}</h2>
      {error ? <p className="text-sm text-warm">{error}</p> : null}
      <label className="block text-sm">
        {t.form.name}
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
      </label>
      {(
        [
          [t.form.idea, idea, setIdea],
          [t.form.audience, audience, setAudience],
          [t.form.whyToken, whyToken, setWhyToken],
        ] as const
      ).map(([label, val, set]) => (
        <label key={label} className="block text-sm">
          {label}
          <textarea value={val} onChange={(e) => set(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
        </label>
      ))}
      <div>
        <p className="text-sm font-medium">{t.form.screenshots}</p>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => void onScreenshot(e.target.files?.[0] ?? null)}
          className="mt-2 block w-full text-sm"
        />
        <p className="mt-1 text-xs text-ink-3">{screenshots.length} / 8</p>
      </div>
      <label className="block text-sm">
        {t.form.videoUrl}
        <input value={videoUri} onChange={(e) => setVideoUri(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
          {t.form.submit}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm">
          {t.detail.back}
        </button>
      </div>
    </div>
  );
}
