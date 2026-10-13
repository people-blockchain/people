"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useExternalWalletOptional } from "@/context/ExternalWalletContext";
import { formatPpl } from "@/lib/asset-amounts";
import { content } from "@/lib/content";
import { networkJson } from "@/lib/network-client";
import { shortWalletAddress } from "@/lib/partner/bind-errors";
import { uxCopy } from "@/lib/ux-copy";
import { walletCopy } from "@/lib/wallet-copy";
import { disconnectPeopleWallet } from "@/lib/wallet-disconnect";
import { VerifyStatusBadge } from "@/components/founders/VerifyStatusBadge";
import { OpenSignInModalButton } from "@/components/wallet/OpenSignInModalButton";
type Layout = "desktop" | "mobile-sheet" | "mobile-bar";

/** Logged out, the header shows one primary action: the localized «Sign in» that
 *  opens the People Wallet modal (creates a wallet for new users, unlocks it for
 *  returning ones). Copy is localized, so the widths below are tuned for the
 *  longest of the 12 labels at each breakpoint. */
const signInDesktop =
  "header-label hidden h-9 shrink-0 items-center rounded-lg border border-brand/40 bg-brand/10 px-2.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/20 lg:inline-flex xl:px-3 xl:text-sm max-lg:!hidden";
const signInSheet =
  "inline-flex w-full items-center justify-center rounded-xl bg-brand px-5 py-4 text-base font-semibold text-brand-ink";
const signInMobileBar =
  "header-label inline-flex h-9 max-w-[7.25rem] shrink-0 whitespace-nowrap items-center justify-center rounded-lg border border-brand/40 bg-brand/10 px-2 text-[10px] font-semibold text-brand transition-colors hover:bg-brand/20 min-[381px]:max-w-[8.5rem] min-[381px]:px-2.5 min-[381px]:text-[11px] sm:text-xs";

export function HeaderWalletMenu({ layout, onDismiss }: { layout: Layout; onDismiss?: () => void }) {
  const { lang } = useLanguage();
  const u = uxCopy[lang];
  const w = walletCopy[lang];
  const t = content[lang].nav;
  const { session, sessionHydrated, lock } = useWallet();
  const externalWallet = useExternalWalletOptional();
  // The embedded People wallet takes priority; otherwise fall back to an injected/WalletConnect
  // signer (e.g. a MetaMask/Trust in-app browser) so its address shows up in the header too.
  const externalSigner = session ? null : externalWallet?.signer ?? null;
  const address = session?.address ?? externalSigner?.address ?? null;
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    try {
      const body = await networkJson<{ balance?: number }>(`address/${address}`, { cache: "no-store" });
      setBalance(Number(body.balance ?? 0));
    } catch {
      setBalance(null);
    }
  }, [address]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleCopyAddress = useCallback(async () => {
    if (!address) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = address;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
    } catch {
      /* ignore */
    }
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 1500);
  }, [address]);

  const runDisconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      if (session) {
        await disconnectPeopleWallet({ lock });
      } else {
        externalWallet?.disconnect();
      }
      setOpen(false);
      onDismiss?.();
    } finally {
      setDisconnecting(false);
    }
  }, [lock, onDismiss, session, externalWallet]);

  if (!address) {
    // While the session store / auth cookie is still being checked, do not flash
    // the Sign in button — that is what Android showed after an app-switch until reload.
    if (!sessionHydrated) {
      const restoringClass =
        layout === "mobile-sheet"
          ? signInSheet + " opacity-70"
          : layout === "mobile-bar"
            ? signInMobileBar + " opacity-70"
            : signInDesktop + " opacity-70";
      return (
        <button
          type="button"
          data-testid="header-wallet-restoring"
          disabled
          aria-busy="true"
          className={restoringClass}
        >
          {u.checking}
        </button>
      );
    }
    const signInClass =
      layout === "mobile-sheet"
        ? signInSheet
        : layout === "mobile-bar"
          ? signInMobileBar
          : signInDesktop;
    return (
      <OpenSignInModalButton
        data-testid="header-sign-in"
        onNavigate={onDismiss}
        className={signInClass}
      >
        {t.signIn}
      </OpenSignInModalButton>
    );
  }

  if (layout === "mobile-sheet") {
    return null;
  }

  const chipClass =
    layout === "mobile-bar"
      ? "header-label flex h-9 max-w-[7.5rem] shrink-0 items-center gap-1 rounded-lg border border-line bg-surface-2 px-1.5 text-[10px] font-semibold text-ink min-[381px]:max-w-[8.75rem] min-[381px]:text-[11px] sm:text-xs"
      : "header-label flex h-9 max-w-[9.5rem] shrink-0 items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 text-[11px] font-semibold text-ink sm:max-w-[10.5rem] sm:text-xs xl:max-w-[12rem] xl:px-2.5";

  const short = shortWalletAddress(address);
  const pplLabel = balance === null ? "…" : formatPpl(balance);

  return (
    <div ref={menuContainerRef} className="relative flex shrink-0 items-center gap-2">
      {layout === "desktop" ? <VerifyStatusBadge variant="chip" /> : null}
      <button
        ref={triggerRef}
        type="button"
        data-testid="header-wallet-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={chipClass}
      >
        {layout === "mobile-bar" ? (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full bg-value" aria-hidden="true" />
            <span className="min-w-0 truncate font-mono">{short}</span>
          </>
        ) : (
          <>
            <span className="min-w-0 truncate font-mono">{short}</span>
            <span className="shrink-0 text-value">{pplLabel}</span>
            <ChevronDown className={`h-3 w-3 shrink-0 text-ink-3 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </>
        )}
      </button>
      {open ? (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <ul
            role="menu"
            aria-label={u.walletMenuAria}
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[10rem] rounded-xl border border-line bg-canvas-2 p-1.5 shadow-[var(--elev-2)]"
          >
            <li role="none">
              <VerifyStatusBadge
                variant="menu"
                onNavigate={() => {
                  setOpen(false);
                  onDismiss?.();
                }}
              />
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                data-testid="header-wallet-copy-address"
                onClick={() => void handleCopyAddress()}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {copied ? w.copied : w.copyAddress}
              </button>
            </li>
            <li role="none">
              <Link
                role="menuitem"
                href="/wallet"
                onClick={() => {
                  setOpen(false);
                  onDismiss?.();
                }}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {u.myWallet}
              </Link>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                data-testid="header-wallet-disconnect"
                disabled={disconnecting}
                onClick={() => void runDisconnect()}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-warm transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                {u.disconnectWallet}
              </button>
            </li>
          </ul>
        </>
      ) : null}
    </div>
  );
}
