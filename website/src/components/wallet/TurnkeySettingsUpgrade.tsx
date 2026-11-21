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

export function TurnkeySettingsUpgrade() {
  const { session, connectTurnkey } = useWallet();
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  const [legacyAddress, setLegacyAddress] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!isTurnkeyWalletProvider()) {
      setVisible(false);
      return;
    }
    if (isTurnkeySession(session)) {
      setVisible(false);
      return;
    }
    const user = await fetchAuthSessionUser();
    if (!user?.id) {
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
      if (decision.action === "prompt_upgrade" || decision.action === "keep_legacy") {
        setLegacyAddress(decision.legacyAddress);
        setError(decision.action === "keep_legacy" ? c.upgradeWalletFailed : "");
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
      void turnkeyOpenErrorCode(err);
      setError(c.upgradeWalletFailed);
    } finally {
      setBusy(false);
    }
  }, [c.upgradeWalletFailed, connectTurnkey]);

  if (!visible) return null;

  return (
    <div data-testid="turnkey-upgrade-wallet-settings">
      <TurnkeyUpgradeCard
        legacyAddress={legacyAddress}
        busy={busy}
        error={error}
        onUpgrade={() => void onUpgrade()}
        onRetry={error ? () => void refresh() : undefined}
      />
    </div>
  );
}
