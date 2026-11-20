"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { fetchAuthSessionUser, WalletCloudError } from "@/lib/wallet-cloud-client";
import { turnkeyWalletCopy } from "@/lib/turnkey-wallet-copy";
import { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";
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

export function WalletTurnkeySignIn({
  onConnected,
  autoConnect = false,
}: {
  onConnected?: () => void;
  autoConnect?: boolean;
}) {
  const { connectTurnkey } = useWallet();
  const copy = turnkeyWalletCopy;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [otpId, setOtpId] = useState("");
  const [otpPublicKey, setOtpPublicKey] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [importing, setImporting] = useState(false);

  const finish = useCallback(
    async (userId: string) => {
      const user = await fetchAuthSessionUser();
      if (!user?.id) throw new WalletCloudError("unauthorized");
      rememberAuthEmail(user.email);
      setImporting(true);
      const session = await openTurnkeyWalletSession(user);
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
      void userId;
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
        setError(copy.createFailed);
        return;
      }
      try {
        await finish(user.id);
      } catch (err) {
        const code = turnkeyOpenErrorCode(err);
        if (code === "otp_required" || code === "turnkey_client_unready") {
          const otp = await requestTurnkeyOtp();
          setOtpId(otp.otpId);
          setOtpPublicKey(otp.publicKey);
          return;
        }
        if (code === LEGACY_ADDRESS_MISMATCH) {
          setError(copy.importMismatch);
          warnCloudOpenFailed({
            code: LEGACY_ADDRESS_MISMATCH,
            stage: "turnkey_import",
            vaultPresent: true,
            retried: false,
          });
          return;
        }
        setError(code === "create_failed" ? copy.createFailed : copy.importFailed);
      }
    } finally {
      setBusy(false);
      setImporting(false);
    }
  }, [copy.createFailed, copy.importFailed, copy.importMismatch, finish]);

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
      });
      await connectTurnkey(session);
      onConnected?.();
    } catch {
      setError(copy.sessionFailed);
    } finally {
      setBusy(false);
    }
  }, [connectTurnkey, copy.sessionFailed, onConnected, otpCode, otpId, otpPublicKey]);

  return (
    <div className="space-y-4" data-testid="turnkey-wallet-sign-in">
      <div>
        <h2 className="text-lg font-semibold text-ink">{copy.heading}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{copy.lead}</p>
      </div>
      {otpId ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{copy.otpLead}</p>
          <input
            value={otpCode}
            onChange={(event) => setOtpCode(event.target.value)}
            placeholder={copy.otpPlaceholder}
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
            {copy.otpVerify}
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
          {busy ? (importing ? copy.importHeading : copy.opening) : copy.heading}
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
