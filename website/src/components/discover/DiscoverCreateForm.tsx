"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { discoverCopy } from "@/lib/discover-content";
import {
  DISCOVER_VIDEO_MAX_SECONDS,
  DISCOVER_VIDEO_MIN_SECONDS,
  readVideoDurationSeconds,
} from "@/lib/discover/video";

type TokenOption = { assetId: string; name: string; symbol: string; imageUri?: string | null };

export function DiscoverCreateForm() {
  const { lang } = useLanguage();
  const t = discoverCopy[lang];
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenOption[]>([]);
  const [title, setTitle] = useState("");
  const [videoUri, setVideoUri] = useState("");
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [videoOpen, setVideoOpen] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [idea, setIdea] = useState("");
  const [audience, setAudience] = useState("");
  const [whyToken, setWhyToken] = useState("");
  const [tokenAssetId, setTokenAssetId] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/discover/tokens")
      .then((r) => r.json())
      .then((d: { tokens?: TokenOption[] }) => {
        setTokens(d.tokens ?? []);
        if (d.tokens?.[0]) setTokenAssetId(d.tokens[0].assetId);
      });
  }, []);

  async function validateVideoDuration(file: File): Promise<boolean> {
    const duration = await readVideoDurationSeconds(file);
    if (duration < DISCOVER_VIDEO_MIN_SECONDS - 0.5) {
      setError(t.form.durationTooShort);
      return false;
    }
    if (duration > DISCOVER_VIDEO_MAX_SECONDS + 0.5) {
      setError(t.form.durationError);
      return false;
    }
    return true;
  }

  async function onVideoFile(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      if (!(await validateVideoDuration(file))) return;
      setBusy(true);
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/discover/media", { method: "POST", body: form });
      const data = (await res.json()) as { uri?: string };
      if (data.uri) {
        setVideoUri(data.uri);
        setVideoOpen(true);
        return;
      }
      setError(t.form.uploadError);
    } catch {
      setError(t.form.uploadError);
    } finally {
      setBusy(false);
    }
  }

  async function onScreenshot(file: File | null) {
    if (!file || screenshots.length >= 8) return;
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/discover/screenshots", { method: "POST", body: form });
      const data = (await res.json()) as { uri?: string };
      if (data.uri) {
        setScreenshots((prev) => [...prev, data.uri!]);
        return;
      }
      setError(t.form.screenshotError);
    } catch {
      setError(t.form.screenshotError);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const uri = videoUri.trim() || videoUrlInput.trim() || null;
    const tokenLink = tokenAssetId ? `/swap` : "/explorer/tokens";
    setBusy(true);
    try {
      const res = await fetch("/api/discover/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          videoUri: uri,
          screenshotUris: screenshots,
          idea,
          audience,
          whyToken,
          tokenAssetId,
          tokenLink,
          productUrl: productUrl.trim() || null,
        }),
      });
      const data = (await res.json()) as { project?: { id: string } };
      if (!res.ok || !data.project?.id) {
        setError(t.errors.generic);
        return;
      }
      router.push(`/discover/${data.project.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mx-auto max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <h1 className="text-h2 font-bold text-ink">{t.form.title}</h1>
      <p className="text-sm text-ink-2">{t.form.lead}</p>
      {error ? <p className="text-sm text-warm">{error}</p> : null}
      <label className="block text-sm font-medium text-ink">
        {t.form.name}
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2"
        />
      </label>
      {(
        [
          [t.form.idea, idea, setIdea],
          [t.form.audience, audience, setAudience],
          [t.form.whyToken, whyToken, setWhyToken],
        ] as const
      ).map(([label, val, set]) => (
        <label key={label} className="block text-sm font-medium text-ink">
          {label}
          <textarea
            required
            rows={3}
            value={val}
            onChange={(e) => set(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2"
          />
        </label>
      ))}
      <label className="block text-sm font-medium text-ink">
        {t.form.token}
        <select
          required
          value={tokenAssetId}
          onChange={(e) => setTokenAssetId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2"
        >
          {tokens.map((tok) => (
            <option key={tok.assetId} value={tok.assetId}>
              {tok.name} ({tok.symbol})
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="text-sm font-medium text-ink">{t.form.screenshots}</p>
        <p className="mt-1 text-xs text-ink-3">{t.form.screenshotsHint}</p>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy || screenshots.length >= 8}
          onChange={(e) => void onScreenshot(e.target.files?.[0] ?? null)}
          className="mt-2 block w-full text-sm"
        />
        {screenshots.length > 0 ? (
          <p className="mt-2 text-xs text-ink-3">{screenshots.length} / 8</p>
        ) : null}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <button
          type="button"
          onClick={() => setVideoOpen((v) => !v)}
          className="text-sm font-semibold text-brand"
        >
          {t.form.addVideoOptional}
        </button>
        {videoOpen ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium text-ink-2">{t.form.videoTemplateTitle}</p>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-3">
              <li>{t.form.videoQ1}</li>
              <li>{t.form.videoQ2}</li>
              <li>{t.form.videoQ3}</li>
            </ol>
            <p className="text-xs text-ink-3">{t.form.videoHint}</p>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              disabled={busy}
              onChange={(e) => void onVideoFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {videoUri ? <p className="text-xs text-brand">{videoUri}</p> : null}
            <label className="block text-sm text-ink-2">
              {t.form.videoUrl}
              <input
                value={videoUrlInput}
                onChange={(e) => setVideoUrlInput(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2"
              />
            </label>
          </div>
        ) : null}
      </div>
      <label className="block text-sm font-medium text-ink">
        {t.form.productUrl}
        <input
          value={productUrl}
          onChange={(e) => setProductUrl(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-brand-ink disabled:opacity-50"
      >
        {t.form.submit}
      </button>
      <Link href="/discover" className="block text-center text-sm text-ink-3 underline-offset-2 hover:underline">
        {t.detail.back}
      </Link>
    </form>
  );
}
