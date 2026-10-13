"use client";

import { walletUxCopy } from "@/lib/wallet-ux-copy";

import { useCallback, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { walletCopy } from "@/lib/wallet-copy";
import { decryptSecret } from "@/lib/wallet-vault";
import {
  createMnemonicWallet,
  isValidMnemonic,
  keyPairFromMnemonic,
  pickMnemonicConfirmIndices,
  verifyMnemonicConfirm,
} from "@/lib/wallet-seed";
import { keyFromPrivate } from "@/lib/ovn-sign";
import { runParticipantRegistration } from "@/lib/participant-registration";
import { requestTestnetFaucet } from "@/lib/evm/faucet-client";
import type { StoredWallet } from "@/lib/wallet-vault";

export type WalletOnboardingMode = "home" | "create" | "import" | "unlock";

export function useWalletOnboarding(
  onConnected?: () => void,
  options?: { startMode?: WalletOnboardingMode; startUnlockWalletId?: string }
) {
  const { lang } = useLanguage();
  const t = walletCopy[lang];
  const { wallets, session, saveNew, unlock } = useWallet();

  const [mode, setMode] = useState<WalletOnboardingMode>(() => options?.startMode ?? "home");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [confirmIdx, setConfirmIdx] = useState<number[]>([]);
  const [confirmAnswers, setConfirmAnswers] = useState<Record<number, string>>({});
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createStep, setCreateStep] = useState(0);
  const [unlockTarget, setUnlockTarget] = useState<StoredWallet | null>(null);

  const unlockFromOptions =
    options?.startMode === "unlock" && options.startUnlockWalletId
      ? wallets.find((item) => item.id === options.startUnlockWalletId) ?? null
      : null;
  const effectiveUnlockTarget = unlockTarget ?? unlockFromOptions;

  const resetToHome = useCallback(() => {
    setMode("home");
    setError("");
    setPassword("");
    setPassword2("");
  }, []);

  const registerOnNetwork = useCallback(
    async (privateKey: string, address: string) => {
      setNotice(t.registrationPending);
      const result = await runParticipantRegistration(privateKey, address, {
        requestFaucet: async () => {
          await requestTestnetFaucet(address, 10);
        },
      });
      if (result.ok) {
        setNotice(t.createdConnected);
      } else {
        setNotice(t.createdConnected);
      }
    },
    [t]
  );

  const startCreate = useCallback(() => {
    setError("");
    try {
      const created = createMnemonicWallet();
      setMnemonic(created.mnemonic);
      setConfirmIdx(pickMnemonicConfirmIndices(12, 3));
      setConfirmAnswers({});
      setCreateStep(0);
      setPassword("");
      setPassword2("");
      setMode("create");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    }
  }, [t]);

  const finishCreate = useCallback(async () => {
    if (password.length < 8) {
      setError(t.minPassword);
      return;
    }
    if (password !== password2) {
      setError(t.passwordConfirm);
      return;
    }
    const answers = confirmIdx.map((index) => ({ index, word: confirmAnswers[index] ?? "" }));
    if (!verifyMnemonicConfirm(mnemonic, answers)) {
      setError(t.confirmWords);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const key = keyPairFromMnemonic(mnemonic);
      await saveNew({ key, password, mnemonic, backupConfirmed: true });
      setMode("home");
      setMnemonic("");
      void registerOnNetwork(key.privateKey, key.address);
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }, [
    password,
    password2,
    confirmIdx,
    confirmAnswers,
    mnemonic,
    saveNew,
    registerOnNetwork,
    onConnected,
    t,
  ]);

  const doImport = useCallback(async () => {
    if (password.length < 8) {
      setError(t.minPassword);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const text = importText.trim();
      let seed = isValidMnemonic(text) ? text : undefined;
      let privateKey = text;
      let label: string | undefined;
      if (text.startsWith("{")) {
        const backup = JSON.parse(text);
        if (backup.version !== 1 || typeof backup.wallet?.encryptedPrivateKey !== "string") throw new Error(t.error);
        privateKey = await decryptSecret(backup.wallet.encryptedPrivateKey, password);
        if (keyFromPrivate(privateKey).address.toLowerCase() !== String(backup.wallet.address).toLowerCase()) {
          throw new Error(t.error);
        }
        seed = backup.wallet.encryptedMnemonic
          ? await decryptSecret(backup.wallet.encryptedMnemonic, password)
          : undefined;
        if (seed && keyPairFromMnemonic(seed).address !== keyFromPrivate(privateKey).address) throw new Error(t.error);
        label = typeof backup.wallet.label === "string" ? backup.wallet.label : undefined;
      }
      const key = seed ? keyPairFromMnemonic(seed) : keyFromPrivate(privateKey);
      await saveNew({
        key,
        password,
        mnemonic: seed,
        label,
      });
      setMode("home");
      setImportText("");
      void registerOnNetwork(key.privateKey, key.address);
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }, [password, importText, saveNew, registerOnNetwork, onConnected, t]);

  const doUnlock = useCallback(async () => {
    if (!effectiveUnlockTarget) return;
    setBusy(true);
    setError("");
    try {
      await unlock(effectiveUnlockTarget, password);
      setMode("home");
      setPassword("");
      onConnected?.();
    } catch (err) {
      // Only an AES-GCM authentication failure means the password is wrong. Anything else
      // (unreadable/foreign payload, address mismatch, storage or WebCrypto failure) is not the
      // user's typo and must not be reported as "wrong password".
      const ux = walletUxCopy(lang);
      const name = err instanceof Error ? err.name : "";
      setError(name === "OperationError" ? ux.unlockWrongPassword : ux.unlockUnavailable);
    } finally {
      setBusy(false);
    }
  }, [effectiveUnlockTarget, password, unlock, onConnected, lang]);

  const pickUnlock = useCallback((wallet: StoredWallet) => {
    setUnlockTarget(wallet);
    setPassword("");
    setMode("unlock");
    setError("");
  }, []);

  return {
    lang,
    t,
    wallets,
    session,
    mode,
    setMode,
    password,
    setPassword,
    password2,
    setPassword2,
    mnemonic,
    confirmIdx,
    confirmAnswers,
    setConfirmAnswers,
    importText,
    setImportText,
    busy,
    error,
    notice,
    createStep,
    setCreateStep,
    unlockTarget: effectiveUnlockTarget,
    startCreate,
    finishCreate,
    doImport,
    doUnlock,
    pickUnlock,
    resetToHome,
    setError,
  };
}
