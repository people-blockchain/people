"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import QRCode from "qrcode";
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, Lock, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useWalletModal } from "@/context/WalletModalContext";
import { track } from "@/lib/analytics/client-track";
import { FOUNDING_CONVERSION_EVENTS } from "@/lib/analytics/events-catalog";
import { shouldSkipAnalyticsForPath } from "@/lib/analytics/paths";
import { pplSaleCountdown } from "@/lib/bounty-countdown";
import { detectBrowserCountryCode } from "@/lib/founders/country-detect";
import { readPersistedCountryChoice } from "@/lib/founders/country-choice";
import { getOrCreateFounderDeviceId } from "@/lib/founders/device-id";
import {
  FOUNDING_API,
  FOUNDING_MAINNET_BETA_OPEN_ISO,
  FOUNDING_OPEN_EVENT,
  FOUNDING_PENDING_CLAIM_STORAGE_KEY,
  FOUNDING_TG_CLAIM_PARAM,
  FOUNDING_TG_CLAIM_TOKEN_RE,
  openFoundingModal,
  telegramColdStartLink,
  type FoundingOpenSource,
} from "@/lib/founding/contract";
import { foundingCopy, resolveDrawerRouteKey } from "@/lib/founding/copy";
import { readStoredReferralCode } from "@/lib/referral-ref";
import { SITE_URL } from "@/lib/site";

const DRAWER_SESSION_KEY = "people_founding_drawer_shown";
const EXIT_SESSION_KEY = "people_founding_exit_shown";
const TG_PENDING_TRACKED_KEY = "people_founding_tg_pending_tracked";
const PASSPORT_TRACKED_KEY = "people_founding_passport_tracked";

type StoredPendingClaim = {
  token: string;
  storedAt: number;
  provisionalRefCode?: string;
  referralUrl?: string;
};

type FounderMeSnapshot = {
  signedIn: boolean;
  userId?: string;
  verifiedHuman: boolean;
  founder: {
    verificationLevel: number;
    walletAddress?: string;
  } | null;
};

function readPendingClaimFromStorage(): StoredPendingClaim | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FOUNDING_PENDING_CLAIM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPendingClaim;
    if (parsed && typeof parsed.token === "string" && FOUNDING_TG_CLAIM_TOKEN_RE.test(parsed.token)) {
      return parsed;
    }
  } catch {
    /* ignore storage error */
  }
  return null;
}

function writePendingClaimToStorage(claim: StoredPendingClaim | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!claim) {
      window.localStorage.removeItem(FOUNDING_PENDING_CLAIM_STORAGE_KEY);
    } else {
      window.localStorage.setItem(FOUNDING_PENDING_CLAIM_STORAGE_KEY, JSON.stringify(claim));
    }
  } catch {
    /* ignore storage error */
  }
}

function isOtherDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
}

