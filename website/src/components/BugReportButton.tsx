"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, Camera, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@/context/WalletContext";
import { fetchAuthSessionUser } from "@/lib/wallet-cloud-client";
import { bugReportCopy } from "@/lib/bug-reports/copy";
import { MAX_DESCRIPTION_LEN } from "@/lib/bug-reports/constants";
import { WalletDialog } from "@/components/wallet/WalletDialog";

const SCREENSHOT_QUALITY = 0.6;
const SCREENSHOT_MAX_WIDTH = 1080;
const HIDDEN_ON_PREFIXES = ["/login", "/admin"];

async function captureScreenshot(): Promise<string | null> {
  const html2canvas = (await import("html2canvas-pro")).default;
  const fab = document.getElementById("bug-report-fab");
  const prevVisibility = fab?.style.visibility;
  if (fab) fab.style.visibility = "hidden";
  try {
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      scale: Math.min(1, SCREENSHOT_MAX_WIDTH / document.body.scrollWidth),
      logging: false,
      backgroundColor: null,
    });
    return canvas.toDataURL("image/jpeg", SCREENSHOT_QUALITY);
  } finally {
    if (fab) fab.style.visibility = prevVisibility || "visible";
  }
}

export function BugReportButton() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const { theme } = useTheme();
  const { session: walletSession } = useWallet();
  const t = bugReportCopy[lang];

  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchAuthSessionUser()
      .then((user) => {
        if (mounted.current) setSignedIn(Boolean(user));
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!signedIn || HIDDEN_ON_PREFIXES.some((p) => pathname?.startsWith(p))) {
    return null;
  }

  async function handleCapture() {
    setShooting(true);
    setError(null);
    try {
      setScreenshot(await captureScreenshot());
    } catch {
      setError(t.errorScreenshot);
    } finally {
      setShooting(false);
    }
  }

  async function handleSubmit() {
    const desc = description.trim();
    if (!desc) {
      setError(t.errorRequired);
      return;
    }
    if (desc.length > MAX_DESCRIPTION_LEN) {
      setError(t.errorTooLong);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bugs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: desc,
          screenshot,
          context: {
            url: window.location.href,
            route: pathname,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            userAgent: navigator.userAgent,
            theme,
            locale: lang,
            appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
            walletAddress: walletSession?.address,
          },
        }),
      });
      if (res.status === 429) {
        setError(t.errorRateLimited);
        return;
      }
      if (!res.ok) {
        setError(t.errorSubmit);
        return;
      }
      setDone(true);
      setDescription("");
      setScreenshot(null);
    } catch {
      setError(t.errorSubmit);
    } finally {
      setSubmitting(false);
    }
  }

  function closeDialog() {
    setOpen(false);
    setError(null);
    setDone(false);
  }

  return (
    <>
      <button
        id="bug-report-fab"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        title={t.fabLabel}
        className="fixed z-40 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-[var(--elev-1)] transition-colors hover:border-brand hover:text-brand"
        style={{
          bottom: "max(1rem, env(safe-area-inset-bottom))",
          right: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <Bug className="h-5 w-5" aria-hidden="true" />
      </button>

      {open ? (
        <WalletDialog title={t.dialogTitle} closeLabel={t.close} onClose={closeDialog} busy={submitting}>
          {done ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-2">{t.thanks}</p>
              <button
                type="button"
                onClick={closeDialog}
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink transition hover:brightness-110"
              >
                {t.close}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="bug-report-description" className="mb-1 block text-sm font-medium text-ink">
                  {t.descriptionLabel}
                </label>
                <textarea
                  id="bug-report-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LEN))}
                  placeholder={t.descriptionPlaceholder}
                  rows={5}
                  maxLength={MAX_DESCRIPTION_LEN}
                  className="w-full rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm text-ink"
                />
                <p className="mt-1 text-right text-xs text-ink-3">
                  {description.length}/{MAX_DESCRIPTION_LEN}
                </p>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-ink">{t.screenshotLabel}</p>
                {screenshot ? (
                  // eslint-disable-next-line @next/next/no-img-element -- client-captured data URL, not an optimizable asset
                  <img
                    src={screenshot}
                    alt=""
                    className="mb-2 max-h-40 w-full rounded-lg border border-line object-contain"
                  />
                ) : null}
                <button
                  type="button"
                  disabled={shooting}
                  onClick={() => void handleCapture()}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  {shooting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="h-4 w-4" aria-hidden="true" />
                  )}
                  {shooting ? t.capturing : screenshot ? t.retakeScreenshot : t.captureScreenshot}
                </button>
              </div>

              {error ? <p className="text-sm text-warm">{error}</p> : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={submitting}
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink transition hover:brightness-110 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {submitting ? t.submitting : t.submit}
                </button>
              </div>
            </div>
          )}
        </WalletDialog>
      ) : null}
    </>
  );
}
