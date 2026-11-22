"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { fetchAuthSessionUser, WalletCloudError } from "@/lib/wallet-cloud-client";
import { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";
import { fetchTurnkeyStatus } from "@/lib/turnkey-client";
import { decideTurnkeyOpen } from "@/lib/turnkey-upgrade";
import {
  completeTurnkeyOtpAndOpen,
  openTurnkeyWalletSession,
  requestTurnkeyOtp,
  turnkeyOpenErrorCode,
} from "@/lib/turnkey-open-flow";
import { runParticipantRegistrationFromSession } from "@/lib/participant-registration";
import { networkJson } from "@/lib/network-client";
import { warnCloudOpenFailed } from "@/lib/wallet-cloud-crypto";
import { rememberAuthEmail } from "@/lib/wallet-auth-storage";
import { clearUserDisconnected } from "@/lib/wallet-disconnect";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { TurnkeyUpgradeCard } from "./TurnkeyUpgradeCard";

export function WalletTurnkeySignIn({
  onConnected,
  autoConnect = false,
}: {
  onConnected?: () => void;
  autoConnect?: boolean;
}) {
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  const { connectTurnkey } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [otpId, setOtpId] = useState("");
  const [otpPublicKey, setOtpPublicKey] = useState("");
  const [otpBundle, setOtpBundle] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [legacyAddress, setLegacyAddress] = useState("");
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  const finish = useCallback(
    async (importLegacy: boolean) => {
      const user = await fetchAuthSessionUser();
      if (!user?.id) throw new WalletCloudError("unauthorized");
      rememberAuthEmail(user.email);
      const session = await openTurnkeyWalletSession(user, { importLegacy });
      await connectTurnkey(session);
      void fetch("/api/partner/wallet/sync-vault", { method: "POST", credentials: "include" }).catch(
        () => undefined,
      );
      void runParticipantRegistrationFromSession(session, {
        requestFaucet: async () => {
          await networkJson("faucet/fund", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address: session.address, amount: 10 }),
          });
        },
      }).catch(() => undefined);
      onConnected?.();
    },
    [connectTurnkey, onConnected],
  );

  const start = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      clearUserDisconnected();
      const user = await fetchAuthSessionUser();
      if (!user?.id) {
        setError(c.turnkeyCreateFailed);
        return;
      }
      const status = await fetchTurnkeyStatus();
      const decision = decideTurnkeyOpen({
        hasLegacyVault: status.hasLegacyVault === true,
        legacyAddress: status.legacyAddress ?? null,
        address: status.address ?? null,
        legacyImportError: status.legacyImportError ?? null,
      });
      if (decision.action === "prompt_upgrade") {
        setLegacyAddress(decision.legacyAddress);
        setNeedsUpgrade(true);
        return;
      }
      if (decision.action === "keep_legacy") {
        setLegacyAddress(decision.legacyAddress);
        setNeedsUpgrade(true);
        setError(c.upgradeWalletFailed);
        warnCloudOpenFailed({
          code: decision.reason,
          stage: "turnkey_import",
          vaultPresent: true,
          retried: false,
        });
        return;
      }
      try {
        await finish(false);
      } catch (err) {
        const code = turnkeyOpenErrorCode(err);
        if (code === "otp_required" || code === "turnkey_client_unready") {
          const otp = await requestTurnkeyOtp();
          setOtpId(otp.otpId);
          setOtpPublicKey(otp.publicKey);
          setOtpBundle(otp.otpEncryptionTargetBundle);
          return;
        }
        if (code === "upgrade_required") {
          setLegacyAddress(status.legacyAddress ?? "");
          setNeedsUpgrade(true);
          return;
        }
        if (code === LEGACY_ADDRESS_MISMATCH) {
          setError(c.upgradeWalletFailed);
          warnCloudOpenFailed({
            code: LEGACY_ADDRESS_MISMATCH,
            stage: "turnkey_import",
            vaultPresent: true,
            retried: false,
          });
          return;
        }
        setError(code === "create_failed" ? c.turnkeyCreateFailed : c.upgradeWalletFailed);
      }
    } finally {
      setBusy(false);
    }
  }, [c.turnkeyCreateFailed, c.upgradeWalletFailed, finish]);

  useEffect(() => {
    if (autoConnect) void start();
  }, [autoConnect, start]);

  const verifyOtp = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const user = await fetchAuthSessionUser();
      if (!user?.id) throw new WalletCloudError("unauthorized");
      const session = await completeTurnkeyOtpAndOpen(user, {
        otpId,
        otpCode,
        publicKey: otpPublicKey,
        otpEncryptionTargetBundle: otpBundle,
      });
      await connectTurnkey(session);
      onConnected?.();
    } catch {
      setError(c.turnkeySessionFailed);
    } finally {
      setBusy(false);
    }
  }, [connectTurnkey, c.turnkeySessionFailed, onConnected, otpBundle, otpCode, otpId, otpPublicKey]);

  if (needsUpgrade) {
    return (
      <TurnkeyUpgradeCard
        legacyAddress={legacyAddress}
        busy={busy}
        error={error}
        onUpgrade={() => {
          setBusy(true);
          setError("");
          void finish(true)
            .catch((err) => {
              const code = turnkeyOpenErrorCode(err);
              setError(c.upgradeWalletFailed);
              warnCloudOpenFailed({
                code,
                stage: "turnkey_import",
                vaultPresent: true,
                retried: false,
              });
            })
            .finally(() => setBusy(false));
        }}
        onLater={() => setNeedsUpgrade(false)}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="turnkey-wallet-sign-in">
      <div>
        <h2 className="text-lg font-semibold text-ink">{c.brandName}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{c.turnkeyLead}</p>
      </div>
      {otpId ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{c.turnkeyOtpLead}</p>
          <input
            value={otpCode}
            onChange={(event) => setOtpCode(event.target.value)}
            placeholder={c.turnkeyOtpPlaceholder}
            autoComplete="one-time-code"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void verifyOtp()}
            disabled={busy || otpCode.trim().length < 6}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {c.turnkeyOtpVerify}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? c.turnkeyOpening : c.brandName}
        </button>
      )}
      {error ? (
        <p className="text-sm text-red-600" data-testid="turnkey-wallet-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
