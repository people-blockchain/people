"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { walletCopy } from "@/lib/wallet-copy";
import {
  ensureCloudWalletSession,
  fetchAuthSessionUser,
  isCloudOpenRecoveryCode,
  WalletCloudError,
} from "@/lib/wallet-cloud-client";
import { warnCloudOpenFailed } from "@/lib/wallet-cloud-crypto";
import { runParticipantRegistration } from "@/lib/participant-registration";
import { networkJson } from "@/lib/network-client";
import {
  formatContinueAsLabel,
  readLastAuthEmail,
  rememberAuthEmail,
} from "@/lib/wallet-auth-storage";
import { walletUxCopy } from "@/lib/wallet-ux-copy";

function cloudSignInMessage(
  code: string,
  copy: {
    signInFailed: string;
    signInDecryptFailed: string;
    signInVaultUnsupported: string;
    signInAddressMismatch: string;
    signInSessionOpenFailed: string;
    signInSessionExpired: string;
    signInSessionMissing: string;
    signInRateLimited: string;
  },
): string {
  if (code === "decrypt_failed") return copy.signInDecryptFailed;
  if (code === "vault_schema_unsupported") return copy.signInVaultUnsupported;
  if (code === "address_mismatch" || code === "address_taken") return copy.signInAddressMismatch;
  if (code === "session_open_failed") return copy.signInSessionOpenFailed;
  if (code === "reauth_required") return copy.signInSessionExpired;
  if (code === "unauthorized") return copy.signInSessionMissing;
  if (code === "rate_limited") return copy.signInRateLimited;
  return copy.signInFailed;
}

export function WalletCloudSignIn({
  onConnected,
  autoConnect = false,
  onOpenImport,
}: {
  onConnected?: () => void;
  autoConnect?: boolean;
  /** Opens the existing WalletConnectPanel import mode (encrypted backup or key). */
  onOpenImport?: () => void;
}) {
  const { lang } = useLanguage();
  const t = walletCopy[lang];
  const c = walletUxCopy(lang);
  const { session: walletSession, connectCloud } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
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
      setErrorCode("");
      try {
        rememberAuthEmail(email);
        if (email) setKnownEmail(email);
        const cloud = await ensureCloudWalletSession({ id: userId });
        await connectCloud(cloud);
        try {
          const synced = await fetch("/api/partner/wallet/sync-vault", { method: "POST", credentials: "include" });
          if (!synced.ok) {
            warnCloudOpenFailed({ code: "partner_sync_failed", stage: "partner_sync", vaultPresent: true, retried: false });
          }
        } catch {
          warnCloudOpenFailed({ code: "partner_sync_failed", stage: "partner_sync", vaultPresent: true, retried: false });
        }
        void runParticipantRegistration(cloud.privateKey, cloud.address, {
          requestFaucet: async () => {
            await networkJson("faucet/fund", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ address: cloud.address, amount: 10 }),
            });
          },
        }).then(
          (result) => {
            if (!result.ok) {
              warnCloudOpenFailed({
                code: "participant_registration_failed",
                stage: "participant_registration",
                vaultPresent: true,
                retried: false,
              });
            }
          },
          () => {
            warnCloudOpenFailed({
              code: "participant_registration_failed",
              stage: "participant_registration",
              vaultPresent: true,
              retried: false,
            });
          },
        );
        onConnected?.();
      } catch (err) {
        const code = err instanceof WalletCloudError ? err.code : "unknown";
        if (!(err instanceof WalletCloudError) || !err.logged) {
          warnCloudOpenFailed({ code, stage: "cloud_sign_in", vaultPresent: false, retried: false });
        }
        setErrorCode(code);
        setError(cloudSignInMessage(code, c));
      } finally {
        setBusy(false);
        setPending(null);
      }
    },
    [connectCloud, onConnected, c, setError, setBusy, setPending],
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
        <div className="space-y-2" role="alert">
          <p className="text-sm text-warm">
            {t.error}: {error}
          </p>
          {onOpenImport && isCloudOpenRecoveryCode(errorCode) ? (
            <button
              type="button"
              data-testid="wallet-sign-in-import"
              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold"
              onClick={onOpenImport}
            >
              {t.import}
            </button>
          ) : null}
        </div>
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
