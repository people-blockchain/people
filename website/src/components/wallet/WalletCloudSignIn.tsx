"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { walletCopy } from "@/lib/wallet-copy";
import {
  ensureCloudWalletSession,
  fetchAuthSessionUser,
} from "@/lib/wallet-cloud-client";
import { runParticipantRegistration } from "@/lib/participant-registration";
import { networkJson } from "@/lib/network-client";
import {
  formatContinueAsLabel,
  readLastAuthEmail,
  rememberAuthEmail,
} from "@/lib/wallet-auth-storage";
import { walletUxCopy } from "@/lib/wallet-ux-copy";

export function WalletCloudSignIn({
  onConnected,
  autoConnect = false,
}: {
  onConnected?: () => void;
  autoConnect?: boolean;
}) {
  const { lang } = useLanguage();
  const t = walletCopy[lang];
  const c = walletUxCopy(lang);
  const { session: walletSession, connectCloud } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [knownEmail, setKnownEmail] = useState<string | null>(() => readLastAuthEmail());
  const [features, setFeatures] = useState<{ google: boolean; magic: boolean; walletVault: boolean } | null>(
    null,
  );

  useEffect(() => {
    void fetch("/api/auth/features")
      .then((res) => res.json())
      .then((data: { google?: boolean; magic?: boolean; walletVault?: boolean }) => {
        setFeatures({
          google: Boolean(data.google),
          magic: Boolean(data.magic),
          walletVault: Boolean(data.walletVault),
        });
      })
      .catch(() => setFeatures({ google: false, magic: false, walletVault: false }));
  }, []);

  const configured = features?.walletVault && (features.google || features.magic);

  const finishConnect = useCallback(
    async (userId: string, email?: string | null) => {
      setBusy(true);
      setError("");
      try {
        rememberAuthEmail(email);
        if (email) setKnownEmail(email);
        const cloud = await ensureCloudWalletSession({ id: userId });
        connectCloud(cloud);
        await fetch("/api/partner/wallet/sync-vault", { method: "POST", credentials: "include" });
        void runParticipantRegistration(cloud.privateKey, cloud.address, {
          requestFaucet: async () => {
            await networkJson("faucet/fund", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ address: cloud.address, amount: 10 }),
            });
          },
        });
        onConnected?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.error);
      } finally {
        setBusy(false);
        setPending(null);
      }
    },
    [connectCloud, onConnected, t.error, setError, setBusy, setPending],
  );

  useEffect(() => {
    if (!autoConnect || walletSession) return;
    let cancelled = false;
    void (async () => {
      const user = await fetchAuthSessionUser();
      if (!user || cancelled) return;
      await finishConnect(user.id, user.email);
    })();
    return () => {
      cancelled = true;
    };
  }, [autoConnect, walletSession, finishConnect]);

  const redirectTo = (() => {
    if (typeof window === "undefined") return "/?walletConnect=1";
    const url = new URL(window.location.href);
    url.searchParams.set("walletConnect", "1");
    return url.toString();
  })();

  const continueWithGoogle = () => {
    setPending("google");
    setError("");
    void signIn("google", { redirectTo });
  };

  const continueWithKnownEmail = () => {
    if (!knownEmail || !features?.magic) return;
    setPending("email");
    setError("");
    void signIn("resend", { email: knownEmail, redirectTo });
  };

  if (features && !configured) {
    return <p className="text-sm text-ink-3">{t.signInUnavailable}</p>;
  }

  return (
    <div className="space-y-3" data-testid="wallet-cloud-sign-in">
      {error ? (
        <p className="text-sm text-warm">
          {t.error}: {error}
        </p>
      ) : null}
      {busy ? <p className="text-sm text-value">{t.signInOpening}</p> : null}

      {features?.google ? (
        <button
          type="button"
          disabled={busy || pending !== null}
          data-testid="wallet-sign-in-google"
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40"
          onClick={continueWithGoogle}
        >
          {pending === "google" ? t.signingIn : t.signInGoogle}
        </button>
      ) : null}

      {knownEmail && features?.magic && !walletSession ? (
        <button
          type="button"
          disabled={busy || pending !== null}
          data-testid="wallet-continue-as"
          className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          onClick={continueWithKnownEmail}
        >
          {pending === "email" ? t.signingIn : formatContinueAsLabel(c.continueAs, knownEmail)}
        </button>
      ) : null}

      {features?.magic ? (
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
            if (!email) return;
            rememberAuthEmail(email);
            setKnownEmail(email);
            setPending("email");
            setError("");
            await signIn("resend", { email, redirectTo });
          }}
        >
          <label className="block text-sm text-ink-2" htmlFor="wallet-cloud-email">
            {t.signInEmailLabel}
          </label>
          <input
            id="wallet-cloud-email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={knownEmail ?? ""}
            placeholder={t.signInEmailPlaceholder}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            disabled={busy || pending !== null}
          />
          <button
            type="submit"
            disabled={busy || pending !== null}
            data-testid="wallet-sign-in-email"
            className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {pending === "email" ? t.signingIn : t.signInMagicCta}
          </button>
        </form>
      ) : null}

      <button
        type="button"
        className="hidden"
        data-testid="wallet-cloud-session-probe"
        onClick={() => {
          void fetchAuthSessionUser().then((user) => {
            if (user) void finishConnect(user.id, user.email);
          });
        }}
      />
    </div>
  );
}
