"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchAuthSessionUser, WalletCloudError } from "@/lib/wallet-cloud-client";
import { fetchTurnkeyStatus, isTurnkeySession } from "@/lib/turnkey-client";
import { decideTurnkeyOpen } from "@/lib/turnkey-upgrade";
import { openTurnkeyWalletSession, turnkeyOpenErrorCode } from "@/lib/turnkey-open-flow";
import { isTurnkeyWalletProvider } from "@/lib/wallet-provider-flag";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { TurnkeyUpgradeCard } from "./TurnkeyUpgradeCard";

const DISMISS_KEY = "people-turnkey-upgrade-dismissed";

export function TurnkeyUpgradePrompt() {
  const { session, connectTurnkey } = useWallet();
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  const [legacyAddress, setLegacyAddress] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!isTurnkeyWalletProvider()) return;
    if (isTurnkeySession(session)) {
      setVisible(false);
      return;
    }
    const user = await fetchAuthSessionUser();
    if (!user?.id) {
      setVisible(false);
      return;
    }
    if (sessionStorage.getItem(`${DISMISS_KEY}:${user.id}`)) {
      setVisible(false);
      return;
    }
    try {
      const status = await fetchTurnkeyStatus();
      const decision = decideTurnkeyOpen({
        hasLegacyVault: status.hasLegacyVault === true,
        legacyAddress: status.legacyAddress ?? null,
        address: status.address ?? null,
        legacyImportError: status.legacyImportError ?? null,
      });
      if (decision.action === "prompt_upgrade") {
        setLegacyAddress(decision.legacyAddress);
        setVisible(true);
        return;
      }
      if (decision.action === "keep_legacy") {
        setLegacyAddress(decision.legacyAddress);
        setError(c.upgradeWalletFailed);
        setVisible(true);
        return;
      }
      setVisible(false);
    } catch {
      setError(c.upgradeWalletStatusFailed);
      setVisible(true);
    }
  }, [c.upgradeWalletFailed, c.upgradeWalletStatusFailed, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onUpgrade = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const user = await fetchAuthSessionUser();
      if (!user?.id) throw new WalletCloudError("unauthorized");
      const next = await openTurnkeyWalletSession(user, { importLegacy: true });
      await connectTurnkey(next);
      setVisible(false);
    } catch (err) {
      const code = turnkeyOpenErrorCode(err);
      setError(c.upgradeWalletFailed);
      void code;
    } finally {
      setBusy(false);
    }
  }, [c.upgradeWalletFailed, connectTurnkey]);

  const onLater = useCallback(async () => {
    const user = await fetchAuthSessionUser();
    if (user?.id) sessionStorage.setItem(`${DISMISS_KEY}:${user.id}`, "1");
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] p-4 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[24rem]">
      <TurnkeyUpgradeCard
        legacyAddress={legacyAddress}
        busy={busy}
        error={error}
        onUpgrade={() => void onUpgrade()}
        onLater={() => void onLater()}
        onRetry={error ? () => void refresh() : undefined}
      />
    </div>
  );
}
