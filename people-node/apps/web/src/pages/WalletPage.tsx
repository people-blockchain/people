import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { RewardDistribution } from "@ovn/protocol";
import { addressPath, isWalletAddress } from "../address.js";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { useWallet } from "../WalletContext.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { useLive, type LiveTransaction } from "../LiveContext.js";
import {
  keyPairFromPrivateKey,
  ovn,
  recommendedFeeForSend,
  signTransaction,
  MAX_BATCH_RECIPIENTS
} from "../ovnClient.js";
import { TokenIcon } from "../TokenIcon.js";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  isWalletPasswordAcceptable,
  loadWallets,
  removeWallet,
  upsertWallet,
  type StoredWallet
} from "../walletStorage.js";
import { displaySessionLabel, sessionFromKey, sessionFromStored } from "../walletSession.js";
import { formatPaymentMemos, MAX_TX_MEMO_LENGTH } from "../txMemo.js";
import { deviceHasStoredKey } from "../devices.js";
import { useDeviceVault } from "../DeviceVaultContext.js";
import { showDevnetTools } from "../networkEnv.js";
import {
  createMnemonicWallet,
  isValidMnemonic,
  keyPairFromMnemonic,
  pickMnemonicConfirmIndices,
  verifyMnemonicConfirm
} from "../seedPhrase.js";
import {
  loadAddressBook,
  removeAddressBookEntry,
  toggleAddressFavorite,
  upsertAddressBookEntry,
  type AddressBookEntry
} from "../addressBook.js";
import {
  classifyFeeTier,
  estimateInclusionSeconds,
  feeForTier,
  type FeeTier
} from "../feeTiers.js";
import {
  loadTxQueue,
  syncTxQueueWithChain,
  updateTxQueueStatus,
  upsertTxQueueItem,
  type OutboundTx
} from "../txQueue.js";
import {
  buildBatchReportCsv,
  downloadTextFile,
  parseBatchCsv
} from "../batchCsv.js";
import { buildBalanceHistory, incomeFromTransfers24h } from "../portfolio.js";
import { getBoundReferrer, referralSharePath } from "../referral.js";
import { labelNodeKind, labelTxType, labelValidatorStatus } from "../i18n.js";
import QRCode from "qrcode";

const MIN_STAKE = 100;