export function FoundingCaptureLayer() {
  const pathname = usePathname() || "/";
  const { lang } = useLanguage();
  const copy = foundingCopy(lang);
  const { session: walletSession } = useWallet();
  const { openWalletModal } = useWalletModal();

  const skipCapture = shouldSkipAnalyticsForPath(pathname);

  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSource, setModalSource] = useState<FoundingOpenSource>("cta");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [progressSlot, setProgressSlot] = useState<HTMLElement | null>(null);
  const [foundersSlot, setFoundersSlot] = useState<HTMLElement | null>(null);

  const [me, setMe] = useState<FounderMeSnapshot | null>(null);
  const [pendingClaim, setPendingClaim] = useState<StoredPendingClaim | null>(null);
  const [redeemingClaim, setRedeemingClaim] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  // Email waitlist state inside the Founding 1,000 modal
  const [emailInput, setEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSubmittedBotUrl, setEmailSubmittedBotUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const redeemAttemptedTokenRef = useRef<string | null>(null);

  const storedRef = useMemo(() => (mounted ? readStoredReferralCode() : null), [mounted]);
  const tgColdLink = useMemo(() => telegramColdStartLink(lang, storedRef), [lang, storedRef]);

  const targetDate = useMemo(() => new Date(FOUNDING_MAINNET_BETA_OPEN_ISO), []);
  const countdown = useMemo(
    () => (nowMs !== null ? pplSaleCountdown(targetDate, nowMs) : null),
    [targetDate, nowMs],
  );

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch(FOUNDING_API.me, { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as FounderMeSnapshot;
      setMe(data);
    } catch {
      /* degrade gracefully when offline or logged out */
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    setPendingClaim(readPendingClaimFromStorage());
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!mounted || skipCapture) return;
    void loadMe();
  }, [mounted, skipCapture, pathname, walletSession?.userId, loadMe]);

  // Listen for custom `people:founding-open` events from any CTA / simulator / bar / drawer
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: FoundingOpenSource }>).detail;
      setModalSource(detail?.source ?? "cta");
      setDrawerOpen(false);
      setModalOpen(true);
    };
    const onFounderRefresh = () => {
      void loadMe();
    };
    window.addEventListener(FOUNDING_OPEN_EVENT, onOpen);
    window.addEventListener("people:founder-claimed", onFounderRefresh);
    return () => {
      window.removeEventListener(FOUNDING_OPEN_EVENT, onOpen);
      window.removeEventListener("people:founder-claimed", onFounderRefresh);
    };
  }, [loadMe]);

  // 1. Capture `?tg_claim=<token>` on arrival from @PeopleVerifyBot
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const rawToken = url.searchParams.get(FOUNDING_TG_CLAIM_PARAM)?.trim() ?? "";
    if (!rawToken || !FOUNDING_TG_CLAIM_TOKEN_RE.test(rawToken)) return;

    const stored: StoredPendingClaim = {
      token: rawToken,
      storedAt: Date.now(),
    };
    writePendingClaimToStorage(stored);
    setPendingClaim(stored);

    // Strip one-time token from visible address bar so it is not leaked via copy/paste
    url.searchParams.delete(FOUNDING_TG_CLAIM_PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

    try {
      const lastTracked = window.sessionStorage.getItem(TG_PENDING_TRACKED_KEY);
      if (lastTracked !== rawToken) {
        window.sessionStorage.setItem(TG_PENDING_TRACKED_KEY, rawToken);
        track(FOUNDING_CONVERSION_EVENTS.tgVerifiedPending, { path: pathname });
      }
    } catch {
      track(FOUNDING_CONVERSION_EVENTS.tgVerifiedPending, { path: pathname });
    }

    // Fetch pending referral URL (read-only inspect)
    fetch(`${FOUNDING_API.telegramClaim}?token=${encodeURIComponent(rawToken)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { ok?: boolean; provisionalRefCode?: string; referralUrl?: string } | null) => {
        if (info?.ok && info.referralUrl) {
          const enriched: StoredPendingClaim = {
            ...stored,
            provisionalRefCode: info.provisionalRefCode,
            referralUrl: info.referralUrl,
          };
          writePendingClaimToStorage(enriched);
          setPendingClaim(enriched);
        }
      })
      .catch(() => {});
  }, [mounted, pathname]);

  // 2. Automatically bind pending Telegram claim once the user connects/creates a wallet
  useEffect(() => {
    if (!mounted || !pendingClaim || redeemingClaim) return;
    const hasWalletSession = Boolean(me?.signedIn && (me?.verifiedHuman || me?.founder));
    if (!hasWalletSession) return;
    if (redeemAttemptedTokenRef.current === pendingClaim.token) return;

    redeemAttemptedTokenRef.current = pendingClaim.token;
    setRedeemingClaim(true);

    const countryCode = readPersistedCountryChoice() ?? detectBrowserCountryCode();
    const deviceId = getOrCreateFounderDeviceId();

    fetch(FOUNDING_API.telegramClaim, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: pendingClaim.token,
        countryCode,
        deviceId,
      }),
    })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (res.ok && payload?.ok) {
          writePendingClaimToStorage(null);
          setPendingClaim(null);
          track(FOUNDING_CONVERSION_EVENTS.walletSealed1000, { path: pathname });
          await loadMe();
          window.dispatchEvent(new CustomEvent("people:founder-claimed"));
        } else if (
          payload?.error === "already_claimed" ||
          payload?.error === "expired_token" ||
          payload?.error === "invalid_token"
        ) {
          writePendingClaimToStorage(null);
          setPendingClaim(null);
        }
      })
      .catch(() => {})
      .finally(() => {
        setRedeemingClaim(false);
      });
  }, [mounted, pendingClaim, redeemingClaim, me?.signedIn, me?.verifiedHuman, me?.founder, pathname, loadMe]);

  // Track passport_completed transition once per session when verificationLevel >= 2
  useEffect(() => {
    if (!mounted || !me?.founder || me.founder.verificationLevel < 2) return;
    try {
      if (window.sessionStorage.getItem(PASSPORT_TRACKED_KEY) === "1") return;
      window.sessionStorage.setItem(PASSPORT_TRACKED_KEY, "1");
      track(FOUNDING_CONVERSION_EVENTS.passportCompleted, { path: pathname });
    } catch {
      /* ignore */
    }
  }, [mounted, me?.founder, pathname]);

  // 3. Context scroll/read drawer trigger: ~45% scroll or 35s on page, once per session
  const routeKey = useMemo(() => resolveDrawerRouteKey(pathname), [pathname]);
  useEffect(() => {
    if (!mounted || skipCapture || modalOpen) return;
    let alreadyShown = false;
    try {
      alreadyShown = window.sessionStorage.getItem(DRAWER_SESSION_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (alreadyShown) return;

    const triggerDrawer = () => {
      if (alreadyShown) return;
      if (isOtherDialogOpen()) return;
      alreadyShown = true;
      try {
        window.sessionStorage.setItem(DRAWER_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setDrawerOpen(true);
      track(FOUNDING_CONVERSION_EVENTS.scrollDrawerShow, { route: routeKey, path: pathname });
    };

    const onScroll = () => {
      if (alreadyShown) return;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 120) return;
      const ratio = window.scrollY / scrollable;
      if (ratio >= 0.45) {
        triggerDrawer();
      }
    };

    const timerId = window.setTimeout(triggerDrawer, 35_000);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener("scroll", onScroll);
    };
  }, [mounted, skipCapture, modalOpen, routeKey, pathname]);

  // 4. Exit-intent / mobile back-trap / fast-scroll-up heuristic: once per session
  useEffect(() => {
    if (!mounted || skipCapture || modalOpen) return;
    let exitShown = false;
    try {
      exitShown = window.sessionStorage.getItem(EXIT_SESSION_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (exitShown) return;

    const triggerExitModal = (trigger: string) => {
      if (exitShown) return;
      if (isOtherDialogOpen()) return;
      exitShown = true;
      try {
        window.sessionStorage.setItem(EXIT_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setDrawerOpen(false);
      setModalSource("exit_intent");
      setModalOpen(true);
      track(FOUNDING_CONVERSION_EVENTS.exitIntentShow, { trigger, path: pathname });
    };

    // Desktop mouseleave toward top
    const onMouseLeave = (event: MouseEvent) => {
      if (event.clientY <= 12 && event.relatedTarget === null) {
        triggerExitModal("mouseleave");
      }
    };

    // Fast scroll-up heuristic on mobile/desktop after scrolling down >= 320px
    let lastY = window.scrollY;
    let lastT = Date.now();
    let maxY = window.scrollY;
    const onScrollUp = () => {
      const curY = window.scrollY;
      const curT = Date.now();
      if (curY > maxY) maxY = curY;
      const dy = lastY - curY;
      const dt = curT - lastT;
      if (maxY >= 360 && dy >= 180 && dt > 0 && dt <= 240 && curY < maxY - 180) {
        triggerExitModal("fast_scroll_up");
      }
      if (dt >= 120) {
        lastY = curY;
        lastT = curT;
      }
    };

    // Mobile history popstate back-trap guard (pushes a single sentinel state once per session;
    // after showing the modal once, subsequent back presses navigate back normally)
    let guardPushed = false;
    const isCoarsePointer =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (isCoarsePointer && window.history.state?.foundingBackGuard !== true) {
      try {
        window.history.pushState({ ...(window.history.state ?? {}), foundingBackGuard: true }, "");
        guardPushed = true;
      } catch {
        /* ignore */
      }
    }
    const onPopState = () => {
      if (guardPushed && !exitShown) {
        guardPushed = false;
        triggerExitModal("popstate");
      }
    };

    document.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("scroll", onScrollUp, { passive: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("scroll", onScrollUp);
      window.removeEventListener("popstate", onPopState);
    };
  }, [mounted, skipCapture, modalOpen, pathname]);

  // Escape key closes modal
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  // Generate QR code data URL when waitlist email is submitted
  useEffect(() => {
    const targetUrl = emailSubmittedBotUrl || tgColdLink;
    if (!emailSubmittedBotUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(targetUrl, {
      width: 156,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [emailSubmittedBotUrl, tgColdLink]);

  useEffect(() => {
    if (!mounted || skipCapture || typeof document === "undefined") {
      setProgressSlot(null);
      setFoundersSlot(null);
      return;
    }
    setProgressSlot(document.getElementById("founding-progress-slot"));
    setFoundersSlot(document.getElementById("founding-progress-founders-slot"));
  }, [mounted, skipCapture, pathname]);

  if (skipCapture) return null;

  const verificationLevel = me?.founder?.verificationLevel ?? 0;
  const step1Done = Boolean(pendingClaim) || verificationLevel >= 1;
  const step2Done = Boolean(me?.signedIn && (me?.verifiedHuman || me?.founder));
  const step3Done = verificationLevel >= 2;
  const completedSteps = [step1Done, step2Done, step3Done].filter(Boolean).length;

  const referralLinkToDisplay =
    pendingClaim?.referralUrl ||
    (step1Done && me?.founder?.walletAddress
      ? `${SITE_URL}/founders?ref=${encodeURIComponent(me.founder.walletAddress)}`
      : null);

  const handleCopyReferral = () => {
    if (!referralLinkToDisplay || typeof navigator === "undefined") return;
    navigator.clipboard
      ?.writeText(referralLinkToDisplay)
      .then(() => {
        setCopiedRef(true);
        window.setTimeout(() => setCopiedRef(false), 2000);
      })
      .catch(() => {});
  };

  const handleStickyBarClick = () => {
    track(FOUNDING_CONVERSION_EVENTS.stickyBarClick, { path: pathname });
    openFoundingModal("sticky_bar");
  };

  const handleDrawerCtaClick = () => {
    track(FOUNDING_CONVERSION_EVENTS.scrollDrawerClick, { route: routeKey, path: pathname });
    setDrawerOpen(false);
    openFoundingModal("drawer");
  };

  const handleTgDeepLinkClick = (source: string) => {
    track(FOUNDING_CONVERSION_EVENTS.tgDeeplinkClick, { source, path: pathname });
  };

  const handleWaitlistSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailError(null);
    const trimmed = emailInput.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailError(copy.modal.emailError);
      return;
    }
    setEmailBusy(true);
    try {
      const res = await fetch(FOUNDING_API.waitlist, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          locale: lang,
          path: pathname,
          ref: storedRef,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        botUrl?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        setEmailError(copy.modal.emailError);
        return;
      }
      track(FOUNDING_CONVERSION_EVENTS.emailWaitlistSubmit, { source: modalSource, path: pathname });
      setEmailSubmittedBotUrl(data.botUrl || tgColdLink);
    } catch {
      setEmailError(copy.modal.emailError);
    } finally {
      setEmailBusy(false);
    }
  };

  const drawerRouteCopy = copy.drawer.byRoute[routeKey];

  const nextStepShort = !step1Done
    ? (copy.progress.step1Short ?? "Step 1: Verify in Telegram (20s)")
    : !step2Done
      ? (copy.progress.step2Short ?? "Step 2: Create or Connect Wallet")
      : !step3Done
        ? (copy.progress.step3Short ?? "Step 3: Human Passport")
        : copy.progress.title;
  const nextStepShortMobile = !step1Done
    ? (copy.progress.step1ShortMobile ?? "Step 1 (20s)")
    : !step2Done
      ? "Step 2"
      : !step3Done
        ? "Step 3"
        : copy.progress.title;

  const nextStepAction = !step1Done ? (
    <a
      href={tgColdLink}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => handleTgDeepLinkClick("progress_strip")}
      data-testid="founding-progress-strip-cta"
      className="inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-brand px-2.5 text-[11px] font-bold text-brand-ink transition hover:brightness-110 sm:h-8 sm:px-3 sm:text-xs"
    >
      {copy.progress.verifyShort ?? "Verify"}
    </a>
  ) : !step2Done ? (
    <button
      type="button"
      onClick={() => openWalletModal()}
      data-testid="founding-progress-strip-cta"
      className="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-brand bg-brand/10 px-2.5 text-[11px] font-bold text-brand transition hover:bg-brand/20 sm:h-8 sm:px-3 sm:text-xs"
    >
      {copy.progress.verifyShort ?? "Verify"}
    </button>
  ) : !step3Done ? (
    <Link
      href="/founders#verify"
      data-testid="founding-progress-strip-cta"
      className="inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface px-2.5 text-[11px] font-bold text-ink transition hover:border-brand hover:text-brand sm:h-8 sm:px-3 sm:text-xs"
    >
      {copy.progress.verifyShort ?? "Verify"}
    </Link>
  ) : null;

  const progressSteps = (
    <ol className="grid gap-2 sm:grid-cols-3">
      <li
        data-testid="founding-step-1"
        className={`flex flex-col justify-between rounded-2xl border p-3 text-xs transition ${
          step1Done
            ? "border-value/45 bg-surface"
            : "border-warm/45 bg-surface shadow-[var(--elev-1)]"
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-ink">{copy.progress.step1Title}</span>
            {step1Done ? (
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-value/20 text-value">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-semibold text-brand">{copy.progress.step1Status}</p>
          <p className="mt-0.5 text-ink-2">{copy.progress.step1Detail}</p>
        </div>
        {!step1Done ? (
          <a
            href={tgColdLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => handleTgDeepLinkClick("progress_step1")}
            className="mt-2.5 inline-flex h-8 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 font-semibold text-brand-ink transition hover:brightness-110"
          >
            {copy.progress.step1Cta}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </li>
      <li
        data-testid="founding-step-2"
        className={`flex flex-col justify-between rounded-2xl border p-3 text-xs transition ${
          step2Done ? "border-value/45 bg-surface" : "border-line bg-surface"
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-ink">{copy.progress.step2Title}</span>
            {step2Done ? (
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-value/20 text-value">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-semibold text-brand">{copy.progress.step2Status}</p>
          <p className="mt-0.5 text-ink-2">{copy.progress.step2Detail}</p>
        </div>
        {!step2Done ? (
          <button
            type="button"
            onClick={() => openWalletModal()}
            className="mt-2.5 inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-brand bg-brand/10 px-3 font-semibold text-brand transition hover:bg-brand/20"
          >
            <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.progress.step2Cta}
          </button>
        ) : null}
      </li>
      <li
        data-testid="founding-step-3"
        className={`flex flex-col justify-between rounded-2xl border p-3 text-xs transition ${
          step3Done ? "border-value/45 bg-surface" : "border-line bg-surface"
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-ink">{copy.progress.step3Title}</span>
            {step3Done ? (
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-value/20 text-value">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-semibold text-brand">{copy.progress.step3Status}</p>
          <p className="mt-0.5 text-ink-2">{copy.progress.step3Detail}</p>
        </div>
        {!step3Done ? (
          <Link
            href="/founders#verify"
            className="mt-2.5 inline-flex h-8 items-center justify-center rounded-xl border border-line-strong bg-canvas-2 px-3 font-semibold text-ink transition hover:border-brand hover:text-brand"
          >
            {copy.progress.step3Cta}
          </Link>
        ) : null}
      </li>
    </ol>
  );

  return (
    <>
      {/* 1. Sticky Top Bar: Founding 1,000 Vault — always sticky at the very top.
          The style tag publishes the bar height so <header> can stick just below it
          on the first paint (no useEffect delay / overlap). */}
      <style
        dangerouslySetInnerHTML={{
          __html: ":root { --founding-topbar-h: 2.5rem; }",
        }}
      />
      <div
        role="region"
        aria-label={copy.stickyBar.badge}
        data-testid="founding-sticky-bar"
        className="sticky top-0 z-[60] h-10 w-full max-w-full overflow-hidden border-b border-warm/35 bg-[linear-gradient(90deg,rgba(245,158,11,0.14),rgba(3,105,161,0.12),rgba(245,158,11,0.14))] px-2 text-ink sm:px-4"
      >
        <div className="mx-auto flex h-full max-w-7xl flex-nowrap items-center justify-between gap-1.5 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0 text-warm" aria-hidden="true" />
            <p className="min-w-0 whitespace-nowrap text-[11px] font-semibold leading-none text-ink sm:text-xs">
              <span className="xl:hidden">{copy.stickyBar.messageMobile ?? "Founding 1,000 Vault · Dec 1"}</span>
              <span className="hidden xl:inline">{copy.stickyBar.messageFull}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {countdown && !countdown.open ? (
              <span
                className="inline-flex items-center rounded-full border border-line bg-surface/90 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-ink-2 sm:px-2"
                data-testid="founding-sticky-countdown"
              >
                {countdown.days}
                {copy.stickyBar.daysShort} {String(countdown.hours).padStart(2, "0")}
                {copy.stickyBar.hoursShort}
                <span className="hidden sm:inline">
                  {" "}
                  {String(countdown.minutes).padStart(2, "0")}
                  {copy.stickyBar.minutesShort}
                </span>
              </span>
            ) : null}

            <button
              type="button"
              onClick={handleStickyBarClick}
              data-testid="founding-sticky-cta"
              className="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand px-2.5 text-[11px] font-bold text-brand-ink shadow-sm transition hover:brightness-110 sm:h-8 sm:px-3.5 sm:text-xs"
            >
              <span className="sm:hidden">{copy.stickyBar.ctaShort ?? "Claim Seat"}</span>
              <span className="hidden sm:inline">{copy.stickyBar.cta}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Collapsible Founder 0/3 strip — portaled directly under <header> */}
      {progressSlot
        ? createPortal(
            <section
              aria-label={copy.progress.title}
              data-testid="founding-progress-widget-full"
              className="w-full max-w-full border-b border-line bg-canvas-2/90"
            >
              <div className="mx-auto flex h-10 max-w-7xl flex-nowrap items-center gap-1.5 px-2.5 sm:gap-2 sm:px-6">
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 font-mono text-[11px] font-bold text-brand sm:px-3 sm:text-xs"
                  data-testid="founding-progress-counter"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {copy.progress.badgePrefix} {completedSteps}/3
                </span>
                <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink sm:text-xs">
                  <span className="sm:hidden">
                    {nextStepShortMobile}
                  </span>
                  <span className="hidden sm:inline">{nextStepShort}</span>
                </p>
                {nextStepAction}
                <button
                  type="button"
                  aria-expanded={progressExpanded}
                  aria-label={progressExpanded ? copy.progress.collapseAria : copy.progress.expandAria}
                  onClick={() => setProgressExpanded((open) => !open)}
                  className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-0.5 rounded-full border border-line bg-surface px-2 text-[11px] font-semibold text-ink transition hover:border-brand sm:h-8 sm:px-2.5 sm:text-xs"
                >
                  {copy.progress.detailsToggle ?? "Details"}
                  {progressExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
              {progressExpanded ? (
                <div className="border-t border-line px-3 py-3 sm:px-6">
                  <div className="mx-auto max-w-6xl">
                    {referralLinkToDisplay ? (
                      <div className="mb-2.5 flex max-w-full items-center gap-1.5 rounded-full border border-value/40 bg-surface px-2.5 py-1 text-xs">
                        <span className="hidden text-ink-2 sm:inline">{copy.progress.referralReadyLabel}</span>
                        <span className="max-w-[160px] truncate font-mono text-ink sm:max-w-[220px]">
                          {referralLinkToDisplay}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyReferral}
                          className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 font-semibold text-brand hover:bg-brand/25"
                        >
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          {copiedRef ? copy.progress.copiedReferral : copy.progress.copyReferral}
                        </button>
                      </div>
                    ) : null}
                    {progressSteps}
                  </div>
                </div>
              ) : null}
            </section>,
            progressSlot,
          )
        : null}

      {/* 2b. Full 3-step cards on /founders, below the page hero (not above the header) */}
      {pathname === "/founders" && foundersSlot
        ? createPortal(
            <section
              aria-label={copy.progress.title}
              data-testid="founding-progress-founders-steps"
              className="mb-2"
            >
              {progressSteps}
            </section>,
            foundersSlot,
          )
        : null}

      {/* 3. Context Scroll / Read Drawer (bottom-right, never stacks with modal) */}
      {drawerOpen && !modalOpen ? (
        <aside
          aria-label={copy.drawer.eyebrow}
          data-testid="founding-scroll-drawer"
          className="fixed bottom-4 right-3 z-40 w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl border border-warm/45 bg-surface p-4 shadow-[var(--elev-2)] sm:right-4"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-warm">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.drawer.eyebrow}
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={copy.drawer.dismissAria}
              className="rounded-lg p-1 text-ink-3 transition hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <h3 className="mt-1.5 text-sm font-bold leading-snug text-ink">{drawerRouteCopy.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{drawerRouteCopy.body}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleDrawerCtaClick}
              data-testid="founding-scroll-drawer-cta"
              className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center rounded-xl bg-brand px-4 text-xs font-bold text-brand-ink transition hover:brightness-110"
            >
              {copy.drawer.cta}
            </button>
          </div>
        </aside>
      ) : null}

      {/* 4. Unified Founding 1,000 Vault Modal & Exit-Intent / Back-Trap Modal */}
      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="founding-vault-modal-title"
          data-testid="founding-vault-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4"
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={copy.modal.closeAria}
            onClick={() => setModalOpen(false)}
            className="fixed inset-0 bg-black/55 backdrop-blur-[2px]"
          />
          <div className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line-strong bg-surface p-5 text-ink shadow-[var(--elev-2)] sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warm/45 bg-warm/15 px-3 py-1 text-xs font-bold text-ink">
                <Lock className="h-3.5 w-3.5 text-warm" aria-hidden="true" />
                {copy.modal.eyebrow}
              </span>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label={copy.modal.closeAria}
                data-testid="founding-vault-modal-close"
                className="rounded-xl border border-line bg-surface-2 p-1.5 text-ink-2 transition hover:border-line-strong hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <h2 id="founding-vault-modal-title" className="mt-3 text-xl font-bold leading-snug text-ink sm:text-2xl">
              {copy.modal.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{copy.modal.lead}</p>

            <div className="mt-3 rounded-2xl border border-line bg-canvas-2 px-3.5 py-2.5 text-xs text-ink-2">
              <p className="font-semibold text-ink">{copy.modal.sealedFraming}</p>
              <p className="mt-1 text-ink-3">{copy.modal.rewardNote}</p>
            </div>

            {/* Primary Path: Verify in Telegram (20s) */}
            <div className="mt-5">
              <a
                href={tgColdLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleTgDeepLinkClick(modalSource)}
                data-testid="founding-modal-tg-cta"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-base font-bold text-brand-ink shadow-md transition hover:brightness-110"
              >
                {copy.modal.primaryTgCta}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <p className="mt-1.5 text-center text-xs text-ink-3">{copy.modal.primaryTgSub}</p>
            </div>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs font-medium text-ink-3">{copy.modal.orDivider}</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            {/* Secondary Path: 1-field Email Waitlist -> reveals @PeopleVerifyBot link + QR code */}
            {emailSubmittedBotUrl ? (
              <div
                data-testid="founding-modal-waitlist-success"
                className="rounded-2xl border border-value/40 bg-canvas-2 p-4 text-center"
              >
                <p className="text-sm font-bold text-value">{copy.modal.emailSuccessTitle}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{copy.modal.emailSuccessBody}</p>
                <div className="mt-3 flex flex-col items-center gap-3">
                  <a
                    href={emailSubmittedBotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleTgDeepLinkClick("waitlist_followup")}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-xs font-bold text-brand-ink transition hover:brightness-110"
                  >
                    @PeopleVerifyBot · {copy.modal.primaryTgCta}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                  {qrDataUrl ? (
                    <Image
                      src={qrDataUrl}
                      alt="@PeopleVerifyBot QR"
                      width={148}
                      height={148}
                      unoptimized
                      className="rounded-xl border border-line bg-white p-1.5"
                    />
                  ) : null}
                  <p className="text-[11px] text-ink-3">{copy.modal.qrScanHint}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-2" noValidate>
                <label htmlFor="founding-waitlist-email" className="sr-only">
                  {copy.modal.emailLabel}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="founding-waitlist-email"
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder={copy.modal.emailPlaceholder}
                    data-testid="founding-modal-email-input"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas-2 px-3.5 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={emailBusy}
                    data-testid="founding-modal-email-submit"
                    className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line-strong bg-surface-2 px-4 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    {emailBusy ? copy.modal.emailSubmitting : copy.modal.emailSubmit}
                  </button>
                </div>
                {emailError ? (
                  <p role="alert" className="text-xs text-warm">
                    {emailError}
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