export function WalletPage() {
  const { t } = usePrefs();
  const notify = useNotify();
  const { session, pendingReveal, openSession, lockSession, setPendingReveal } = useWallet();
  const { devices } = useDeviceVault();
  const { feed, headHeight, metrics, snapshot, rewards } = useLive();
  const showFaucet = showDevnetTools(metrics?.chainId);
  const [wallets, setWallets] = useState<StoredWallet[]>(loadWallets);
  const [extraHistory, setExtraHistory] = useState<LiveTransaction[] | null>(null);
  const [rewardHistory, setRewardHistory] = useState<RewardDistribution[]>([]);
  const [accountOverride, setAccountOverride] = useState<{
    address: string;
    balance: number;
    nonce: number;
    incomingTxs: number;
    outgoingTxs: number;
    chainId: string;
    headHeight: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<"login" | "saved" | "create">("login");
  const [loginKey, setLoginKey] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState(wallets[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [saveNewWallet, setSaveNewWallet] = useState(false);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [revealStep, setRevealStep] = useState<"show" | "confirm">("show");
  const [confirmAnswers, setConfirmAnswers] = useState<Record<number, string>>({});
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPhrase, setBackupPhrase] = useState<string | null>(null);
  const [panel, setPanel] = useState<"account" | "send" | "history">("account");
  const [showBatch, setShowBatch] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("10");
  const [fee, setFee] = useState("0.1");
  const [memo, setMemo] = useState("");
  const [sendMode, setSendMode] = useState<"single" | "batch">("single");
  const [batchText, setBatchText] = useState("");
  const [sending, setSending] = useState(false);
  const [funding, setFunding] = useState(false);
  const feeTouchedRef = useRef(false);
  const amountNumber = Number(amount);
  const feeNumber = Number(fee);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [removeWalletId, setRemoveWalletId] = useState<string | null>(null);
  const [showInviteQr, setShowInviteQr] = useState(false);
  const [inviteQrUrl, setInviteQrUrl] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "transfers" | "validator">("all");
  const [sendDraft, setSendDraft] = useState<{
    to: string;
    amount: number;
    fee: number;
    memo?: string;
    total: number;
    remaining: number;
    recipients?: Array<{ to: string; amount: number; memo?: string }>;
    tier?: FeeTier;
  } | null>(null);
  const [feeTier, setFeeTier] = useState<FeeTier>("normal");
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>(loadAddressBook);
  const [bookLabel, setBookLabel] = useState("");
  const [ownQrUrl, setOwnQrUrl] = useState("");
  const [txQueue, setTxQueue] = useState<OutboundTx[]>([]);
  const [batchReportReady, setBatchReportReady] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseBatchCsv> | null>(null);
  const trimmedRecipient = recipient.trim();
  const trimmedMemo = memo.trim();

  const batchRecipients = useMemo(() => {
    if (sendMode !== "batch") {
      return [] as Array<{ to: string; amount: number; memo?: string }>;
    }
    const lines = batchText
      .split(/\n|;/)
      .map((line) => line.trim())
      .filter(Boolean);
    const items: Array<{ to: string; amount: number; memo?: string }> = [];
    for (const line of lines) {
      const firstComma = line.indexOf(",");
      if (firstComma < 0) {
        return null;
      }
      const toRaw = line.slice(0, firstComma).trim();
      const rest = line.slice(firstComma + 1);
      const secondComma = rest.indexOf(",");
      const amountRaw = (secondComma >= 0 ? rest.slice(0, secondComma) : rest).trim();
      const memoRaw = secondComma >= 0 ? rest.slice(secondComma + 1).trim() : "";
      const amountValue = Number(amountRaw);
      if (!isWalletAddress(toRaw) || !Number.isFinite(amountValue) || amountValue <= 0) {
        return null;
      }
      if (memoRaw.length > MAX_TX_MEMO_LENGTH) {
        return null;
      }
      items.push(memoRaw ? { to: toRaw, amount: amountValue, memo: memoRaw } : { to: toRaw, amount: amountValue });
    }
    return items;
  }, [batchText, sendMode]);

  const recommendedFee = useMemo(
    () =>
      recommendedFeeForSend({
        mode: sendMode,
        recipientCount: batchRecipients?.length || 1,
        networkSuggested: metrics?.suggestedTransferFee
      }),
    [sendMode, batchRecipients, metrics?.suggestedTransferFee]
  );

  const tierFees = useMemo(
    () => ({
      economy: feeForTier(recommendedFee, "economy"),
      normal: feeForTier(recommendedFee, "normal"),
      fast: feeForTier(recommendedFee, "fast")
    }),
    [recommendedFee]
  );

  const inclusionEstimate = useMemo(
    () =>
      estimateInclusionSeconds(
        feeTier,
        metrics?.blockIntervalMs ?? 3000,
        metrics?.mempoolSize ?? 0
      ),
    [feeTier, metrics?.blockIntervalMs, metrics?.mempoolSize]
  );

  useEffect(() => {
    if (feeTouchedRef.current) {
      return;
    }
    setFee(tierFees[feeTier].toFixed(3));
  }, [tierFees, feeTier]);

  const batchAmount =
    batchRecipients && batchRecipients.length > 0
      ? batchRecipients.reduce((sum, item) => sum + item.amount, 0)
      : 0;

  const loginPreview = loginKey.trim()
    ? (() => {
        try {
          if (isValidMnemonic(loginKey)) {
            return keyPairFromMnemonic(loginKey).address;
          }
          return keyPairFromPrivateKey(loginKey.trim()).address;
        } catch {
          return null;
        }
      })()
    : null;

  const account = useMemo(() => {
    if (!session) {
      return null;
    }
    if (accountOverride && accountOverride.address === session.address) {
      return accountOverride;
    }
    const fromFeed = feed?.accounts.find((item) => item.address === session.address);
    if (fromFeed) {
      return {
        ...fromFeed,
        chainId: metrics?.chainId ?? "",
        headHeight
      };
    }
    return {
      address: session.address,
      balance: 0,
      nonce: 0,
      incomingTxs: 0,
      outgoingTxs: 0,
      chainId: metrics?.chainId ?? "",
      headHeight
    };
  }, [session, feed, headHeight, metrics?.chainId, accountOverride]);

  const history = useMemo(() => {
    if (!session) {
      return [];
    }
    if (extraHistory) {
      return extraHistory;
    }
    const normalized = session.address.toLowerCase();
    return (feed?.transactions ?? []).filter(
      (tx) => tx.from.toLowerCase() === normalized || tx.to.toLowerCase() === normalized
    );
  }, [session, feed, extraHistory]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") {
      return history;
    }
    if (historyFilter === "transfers") {
      return history.filter((tx) => tx.type === "transfer");
    }
    return history.filter((tx) =>
      ["joinValidator", "leaveValidator", "unstake", "attestation", "slashEvidence"].includes(tx.type)
    );
  }, [history, historyFilter]);

  async function refreshAccount(address: string) {
    setLoading(true);
    try {
      const [transactions, account] = await Promise.all([
        ovn.getAddressTransactions(address, 20),
        ovn.getAddress(address)
      ]);
      setExtraHistory(transactions as LiveTransaction[]);
      setAccountOverride({
        ...account,
        chainId: account.chainId,
        headHeight: account.headHeight
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.walletLoadFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setExtraHistory(null);
    setAccountOverride(null);
  }, [session?.address]);

  useEffect(() => {
    if (!session?.address) {
      return;
    }
    void refreshAccount(session.address);
  }, [session?.address]);

  useEffect(() => {
    if (!session?.address) {
      setRewardHistory([]);
      return;
    }
    ovn
      .getRewardHistory(20)
      .then(setRewardHistory)
      .catch(() => setRewardHistory([]));
  }, [session?.address, rewards?.epoch]);

  const myValidator = useMemo(() => {
    if (!session?.address || !snapshot) {
      return null;
    }
    return snapshot.validators.find((item) => item.address === session.address) ?? null;
  }, [session?.address, snapshot]);

  const myDevice = useMemo(
    () => devices.find((device) => device.address === session?.address) ?? null,
    [devices, session?.address]
  );

  const isLightPath = myValidator?.nodeKind === "light" || myDevice?.kind === "light";

  const currentEpochReward =
    rewards && session?.address ? (rewards.rewards[session.address] ?? 0) : 0;

  const rewardShare =
    rewards && session?.address && rewards.totalReward > 0
      ? ((rewards.rewards[session.address] ?? 0) / rewards.totalReward) * 100
      : 0;

  const myEpochRewards = useMemo(() => {
    if (!session?.address) {
      return [];
    }
    return rewardHistory
      .map((entry) => ({
        epoch: entry.epoch,
        reward: entry.rewards[session.address] ?? 0
      }))
      .filter((entry) => entry.reward > 0)
      .slice(0, 5);
  }, [rewardHistory, session?.address]);

  const lifetimeTotal = useMemo(() => {
    if (!session?.address) {
      return 0;
    }
    return rewardHistory.reduce((sum, entry) => sum + (entry.rewards[session.address] ?? 0), 0);
  }, [rewardHistory, session?.address]);

  const lockedStake = myValidator?.stake ?? 0;
  const availableBalance = account?.balance ?? 0;
  const pendingEpochReward = currentEpochReward;
  const income24h = useMemo(() => {
    if (!session?.address) {
      return 0;
    }
    return incomeFromTransfers24h(session.address, history) + pendingEpochReward;
  }, [session?.address, history, pendingEpochReward]);
  const balanceHistory = useMemo(() => {
    if (!session?.address || !account) {
      return [];
    }
    return buildBalanceHistory(account.balance, session.address, history);
  }, [session?.address, account, history]);

  useEffect(() => {
    if (!session?.address) {
      setTxQueue([]);
      return;
    }
    setTxQueue(loadTxQueue(session.address));
  }, [session?.address]);

  useEffect(() => {
    if (!session?.address) {
      return;
    }
    const knownTxIds = new Set(history.map((tx) => tx.id));
    const knownHeights = new Map(history.map((tx) => [tx.id, tx.blockHeight] as const));
    setTxQueue(
      syncTxQueueWithChain({
        address: session.address,
        headHeight,
        finalizedHeight: metrics?.finalizedHeight ?? 0,
        knownTxIds,
        knownHeights
      })
    );
  }, [session?.address, history, headHeight, metrics?.finalizedHeight]);

  useEffect(() => {
    if (!session?.address) {
      setOwnQrUrl("");
      return;
    }
    void QRCode.toDataURL(session.address, { margin: 1, width: 160 })
      .then(setOwnQrUrl)
      .catch(() => setOwnQrUrl(""));
  }, [session?.address]);

  const referredValidators = useMemo(() => {
    if (!session?.address || !snapshot) {
      return [];
    }
    return snapshot.validators.filter((item) => item.referredBy === session.address);
  }, [session?.address, snapshot]);

  const referralEpochBonus =
    rewards && session?.address ? (rewards.referralPayouts?.[session.address] ?? 0) : 0;

  const inviteLink = useMemo(() => {
    if (!session?.address || typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}${referralSharePath(session.address)}`;
  }, [session?.address]);

  const guestReferrer = useMemo(
    () => (session?.address ? getBoundReferrer(session.address) : null),
    [session?.address]
  );

  const onChainReferrer = myValidator?.referredBy ?? null;
  const displayGuestReferrer = onChainReferrer || guestReferrer;

  const faucetDone = (account?.balance ?? 0) >= MIN_STAKE;
  const lightDeviceReady =
    Boolean(myDevice && deviceHasStoredKey(myDevice)) ||
    Boolean(devices.some((d) => deviceHasStoredKey(d)));
  const rewardSeen = lifetimeTotal > 0 || currentEpochReward > 0;

  useEffect(() => {
    if (!showInviteQr || !inviteLink) {
      setInviteQrUrl("");
      return;
    }
    void QRCode.toDataURL(inviteLink, { margin: 1, width: 180 }).then(setInviteQrUrl).catch(() => setInviteQrUrl(""));
  }, [showInviteQr, inviteLink]);

  async function copyInviteLink() {
    if (!inviteLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteLink);
      notify.success(t.referralCopied);
    } catch {
      notify.error(t.walletCreateFailed);
    }
  }

  function handleLoginByKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const nextSession = isValidMnemonic(loginKey)
        ? sessionFromKey(keyPairFromMnemonic(loginKey).privateKey)
        : sessionFromKey(loginKey.trim());
      openSession(nextSession);
      setLoginKey("");
    } catch {
      notify.error(t.walletImportFailed);
    }
  }

  async function handleUnlockSaved(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wallet = wallets.find((item) => item.id === selectedWalletId);
    if (!wallet) {
      notify.error(t.walletNotFound);
      return;
    }
    try {
      const privateKey = await decryptPrivateKey(wallet.encryptedPrivateKey, password);
      openSession(sessionFromStored(wallet, privateKey));
      setPassword("");
    } catch {
      notify.error(t.walletWrongPassword);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const { mnemonic, key } = createMnemonicWallet();
      setPendingReveal({
        label: label.trim() || t.walletDefaultLabel,
        address: key.address,
        privateKey: key.privateKey,
        mnemonic,
        saveLocally: saveNewWallet,
        password,
        confirmIndices: pickMnemonicConfirmIndices(12)
      });
      setRevealStep("show");
      setConfirmAnswers({});
      setSavedConfirmed(false);
      setPassword("");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.walletCreateFailed);
    }
  }

  async function handleContinueAfterReveal() {
    if (!pendingReveal || !savedConfirmed || revealStep !== "confirm") {
      return;
    }
    const answers = pendingReveal.confirmIndices.map((index) => ({
      index,
      word: confirmAnswers[index] ?? ""
    }));
    if (!verifyMnemonicConfirm(pendingReveal.mnemonic, answers)) {
      notify.error(t.seedConfirmFailed);
      return;
    }
    if (pendingReveal.saveLocally && !isWalletPasswordAcceptable(pendingReveal.password)) {
      notify.error(t.devicePasswordTooShort);
      return;
    }
    try {
      if (pendingReveal.saveLocally) {
        const encryptedPrivateKey = await encryptPrivateKey(pendingReveal.privateKey, pendingReveal.password);
        const encryptedMnemonic = await encryptPrivateKey(pendingReveal.mnemonic, pendingReveal.password);
        const wallet: StoredWallet = {
          id: `${pendingReveal.address}-${Date.now()}`,
          label: pendingReveal.label,
          address: pendingReveal.address,
          encryptedPrivateKey,
          encryptedMnemonic,
          createdAt: Date.now()
        };
        upsertWallet(wallet);
        const nextWallets = loadWallets();
        setWallets(nextWallets);
        setSelectedWalletId(wallet.id);
        openSession(sessionFromStored(wallet, pendingReveal.privateKey));
      } else {
        openSession(sessionFromKey(pendingReveal.privateKey, pendingReveal.label));
      }
      setPendingReveal(null);
      setSavedConfirmed(false);
      setRevealStep("show");
      setConfirmAnswers({});
      notify.success(t.walletCreated);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.walletCreateFailed);
    }
  }

  async function handleCopySeed() {
    if (!pendingReveal) {
      return;
    }
    try {
      await navigator.clipboard.writeText(pendingReveal.mnemonic);
      notify.success(t.seedCopied);
    } catch {
      notify.error(t.walletCreateFailed);
    }
  }

  async function handleExportBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.persisted) {
      notify.error(t.seedBackupNeedSaved);
      return;
    }
    const wallet = wallets.find((item) => item.address === session.address);
    if (!wallet?.encryptedMnemonic) {
      notify.error(t.seedBackupUnavailable);
      return;
    }
    try {
      const phrase = await decryptPrivateKey(wallet.encryptedMnemonic, backupPassword);
      setBackupPhrase(phrase);
      setBackupPassword("");
      notify.success(t.seedBackupReady);
    } catch {
      notify.error(t.walletWrongPassword);
    }
  }

  function validateSendForm() {
    if (!account) {
      return t.walletLoadFailed;
    }
    if (!Number.isFinite(feeNumber) || feeNumber < 0) {
      return t.walletInvalidFee;
    }
    if (sendMode === "batch") {
      if (!batchRecipients || batchRecipients.length === 0) {
        return batchRecipients === null ? t.walletBatchInvalid : t.walletBatchEmpty;
      }
      if (batchRecipients.length > MAX_BATCH_RECIPIENTS) {
        return t.walletBatchTooMany;
      }
      if (batchRecipients.some((item) => (item.memo?.length ?? 0) > MAX_TX_MEMO_LENGTH)) {
        return t.walletMemoTooLong;
      }
      if (batchAmount + feeNumber > account.balance) {
        return t.walletInsufficientBalance;
      }
      return null;
    }
    if (!isWalletAddress(trimmedRecipient)) {
      return t.walletInvalidRecipient;
    }
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return t.walletInvalidAmount;
    }
    if (trimmedMemo.length > MAX_TX_MEMO_LENGTH) {
      return t.walletMemoTooLong;
    }
    if (amountNumber + feeNumber > account.balance) {
      return t.walletInsufficientBalance;
    }
    return null;
  }

  const recipientError =
    sendMode === "single" && trimmedRecipient.length > 0 && !isWalletAddress(trimmedRecipient)
      ? t.walletInvalidRecipient
      : null;
  const amountError =
    sendMode === "single" && amount.length > 0 && (!Number.isFinite(amountNumber) || amountNumber <= 0)
      ? t.walletInvalidAmount
      : null;
  const batchError =
    sendMode === "batch" && batchText.trim().length > 0 && batchRecipients === null
      ? t.walletBatchInvalid
      : sendMode === "batch" && batchRecipients && batchRecipients.length > MAX_BATCH_RECIPIENTS
        ? t.walletBatchTooMany
        : null;
  const feeError = fee.length > 0 && (!Number.isFinite(feeNumber) || feeNumber < 0) ? t.walletInvalidFee : null;
  const memoError =
    sendMode === "single" && trimmedMemo.length > MAX_TX_MEMO_LENGTH ? t.walletMemoTooLong : null;
  const effectiveAmount = sendMode === "batch" ? batchAmount : Number.isFinite(amountNumber) ? amountNumber : 0;
  const totalValue = effectiveAmount + (Number.isFinite(feeNumber) ? feeNumber : 0);
  const remainingBalance = account ? account.balance - totalValue : 0;
  const balanceError = account && totalValue > account.balance ? t.walletInsufficientBalance : null;
  const sendDisabled =
    sending ||
    !account ||
    Boolean(recipientError || amountError || batchError || feeError || memoError || balanceError) ||
    (sendMode === "batch" && (!batchRecipients || batchRecipients.length === 0));

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !account) {
      return;
    }
    const validationError = validateSendForm();
    if (validationError) {
      notify.error(validationError);
      return;
    }
    if (sendMode === "batch" && batchRecipients) {
      const total = batchAmount + feeNumber;
      setSendDraft({
        to: "batch",
        amount: batchAmount,
        fee: feeNumber,
        total,
        remaining: Math.max(0, account.balance - total),
        recipients: batchRecipients,
        tier: classifyFeeTier(feeNumber, recommendedFee)
      });
    } else {
      const total = amountNumber + feeNumber;
      setSendDraft({
        to: trimmedRecipient,
        amount: amountNumber,
        fee: feeNumber,
        memo: trimmedMemo || undefined,
        total,
        remaining: Math.max(0, account.balance - total),
        tier: classifyFeeTier(feeNumber, recommendedFee)
      });
    }
  }

  async function confirmSend(retryItem?: OutboundTx) {
    if (!session || !account) {
      return;
    }
    const draft = retryItem
      ? {
          to: retryItem.to,
          amount: retryItem.amount,
          fee: retryItem.fee,
          memo: retryItem.memo,
          total: retryItem.amount + retryItem.fee,
          remaining: Math.max(0, account.balance - retryItem.amount - retryItem.fee),
          recipients: retryItem.recipients
        }
      : sendDraft;
    if (!draft) {
      return;
    }
    setSending(true);
    const localId = retryItem?.localId ?? `local-${Date.now()}`;
    const nonce = retryItem?.nonce ?? account.nonce;
    try {
      // A retry re-signs with a brand-new id, so blindly re-sending can pay twice if the
      // original attempt actually landed (or is still in the node's mempool). Reconcile
      // against the chain first and never re-sign on a nonce that is already consumed.
      if (retryItem) {
        const priorOnChain = retryItem.txId
          ? await ovn.getTransaction(retryItem.txId).catch(() => null)
          : null;
        if (priorOnChain) {
          setTxQueue(
            updateTxQueueStatus(localId, {
              status: "included",
              error: undefined,
              blockHeight: priorOnChain.blockHeight,
              nonce: retryItem.nonce
            })
          );
          notify.info(t.txQueueAlreadyIncluded);
          await refreshAccount(session.address);
          return;
        }
        const current = await ovn.getAddress(session.address);
        if (current.nonce > retryItem.nonce) {
          // Some other tx already spent this nonce, so the node will reject a re-sign of
          // it and the original may have been the one that landed. Stop and let a human
          // confirm rather than risk a second payment.
          setTxQueue(
            updateTxQueueStatus(localId, {
              status: "failed",
              error: t.txQueueNonceConsumed,
              nonce: retryItem.nonce
            })
          );
          notify.error(t.txQueueNonceConsumed);
          await refreshAccount(session.address);
          return;
        }
      }
      const fresh = await ovn.getAddress(session.address);
      const useNonce = fresh.nonce;
      const tx = draft.recipients?.length
        ? signTransaction(session.privateKey, {
            chainId: (await ovn.getHealth()).chainId,
            id: `${session.address}-batch-${Date.now()}`,
            from: session.address,
            to: "batch",
            amount: draft.amount,
            fee: draft.fee,
            nonce: useNonce,
            timestamp: Date.now(),
            type: "transfer",
            payload: { recipients: draft.recipients }
          })
        : signTransaction(session.privateKey, {
            chainId: (await ovn.getHealth()).chainId,
            id: `${session.address}-transfer-${Date.now()}`,
            from: session.address,
            to: draft.to,
            amount: draft.amount,
            fee: draft.fee,
            nonce: useNonce,
            timestamp: Date.now(),
            type: "transfer",
            ...(draft.memo ? { payload: { memo: draft.memo } } : {})
          });
      const queued: OutboundTx = {
        localId,
        txId: tx.id,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        from: session.address,
        to: draft.to,
        amount: draft.amount,
        fee: draft.fee,
        nonce: useNonce,
        memo: draft.memo,
        recipients: draft.recipients
      };
      setTxQueue(upsertTxQueueItem(queued));
      const result = await ovn.submitTx(tx);
      if (!result.accepted) {
        setTxQueue(
          updateTxQueueStatus(localId, {
            status: "failed",
            error: result.error ?? t.walletSendFailed
          })
        );
        throw new Error(result.error ?? t.walletSendFailed);
      }
      notify.success(t.walletSent);
      if (draft.recipients?.length) {
        setBatchReportReady(
          buildBatchReportCsv(
            draft.recipients.map((item) => ({
              ...item,
              status: "submitted",
              txId: tx.id
            }))
          )
        );
      }
      setRecipient("");
      setMemo("");
      setBatchText("");
      setCsvPreview(null);
      setSendDraft(null);
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await refreshAccount(session.address);
    } catch (err) {
      setTxQueue(
        updateTxQueueStatus(localId, {
          status: "failed",
          error: err instanceof Error ? err.message : t.walletSendFailed,
          nonce
        })
      );
      notify.error(err instanceof Error ? err.message : t.walletSendFailed);
    } finally {
      setSending(false);
    }
  }

  async function copyAddress(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify.success(t.addressCopied);
    } catch {
      notify.error(t.walletCreateFailed);
    }
  }

  function handleSaveAddress() {
    if (!trimmedRecipient) {
      notify.error(t.walletInvalidRecipient);
      return;
    }
    try {
      setAddressBook(
        upsertAddressBookEntry({
          address: trimmedRecipient,
          label: bookLabel || trimmedRecipient.slice(0, 10)
        })
      );
      setBookLabel("");
      notify.success(t.addressBookSaved);
    } catch {
      notify.error(t.walletInvalidRecipient);
    }
  }

  async function handleScanQrFile(file: File | null) {
    if (!file) {
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("canvas");
      }
      ctx.drawImage(bitmap, 0, 0);
      const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!Detector) {
        notify.error(t.qrScanUnsupported);
        return;
      }
      const detector = new Detector({ formats: ["qr_code"] });
      const codes = await detector.detect(canvas);
      const value = codes[0]?.rawValue?.trim();
      if (!value || !isWalletAddress(value)) {
        notify.error(t.qrScanFailed);
        return;
      }
      setRecipient(value);
      notify.success(t.qrScanSuccess);
    } catch {
      notify.error(t.qrScanFailed);
    }
  }

  function handleCsvFile(file: File | null) {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseBatchCsv(text, MAX_BATCH_RECIPIENTS);
      setCsvPreview(parsed);
      if (parsed.valid.length > 0) {
        setBatchText(
          parsed.valid
            .map((item) => (item.memo ? `${item.to},${item.amount},${item.memo}` : `${item.to},${item.amount}`))
            .join("\n")
        );
        setShowBatch(true);
        setSendMode("batch");
        feeTouchedRef.current = false;
      }
    };
    reader.readAsText(file);
  }

  async function handleFaucet() {
    if (!session) {
      return;
    }
    setFunding(true);
    try {
      await ovn.fundFromFaucet(session.address, 100);
      notify.success(t.walletFaucetRequested);
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await refreshAccount(session.address);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.walletFaucetFailed);
    } finally {
      setFunding(false);
    }
  }

  function handleLock() {
    lockSession();
    setExtraHistory(null);
    setSavedConfirmed(false);
    setLogoutConfirmOpen(false);
  }

  function handleRemoveWallet(id: string | null) {
    if (!id) {
      return;
    }
    removeWallet(id);
    const nextWallets = loadWallets();
    setWallets(nextWallets);
    if (session?.id === id) {
      handleLock();
    }
    if (selectedWalletId === id) {
      setSelectedWalletId(nextWallets[0]?.id ?? "");
    }
    setRemoveWalletId(null);
  }

  return (
    <>
      <PageMeta title={t.walletTitle} description={t.walletDescription} />

      <section className="card page-header">
        <div className="section-head">
          <div>
            <h1>{t.walletTitle}</h1>
            <p className="lead">{t.walletDescription}</p>
          </div>
          {session && (
            <div className="link-row">
              <button className="ghost" onClick={() => void refreshAccount(session.address)} disabled={loading}>
                {loading ? t.refreshing : t.refresh}
              </button>
              <button className="ghost" onClick={() => setLogoutConfirmOpen(true)}>{t.walletLock}</button>
            </div>
          )}
        </div>
      </section>

      {!session && !pendingReveal ? (
        <section className="card wallet-auth">
          <div className="wallet-tabs">
            <button className={mode === "login" ? "active ghost" : "ghost"} onClick={() => setMode("login")}>
              {t.walletLogin}
            </button>
            <button className={mode === "saved" ? "active ghost" : "ghost"} onClick={() => setMode("saved")}>
              {t.walletSaved}
            </button>
            <button className={mode === "create" ? "active ghost" : "ghost"} onClick={() => setMode("create")}>
              {t.walletCreate}
            </button>
          </div>

          {mode === "login" && (
            <form className="wallet-form" onSubmit={handleLoginByKey}>
              <p className="wallet-hint">{t.walletLoginHint}</p>
              <label>
                {t.walletSeedOrKey}
                <textarea
                  value={loginKey}
                  onChange={(e) => setLoginKey(e.target.value)}
                  placeholder={t.walletSeedOrKeyPlaceholder}
                  rows={3}
                  required
                />
              </label>
              {loginPreview && (
                <p className="wallet-preview">
                  {t.walletAddress}: <span className="mono">{loginPreview}</span>
                </p>
              )}
              <button type="submit">{t.walletLoginButton}</button>
            </form>
          )}

          {mode === "saved" && (
            <form className="wallet-form" onSubmit={handleUnlockSaved}>
              {wallets.length === 0 ? (
                <p>{t.walletNoSaved}</p>
              ) : (
                <>
                  <label>
                    {t.walletSelect}
                    <select value={selectedWalletId} onChange={(e) => setSelectedWalletId(e.target.value)}>
                      {wallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.label} ({wallet.address.slice(0, 10)}...)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t.walletPassword}
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </label>
                  <button type="submit">{t.walletUnlock}</button>
                  {selectedWalletId && (
                    <button type="button" className="ghost" onClick={() => setRemoveWalletId(selectedWalletId)}>
                      {t.walletRemove}
                    </button>
                  )}
                </>
              )}
            </form>
          )}

          {mode === "create" && (
            <form className="wallet-form" onSubmit={handleCreate}>
              <label>
                {t.walletLabel}
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.walletDefaultLabel} />
              </label>
              <label className="wallet-checkbox">
                <input
                  type="checkbox"
                  checked={saveNewWallet}
                  onChange={(e) => setSaveNewWallet(e.target.checked)}
                />
                {t.walletSaveLocally}
              </label>
              {saveNewWallet && (
                <label>
                  {t.walletPassword}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </label>
              )}
              <button type="submit">{t.walletCreate}</button>
            </form>
          )}
        </section>
      ) : pendingReveal ? (
        <section className="card wallet-reveal">
          <h2>{t.walletRevealTitle}</h2>
          <p className="wallet-hint">{t.seedRevealWarning}</p>
          <dl className="detail-grid">
            <div>
              <dt>{t.walletLabel}</dt>
              <dd>{pendingReveal.label}</dd>
            </div>
            <div>
              <dt>{t.walletAddress}</dt>
              <dd className="mono">{pendingReveal.address}</dd>
            </div>
            {revealStep === "show" ? (
              <div className="detail-wide">
                <dt>{t.seedPhrase}</dt>
                <dd>
                  <pre className="mono seed-phrase">{pendingReveal.mnemonic}</pre>
                </dd>
              </div>
            ) : (
              <div className="detail-wide">
                <dt>{t.seedConfirmTitle}</dt>
                <dd>
                  <p className="wallet-hint">{t.seedConfirmHint}</p>
                  {pendingReveal.confirmIndices.map((index) => (
                    <label key={index}>
                      {t.seedConfirmWord.replace("{n}", String(index))}
                      <input
                        value={confirmAnswers[index] ?? ""}
                        onChange={(e) =>
                          setConfirmAnswers((prev) => ({ ...prev, [index]: e.target.value }))
                        }
                        autoComplete="off"
                        spellCheck={false}
                        required
                      />
                    </label>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          {revealStep === "show" && (
            <div className="link-row">
              <button type="button" className="ghost" onClick={() => void handleCopySeed()}>
                {t.seedCopyButton}
              </button>
            </div>
          )}
          {revealStep === "show" ? (
            <>
              <label className="wallet-checkbox">
                <input
                  type="checkbox"
                  checked={savedConfirmed}
                  onChange={(e) => setSavedConfirmed(e.target.checked)}
                />
                {t.seedSavedConfirm}
              </label>
              <div className="link-row">
                <button
                  type="button"
                  disabled={!savedConfirmed}
                  onClick={() => {
                    setRevealStep("confirm");
                    setConfirmAnswers({});
                  }}
                >
                  {t.seedContinueConfirm}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setPendingReveal(null);
                    setRevealStep("show");
                    setConfirmAnswers({});
                  }}
                >
                  {t.cancel}
                </button>
              </div>
            </>
          ) : (
            <div className="link-row">
              <button type="button" onClick={() => void handleContinueAfterReveal()}>
                {t.walletContinue}
              </button>
              <button type="button" className="ghost" onClick={() => setRevealStep("show")}>
                {t.seedBackToPhrase}
              </button>
            </div>
          )}
        </section>
      ) : session ? (
        <>
          <div className="wallet-tabs card" role="tablist" aria-label={t.walletTitle}>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "account"}
              className={panel === "account" ? "wallet-tab wallet-tab--active" : "wallet-tab"}
              onClick={() => setPanel("account")}
            >
              {t.walletTabAccount}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "send"}
              className={panel === "send" ? "wallet-tab wallet-tab--active" : "wallet-tab"}
              onClick={() => setPanel("send")}
            >
              {t.walletTabSend}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "history"}
              className={panel === "history" ? "wallet-tab wallet-tab--active" : "wallet-tab"}
              onClick={() => setPanel("history")}
            >
              {t.walletTabHistory}
            </button>
          </div>

          {panel === "account" && (
            <>
              <section className="card wallet-overview">
                <h2>{t.portfolioTitle}</h2>
                <p className="wallet-hint">{displaySessionLabel(session.label, t.walletSessionLabel)}</p>
                <dl className="detail-grid">
                  <div>
                    <dt>{t.portfolioAvailable}</dt>
                    <dd className="value-with-token">
                      <TokenIcon size={16} />
                      {account ? `${availableBalance.toFixed(4)} PPL` : t.loading}
                    </dd>
                  </div>
                  <div>
                    <dt>{t.portfolioLocked}</dt>
                    <dd>{lockedStake.toFixed(4)} PPL</dd>
                  </div>
                  <div>
                    <dt>{t.portfolioPendingReward}</dt>
                    <dd>{pendingEpochReward.toFixed(4)} PPL</dd>
                  </div>
                  <div>
                    <dt>{t.portfolioIncome24h}</dt>
                    <dd>{income24h.toFixed(4)} PPL</dd>
                  </div>
                  <div>
                    <dt>{t.portfolioIncomeEpoch}</dt>
                    <dd>{pendingEpochReward.toFixed(4)} PPL</dd>
                  </div>
                  <div>
                    <dt>{t.nonce}</dt>
                    <dd>{account?.nonce ?? "—"}</dd>
                  </div>
                </dl>
                <div className="portfolio-address-row">
                  <span className="mono">{session.address}</span>
                  <button type="button" className="ghost" onClick={() => void copyAddress(session.address)}>
                    {t.copyAddress}
                  </button>
                </div>
                {ownQrUrl && (
                  <div className="wallet-qr-block">
                    <img src={ownQrUrl} alt={t.walletAddressQrAlt} width={160} height={160} />
                    <p className="wallet-hint">{t.walletAddressQrHint}</p>
                  </div>
                )}
                {balanceHistory.length > 1 && (
                  <div className="balance-history">
                    <h3>{t.portfolioBalanceHistory}</h3>
                    <ul className="balance-history__list">
                      {balanceHistory.map((point) => (
                        <li key={`${point.at}-${point.label}`}>
                          <span>{point.label}</span>
                          <strong className="mono">{point.balance.toFixed(4)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="wallet-hint">{t.nonceHint}</p>
                <div className="link-row">
                  {showFaucet && (
                    <button className="ghost" onClick={() => void handleFaucet()} disabled={funding}>
                      {funding ? t.walletFaucetPending : t.walletFaucet}
                    </button>
                  )}
                  <Link to={addressPath(session.address)} className="ghost button-link">
                    {t.walletViewOnExplorer}
                  </Link>
                  <button type="button" className="cta" onClick={() => setPanel("send")}>
                    {t.walletTabSend}
                  </button>
                </div>
                {showFaucet && <p className="wallet-hint">{t.walletFaucetHint}</p>}
              </section>

              <section className="card">
                <h2>{t.addressBookTitle}</h2>
                <p className="wallet-hint">{t.addressBookHint}</p>
                {addressBook.length === 0 ? (
                  <p>{t.addressBookEmpty}</p>
                ) : (
                  <ul className="address-book-list">
                    {addressBook.map((entry) => (
                      <li key={entry.address}>
                        <button
                          type="button"
                          className="ghost address-book-pick"
                          onClick={() => {
                            setRecipient(entry.address);
                            setPanel("send");
                            setShowBatch(false);
                            setSendMode("single");
                          }}
                        >
                          <strong>{entry.label}</strong>
                          {entry.favorite ? " ★" : ""}
                          <span className="mono">{entry.address.slice(0, 14)}…</span>
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setAddressBook(toggleAddressFavorite(entry.address))}
                        >
                          {entry.favorite ? t.addressUnfavorite : t.addressFavorite}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setAddressBook(removeAddressBookEntry(entry.address))}
                        >
                          {t.remove}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card">
                <h2>{t.seedBackupTitle}</h2>
                <p className="wallet-hint">{t.seedBackupHint}</p>
                {session.persisted ? (
                  <form className="wallet-form" onSubmit={(e) => void handleExportBackup(e)}>
                    <label>
                      {t.walletPassword}
                      <input
                        type="password"
                        value={backupPassword}
                        onChange={(e) => setBackupPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <button type="submit">{t.seedBackupExport}</button>
                  </form>
                ) : (
                  <p className="wallet-hint">{t.seedBackupNeedSaved}</p>
                )}
                {backupPhrase && (
                  <div className="wallet-reveal">
                    <p className="wallet-hint">{t.seedRevealWarning}</p>
                    <pre className="mono seed-phrase">{backupPhrase}</pre>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setBackupPhrase(null);
                      }}
                    >
                      {t.seedBackupHide}
                    </button>
                  </div>
                )}
              </section>

              <section className="card earn-panel">
                <h2>{t.earnTitle}</h2>
                {!myValidator ? (
                  <>
                    <p className="lead">{t.earnNoValidatorYet}</p>
                    <p className="wallet-hint">{t.earnEmptyLead}</p>
                    <ol className="earn-steps">
                      {showFaucet && (
                      <li className={faucetDone ? "earn-step--done" : "earn-step--todo"}>
                        <span>
                          {t.earnStepFaucet}{" "}
                          <em>{faucetDone ? t.earnStepDone : t.earnStepTodo}</em>
                        </span>
                        <button
                          type="button"
                          className="ghost send-action-btn"
                          onClick={() => void handleFaucet()}
                          disabled={funding || faucetDone}
                        >
                          {funding ? t.walletFaucetPending : t.walletFaucet}
                        </button>
                      </li>
                      )}
                      <li className="earn-step--todo">
                        <span>
                          {t.earnStepLaunch} <em>{t.earnStepTodo}</em>
                        </span>
                        <Link to="/validators" className="cta button-link">
                          {t.launch}
                        </Link>
                      </li>
                      <li className={lightDeviceReady ? "earn-step--done" : "earn-step--todo"}>
                        <span>
                          {t.earnStepLight}{" "}
                          <em>{lightDeviceReady ? t.earnStepDone : t.earnStepWaiting}</em>
                        </span>
                        <Link to="/light" className="ghost button-link">
                          {t.lightClient}
                        </Link>
                      </li>
                      <li className={rewardSeen ? "earn-step--done" : "earn-step--todo"}>
                        <span>
                          {t.earnStepReward}{" "}
                          <em>{rewardSeen ? t.earnStepDone : t.earnStepWaiting}</em>
                        </span>
                      </li>
                    </ol>
                  </>
                ) : (
                  <>
                    <dl className="detail-grid">
                      <div>
                        <dt>{t.status}</dt>
                        <dd>
                          <span
                            className={`status-badge${
                              myValidator.status === "active" ? " status-badge--ok" : ""
                            }`}
                          >
                            {labelValidatorStatus(t, myValidator.status)}
                          </span>
                          {" · "}
                          {labelNodeKind(t, myValidator.nodeKind)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t.stake}</dt>
                        <dd>{myValidator.stake.toFixed(4)} PPL</dd>
                      </div>
                      <div>
                        <dt>{t.earnEpochReward}</dt>
                        <dd className="value-with-token">
                          <TokenIcon size={16} />
                          {currentEpochReward.toFixed(4)} PPL
                        </dd>
                      </div>
                      <div>
                        <dt>{t.aprEstimate}</dt>
                        <dd>{rewardShare.toFixed(2)}%</dd>
                      </div>
                      <div>
                        <dt>{t.uptime}</dt>
                        <dd>{myValidator.uptimeScore.toFixed(2)}</dd>
                      </div>
                      <div>
                        <dt>{t.attestScore}</dt>
                        <dd>{myValidator.attestationScore.toFixed(2)}</dd>
                      </div>
                      <div>
                        <dt>{t.earnLifetime}</dt>
                        <dd>{lifetimeTotal.toFixed(4)} PPL</dd>
                      </div>
                    </dl>
                    <p className="wallet-hint">{t.earnShareHint}</p>
                    <div className="link-row">
                      {isLightPath && (
                        <Link to="/light" className="cta button-link">
                          {t.earnKeepOnline}
                        </Link>
                      )}
                      <Link to="/staking" className="ghost button-link">
                        {t.earnManageStake}
                      </Link>
                      <Link to="/validators" className="ghost button-link">
                        {t.launch}
                      </Link>
                    </div>
                  </>
                )}
              </section>

              <section className="card earn-panel">
                <h2>{t.referralTitle}</h2>
                <p className="wallet-hint">{t.referralHint}</p>
                {displayGuestReferrer && (
                  <>
                    <p className="wallet-hint">
                      {onChainReferrer ? t.referralGuestOnChain : t.referralGuestBound}:{" "}
                      <span className="mono">{displayGuestReferrer}</span>
                    </p>
                    {!myValidator && (
                      <div className="link-row">
                        <Link to="/validators" className="cta button-link">
                          {t.referralGuestCta}
                        </Link>
                        <span className="wallet-hint">{t.referralGuestCtaHint}</span>
                      </div>
                    )}
                  </>
                )}
                <dl className="detail-grid">
                  <div className="detail-wide">
                    <dt>{t.referralLinkLabel}</dt>
                    <dd className="mono">{inviteLink || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t.referralCount}</dt>
                    <dd>{referredValidators.length}</dd>
                  </div>
                  <div>
                    <dt>{t.referralEpochBonus}</dt>
                    <dd>{referralEpochBonus.toFixed(4)} PPL</dd>
                  </div>
                </dl>
                <div className="link-row">
                  <button type="button" className="cta" onClick={() => void copyInviteLink()} disabled={!inviteLink}>
                    {t.referralCopy}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!inviteLink}
                    onClick={() => setShowInviteQr((prev) => !prev)}
                  >
                    {showInviteQr ? t.referralHideQr : t.referralShowQr}
                  </button>
                </div>
                {showInviteQr && inviteQrUrl && (
                  <p className="wallet-hint">
                    <img src={inviteQrUrl} alt={t.referralLinkLabel} width={180} height={180} />
                  </p>
                )}
                {referredValidators.length > 0 && (
                  <ul className="earn-steps" style={{ marginTop: 14 }}>
                    {referredValidators.slice(0, 8).map((item) => (
                      <li key={item.address}>
                        <Link to={addressPath(item.address)} className="mono">
                          {item.address.slice(0, 14)}…
                        </Link>
                        <span className="status-badge">{labelValidatorStatus(t, item.status)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(myValidator || myEpochRewards.length > 0) && (
                <section className="card">
                  <h2>{t.earnRecentRewards}</h2>
                  {myEpochRewards.length === 0 ? (
                    <p className="wallet-hint">{t.noRewards}</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t.epoch}</th>
                            <th>{t.rewards}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myEpochRewards.map((entry) => (
                            <tr key={entry.epoch}>
                              <td>{entry.epoch}</td>
                              <td>{entry.reward.toFixed(4)} PPL</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {panel === "send" && (
            <section className="card">
              <h2>{t.walletSendTitle}</h2>
              <div className="send-actions">
                <button
                  type="button"
                  className={`ghost send-action-btn${!showBatch ? " send-action-btn--active" : ""}`}
                  onClick={() => {
                    setShowBatch(false);
                    setSendMode("single");
                    feeTouchedRef.current = false;
                  }}
                >
                  {t.walletHideBatch}
                </button>
                <button
                  type="button"
                  className={`ghost send-action-btn${showBatch ? " send-action-btn--active" : ""}`}
                  onClick={() => {
                    setShowBatch(true);
                    setSendMode("batch");
                    feeTouchedRef.current = false;
                  }}
                >
                  {t.walletShowBatch}
                </button>
              </div>
              <form className="wallet-send-form" onSubmit={handleSend}>
                {sendMode === "single" ? (
                  <>
                    <label className="field-wide">
                      {t.to}
                      <input
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder={t.addressPlaceholder}
                        required
                      />
                      {recipientError && <span className="field-error">{recipientError}</span>}
                    </label>
                    {addressBook.filter((e) => e.favorite).length > 0 && (
                      <div className="send-actions">
                        {addressBook
                          .filter((entry) => entry.favorite)
                          .map((entry) => (
                            <button
                              key={entry.address}
                              type="button"
                              className="ghost send-action-btn"
                              onClick={() => setRecipient(entry.address)}
                            >
                              ★ {entry.label}
                            </button>
                          ))}
                      </div>
                    )}
                    <div className="send-actions">
                      <button type="button" className="ghost send-action-btn" onClick={handleSaveAddress}>
                        {t.addressBookSave}
                      </button>
                      <label className="ghost send-action-btn file-action">
                        {t.qrScanFile}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => void handleScanQrFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <button
                        type="button"
                        className="ghost send-action-btn"
                        onClick={() =>
                          void navigator.clipboard
                            .readText()
                            .then((text) => setRecipient(text.trim()))
                            .catch(() => notify.error(t.walletPasteFailed))
                        }
                      >
                        {t.walletPaste}
                      </button>
                      <button
                        type="button"
                        className="ghost send-action-btn"
                        onClick={() => {
                          setRecipient("");
                          setAmount("0");
                          setMemo("");
                        }}
                      >
                        {t.walletClear}
                      </button>
                    </div>
                    <label>
                      {t.addressBookLabel}
                      <input
                        value={bookLabel}
                        onChange={(e) => setBookLabel(e.target.value)}
                        placeholder={t.addressBookLabelPlaceholder}
                      />
                    </label>
                    <label>
                      {t.amount}
                      <span className="input-with-action">
                        <input
                          type="number"
                          min={0.0001}
                          step="0.0001"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          className="ghost input-action-btn"
                          onClick={() => setAmount(Math.max(0, (account?.balance ?? 0) - feeNumber).toFixed(4))}
                        >
                          {t.walletMax}
                        </button>
                      </span>
                      {amountError && <span className="field-error">{amountError}</span>}
                    </label>
                  </>
                ) : (
                  <>
                    <label className="field-wide">
                      {t.walletBatchTitle}
                      <textarea
                        rows={6}
                        value={batchText}
                        onChange={(e) => {
                          setBatchText(e.target.value);
                          feeTouchedRef.current = false;
                          setCsvPreview(parseBatchCsv(e.target.value, MAX_BATCH_RECIPIENTS));
                        }}
                        placeholder={t.walletBatchPlaceholder}
                        required
                      />
                      <span className="wallet-hint">{t.walletBatchHint}</span>
                      {batchError && <span className="field-error">{batchError}</span>}
                    </label>
                    <div className="send-actions">
                      <label className="ghost send-action-btn file-action">
                        {t.batchCsvImport}
                        <input
                          type="file"
                          accept=".csv,text/csv,text/plain"
                          hidden
                          onChange={(e) => handleCsvFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      {batchReportReady && (
                        <button
                          type="button"
                          className="ghost send-action-btn"
                          onClick={() =>
                            downloadTextFile(`ovn-batch-${Date.now()}.csv`, batchReportReady)
                          }
                        >
                          {t.batchCsvDownloadReport}
                        </button>
                      )}
                    </div>
                    {csvPreview && (
                      <p className="wallet-hint">
                        {t.batchCsvSummary
                          .replace("{ok}", String(csvPreview.valid.length))
                          .replace("{bad}", String(csvPreview.invalidCount))
                          .replace("{total}", csvPreview.totalAmount.toFixed(4))}
                      </p>
                    )}
                    <p className="wallet-hint">
                      {t.walletBatchCount}: {batchRecipients?.length ?? 0} / {MAX_BATCH_RECIPIENTS}
                      {" · "}
                      {t.amount}: {batchAmount.toFixed(4)} PPL
                    </p>
                  </>
                )}
                <fieldset className="fee-tier-fieldset">
                  <legend>{t.feeTierTitle}</legend>
                  {(["economy", "normal", "fast"] as FeeTier[]).map((tier) => (
                    <label key={tier} className="wallet-checkbox">
                      <input
                        type="radio"
                        name="feeTier"
                        checked={feeTier === tier}
                        onChange={() => {
                          feeTouchedRef.current = false;
                          setFeeTier(tier);
                        }}
                      />
                      {tier === "economy"
                        ? t.feeTierEconomy
                        : tier === "fast"
                          ? t.feeTierFast
                          : t.feeTierNormal}{" "}
                      <span className="mono">({tierFees[tier].toFixed(3)} PPL)</span>
                    </label>
                  ))}
                  <p className="wallet-hint">
                    {t.feeInclusionEstimate
                      .replace("{min}", String(inclusionEstimate.minSec))
                      .replace("{max}", String(inclusionEstimate.maxSec))}
                  </p>
                </fieldset>
                <label className="field-wide">
                  {t.fee}
                  <div className="input-action-row">
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={fee}
                      onChange={(e) => {
                        feeTouchedRef.current = true;
                        setFee(e.target.value);
                        setFeeTier(classifyFeeTier(Number(e.target.value), recommendedFee));
                      }}
                      required
                    />
                    <button
                      type="button"
                      className="ghost send-action-btn"
                      onClick={() => {
                        feeTouchedRef.current = false;
                        setFeeTier("normal");
                        setFee(tierFees.normal.toFixed(3));
                      }}
                    >
                      {t.walletUseRecommendedFee}
                    </button>
                  </div>
                  <span className="wallet-hint">
                    {t.walletRecommendedFee}: {tierFees.normal.toFixed(3)} PPL
                    {" · "}
                    {t.walletFeePriorityHint}
                  </span>
                  {feeError && <span className="field-error">{feeError}</span>}
                </label>
                {sendMode === "single" && (
                  <label className="field-wide">
                    {t.memo}
                    <input
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder={t.memoPlaceholder}
                      maxLength={MAX_TX_MEMO_LENGTH}
                    />
                    <span className="wallet-hint">
                      {memo.length}/{MAX_TX_MEMO_LENGTH}
                    </span>
                    {memoError && <span className="field-error">{memoError}</span>}
                  </label>
                )}
                <div className="send-summary send-summary--sticky">
                  <div>
                    <span>{t.total}</span>
                    <strong className="mono">{totalValue.toFixed(4)} PPL</strong>
                  </div>
                  <div>
                    <span>{t.walletBalance}</span>
                    <strong className="mono">{(account?.balance ?? 0).toFixed(4)} PPL</strong>
                  </div>
                  <div>
                    <span>{t.walletBalanceAfter}</span>
                    <strong className="mono">{(remainingBalance > 0 ? remainingBalance : 0).toFixed(4)} PPL</strong>
                  </div>
                </div>
                {balanceError && <p className="field-error">{balanceError}</p>}
                <button type="submit" disabled={sendDisabled}>
                  {sending ? t.walletSending : t.walletSend}
                </button>
              </form>
            </section>
          )}

          {panel === "history" && (
            <>
              <section className="card">
                <h2>{t.txQueueTitle}</h2>
                <p className="wallet-hint">{t.txQueueHint}</p>
                {txQueue.length === 0 ? (
                  <p>{t.txQueueEmpty}</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.status}</th>
                          <th>{t.to}</th>
                          <th>{t.amount}</th>
                          <th className="hide-mobile">{t.txQueueConfirmations}</th>
                          <th scope="col">{t.actions}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txQueue.map((item) => (
                          <tr key={item.localId}>
                            <td>
                              {item.status === "pending"
                                ? t.txStatusPending
                                : item.status === "included"
                                  ? t.txStatusIncluded
                                  : item.status === "finalized"
                                    ? t.txStatusFinalized
                                    : t.txStatusFailed}
                            </td>
                            <td className="mono">{item.to.slice(0, 12)}…</td>
                            <td>{item.amount.toFixed(4)}</td>
                            <td className="hide-mobile">
                              {item.confirmations ?? "—"}
                              {item.txId ? (
                                <>
                                  {" · "}
                                  <Link to={`/tx/${item.txId}`}>{item.txId.slice(0, 8)}…</Link>
                                </>
                              ) : null}
                            </td>
                            <td>
                              {(item.status === "failed" || item.status === "pending") && (
                                <button
                                  type="button"
                                  className="ghost"
                                  disabled={sending}
                                  onClick={() => void confirmSend(item)}
                                >
                                  {t.txQueueRetry}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            <section className="card">
              <h2>{t.walletHistory}</h2>
              <div className="wallet-tabs" role="tablist" aria-label={t.filter}>
                {(
                  [
                    ["all", t.historyFilterAll],
                    ["transfers", t.historyFilterTransfers],
                    ["validator", t.historyFilterValidator]
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={historyFilter === id}
                    className={historyFilter === id ? "wallet-tab wallet-tab--active" : "wallet-tab"}
                    onClick={() => setHistoryFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {filteredHistory.length === 0 ? (
                <p>{t.noTransactions}</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t.txId}</th>
                        <th>{t.block}</th>
                        <th className="hide-mobile">{t.type}</th>
                        <th className="hide-mobile">{t.from}</th>
                        <th className="hide-mobile">{t.to}</th>
                        <th>{t.amount}</th>
                        <th className="hide-mobile">{t.memo}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((tx) => (
                        <tr key={tx.id}>
                          <td>
                            <Link to={`/tx/${tx.id}`} className="table-link" aria-label={`${t.openTxAria} ${tx.id}`}>
                              {tx.id.slice(0, 12)}...
                            </Link>
                          </td>
                          <td>
                            <Link to={`/block/${tx.blockHeight}`} className="table-link">
                              {tx.blockHeight}
                            </Link>
                          </td>
                          <td className="hide-mobile">{labelTxType(t, tx.type)}</td>
                          <td className="mono hide-mobile">{tx.from.slice(0, 10)}...</td>
                          <td className="mono hide-mobile">{tx.to.slice(0, 10)}...</td>
                          <td>{tx.amount}</td>
                          <td className="hide-mobile">{formatPaymentMemos(tx) ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            </>
          )}
        </>
      ) : null}
      <ConfirmDialog
        open={logoutConfirmOpen}
        title={t.walletLock}
        message={t.walletLogoutConfirm}
        confirmLabel={t.walletLock}
        cancelLabel={t.cancel}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLock}
      />
      <ConfirmDialog
        open={Boolean(removeWalletId)}
        title={t.walletRemove}
        message={t.walletRemoveConfirm}
        confirmLabel={t.walletRemove}
        cancelLabel={t.cancel}
        onCancel={() => setRemoveWalletId(null)}
        onConfirm={() => handleRemoveWallet(removeWalletId)}
      />
      <ConfirmDialog
        open={Boolean(sendDraft)}
        title={sendDraft?.recipients?.length ? t.walletConfirmBatch : t.walletSendConfirmTitle}
        message={
          sendDraft
            ? (
                <div className="confirm-transfer">
                  {sendDraft.recipients?.length ? (
                    <>
                      <div>
                        <span>{t.walletBatchCount}</span>
                        <strong>{sendDraft.recipients.length}</strong>
                      </div>
                      <div className="detail-wide">
                        <span>{t.memo}</span>
                        <strong>
                          {sendDraft.recipients
                            .map((item) => item.memo)
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <div>
                      <span>{t.to}</span>
                      <strong className="mono">{sendDraft.to}</strong>
                    </div>
                  )}
                  <div><span>{t.amount}</span><strong>{sendDraft.amount.toFixed(4)} PPL</strong></div>
                  <div><span>{t.fee}</span><strong>{sendDraft.fee.toFixed(4)} PPL</strong></div>
                  <div>
                    <span>{t.feeTierTitle}</span>
                    <strong>
                      {sendDraft.tier === "economy"
                        ? t.feeTierEconomy
                        : sendDraft.tier === "fast"
                          ? t.feeTierFast
                          : t.feeTierNormal}
                    </strong>
                  </div>
                  <div>
                    <span>{t.feeInclusionEstimateLabel}</span>
                    <strong>
                      {t.feeInclusionEstimate
                        .replace("{min}", String(inclusionEstimate.minSec))
                        .replace("{max}", String(inclusionEstimate.maxSec))}
                    </strong>
                  </div>
                  <div><span>{t.total}</span><strong>{sendDraft.total.toFixed(4)} PPL</strong></div>
                  <div><span>{t.walletBalanceAfter}</span><strong>{sendDraft.remaining.toFixed(4)} PPL</strong></div>
                  {!sendDraft.recipients?.length && sendDraft.memo && (
                    <div><span>{t.memo}</span><strong>{sendDraft.memo}</strong></div>
                  )}
                </div>
              )
            : ""
        }
        confirmLabel={t.walletSend}
        cancelLabel={t.cancel}
        onCancel={() => setSendDraft(null)}
        onConfirm={() => void confirmSend()}
      />
    </>
  );
}
