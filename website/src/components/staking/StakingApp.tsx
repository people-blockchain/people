"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatEther, parseEther, type Hex } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { stakingCopy } from "@/lib/staking-content";
import { uxCopy, fill } from "@/lib/ux-copy";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import {
  BOND_STATUS,
  DISTRIBUTION_PRECOMPILE_ADDRESS,
  STAKING_PRECOMPILE_ADDRESS,
  distributionAbi,
  stakingAbi,
  type PrecompileValidator,
} from "@/lib/evm/staking-abi";
import { commissionPercent, coinToPpl, decCoinToPpl, estimateAprPercent, networkSharePercent, secondsToDaysLabel } from "@/lib/staking-math";
import { toValoperAddress } from "@/lib/evm/staking-address";

/** SDK default; our testnet genesis doesn't currently override staking.params.unbonding_time. */
const UNBONDING_TIME_SECONDS = 1_814_400;
/** Rough epochs/year used only for the APR *estimate* label, never shown as a promise. */
const EPOCHS_PER_YEAR = 365;
const EMPTY_PAGE_REQUEST = { key: "0x" as Hex, offset: BigInt(0), limit: BigInt(100), countTotal: true, reverse: false };

const inputClass =
  "mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-3 text-lg font-semibold text-ink outline-none focus:border-brand";
const ctaBtn =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink hover:opacity-90 disabled:opacity-50";
const ghostBtn =
  "min-h-9 rounded-lg border border-line px-3 text-xs font-semibold text-ink-2 hover:border-brand hover:text-ink disabled:opacity-40";

type ValidatorRow = PrecompileValidator & {
  myStakePpl: number;
  myRewardPpl: number;
  pendingUnbonding: { balancePpl: number; completionTime: bigint }[];
};

function isZeroDataError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("returned no data");
}

export function StakingApp() {
  const { lang } = useLanguage();
  const t = stakingCopy[lang];
  const u = uxCopy[lang];
  const { session } = useWallet();
  const { signer, connectEmbedded } = useExternalWallet();

  const [validators, setValidators] = useState<readonly PrecompileValidator[]>([]);
  const [totalBondedTokens, setTotalBondedTokens] = useState<bigint>(BigInt(0));
  const [myStake, setMyStake] = useState<Record<string, number>>({});
  const [myRewards, setMyRewards] = useState<Record<string, number>>({});
  const [myUnbondings, setMyUnbondings] = useState<Record<string, { balancePpl: number; completionTime: bigint }[]>>({});
  const [precompileActive, setPrecompileActive] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [notice, setNotice] = useState("");

  const [delegateTarget, setDelegateTarget] = useState<PrecompileValidator | null>(null);
  const [undelegateTarget, setUndelegateTarget] = useState<PrecompileValidator | null>(null);
  const [redelegateTarget, setRedelegateTarget] = useState<PrecompileValidator | null>(null);
  const [amountText, setAmountText] = useState("");
  const [redelegateDst, setRedelegateDst] = useState("");

  useEffect(() => {
    if (session && !signer) connectEmbedded();
  }, [session, signer, connectEmbedded]);

  const loadValidators = useCallback(async () => {
    try {
      const [rows] = await readPublicClient().readContract({
        address: STAKING_PRECOMPILE_ADDRESS,
        abi: stakingAbi,
        functionName: "validators",
        args: ["", EMPTY_PAGE_REQUEST],
      });
      // Precompile returns hex operators; every write/read below needs bech32 (see staking-address.ts).
      setValidators(rows.map((v) => ({ ...v, operatorAddress: toValoperAddress(v.operatorAddress) })));
      setTotalBondedTokens(rows.filter((v) => v.status === 3).reduce((sum, v) => sum + v.tokens, BigInt(0)));
      setPrecompileActive(true);
      setReachable(true);
    } catch (err) {
      if (isZeroDataError(err)) {
        setPrecompileActive(false);
      } else {
        setReachable(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadValidators();
    const id = setInterval(() => void loadValidators(), 15_000);
    return () => clearInterval(id);
  }, [loadValidators]);

  const loadMyPosition = useCallback(async () => {
    if (!signer || !precompileActive || validators.length === 0) {
      setMyStake({});
      setMyRewards({});
      setMyUnbondings({});
      return;
    }
    const client = readPublicClient();
    try {
      const [rewardRows] = await client.readContract({
        address: DISTRIBUTION_PRECOMPILE_ADDRESS,
        abi: distributionAbi,
        functionName: "delegationTotalRewards",
        args: [signer.address],
      });
      const rewards: Record<string, number> = {};
      for (const row of rewardRows) {
        rewards[toValoperAddress(row.validatorAddress)] = row.reward.reduce((sum, coin) => sum + decCoinToPpl(coin.amount, coin.precision), 0);
      }
      setMyRewards(rewards);

      const stakeEntries = await Promise.all(
        validators.map(async (v) => {
          const [, balance] = await client.readContract({
            address: STAKING_PRECOMPILE_ADDRESS,
            abi: stakingAbi,
            functionName: "delegation",
            args: [signer.address, v.operatorAddress],
          });
          return [v.operatorAddress, coinToPpl(balance.amount)] as const;
        })
      );
      setMyStake(Object.fromEntries(stakeEntries.filter(([, ppl]) => ppl > 0)));

      const unbondingEntries = await Promise.all(
        validators.map(async (v) => {
          const unbonding = await client.readContract({
            address: STAKING_PRECOMPILE_ADDRESS,
            abi: stakingAbi,
            functionName: "unbondingDelegation",
            args: [signer.address, v.operatorAddress],
          });
          const entries = unbonding.entries.map((e) => ({ balancePpl: coinToPpl(e.balance), completionTime: e.completionTime }));
          return [v.operatorAddress, entries] as const;
        })
      );
      setMyUnbondings(Object.fromEntries(unbondingEntries.filter(([, entries]) => entries.length > 0)));
    } catch {
      // Best-effort: validator list already rendered; leave positions at their last-known value.
    }
  }, [signer, precompileActive, validators]);

  useEffect(() => {
    void loadMyPosition();
    const id = setInterval(() => void loadMyPosition(), 15_000);
    return () => clearInterval(id);
  }, [loadMyPosition]);

  const rows: ValidatorRow[] = useMemo(
    () =>
      validators.map((v) => ({
        ...v,
        myStakePpl: myStake[v.operatorAddress] ?? 0,
        myRewardPpl: myRewards[v.operatorAddress] ?? 0,
        pendingUnbonding: myUnbondings[v.operatorAddress] ?? [],
      })),
    [validators, myStake, myRewards, myUnbondings]
  );

  const myDelegations = rows.filter((r) => r.myStakePpl > 0);
  const pendingUnbondings = rows.flatMap((r) => r.pendingUnbonding.map((e) => ({ ...e, validator: r })));
  const totalPendingRewards = rows.reduce((sum, r) => sum + r.myRewardPpl, 0);

  const statusLabel = (status: number, jailed: boolean) => {
    if (jailed) return t.jailed;
    switch (BOND_STATUS[status]) {
      case "Bonded":
        return t.statusBonded;
      case "Unbonding":
        return t.statusUnbonding;
      case "Unbonded":
        return t.statusUnbonded;
      default:
        return t.statusUnspecified;
    }
  };

  const closeModals = () => {
    setDelegateTarget(null);
    setUndelegateTarget(null);
    setRedelegateTarget(null);
    setAmountText("");
    setRedelegateDst("");
    setError("");
  };

  const refreshAfterTx = async () => {
    await Promise.all([loadValidators(), loadMyPosition()]);
  };

  const submitDelegate = async () => {
    if (!signer || !delegateTarget) return;
    let amountWei: bigint;
    try {
      amountWei = parseEther(amountText.trim());
      if (amountWei <= BigInt(0)) throw new Error("invalid");
    } catch {
      setError(u.enterAmount);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const hash = await writeViaActiveSigner(signer, {
        address: STAKING_PRECOMPILE_ADDRESS,
        abi: stakingAbi,
        functionName: "delegate",
        args: [signer.address, delegateTarget.operatorAddress, amountWei],
      });
      setTxHash(hash as Hex);
      setNotice(t.delegateSuccess);
      closeModals();
      await refreshAfterTx();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delegateError);
    } finally {
      setBusy(false);
    }
  };

  const submitUndelegate = async () => {
    if (!signer || !undelegateTarget) return;
    let amountWei: bigint;
    try {
      amountWei = parseEther(amountText.trim());
      if (amountWei <= BigInt(0)) throw new Error("invalid");
    } catch {
      setError(u.enterAmount);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const hash = await writeViaActiveSigner(signer, {
        address: STAKING_PRECOMPILE_ADDRESS,
        abi: stakingAbi,
        functionName: "undelegate",
        args: [signer.address, undelegateTarget.operatorAddress, amountWei],
      });
      setTxHash(hash as Hex);
      setNotice(t.undelegateSuccess);
      closeModals();
      await refreshAfterTx();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.undelegateError);
    } finally {
      setBusy(false);
    }
  };

  const submitRedelegate = async () => {
    if (!signer || !redelegateTarget || !redelegateDst) return;
    let amountWei: bigint;
    try {
      amountWei = parseEther(amountText.trim());
      if (amountWei <= BigInt(0)) throw new Error("invalid");
    } catch {
      setError(u.enterAmount);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const hash = await writeViaActiveSigner(signer, {
        address: STAKING_PRECOMPILE_ADDRESS,
        abi: stakingAbi,
        functionName: "redelegate",
        args: [signer.address, redelegateTarget.operatorAddress, redelegateDst, amountWei],
      });
      setTxHash(hash as Hex);
      setNotice(t.redelegateSuccess);
      closeModals();
      await refreshAfterTx();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.redelegateError);
    } finally {
      setBusy(false);
    }
  };

  const claimAll = async () => {
    if (!signer) return;
    setBusy(true);
    setError("");
    try {
      const hash = await writeViaActiveSigner(signer, {
        address: DISTRIBUTION_PRECOMPILE_ADDRESS,
        abi: distributionAbi,
        functionName: "claimRewards",
        args: [signer.address, 100],
      });
      setTxHash(hash as Hex);
      setNotice(t.claimRewardsSuccess);
      await refreshAfterTx();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.claimRewardsError);
    } finally {
      setBusy(false);
    }
  };

  if (!precompileActive) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <Eyebrow>{t.tag}</Eyebrow>
        <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-6 text-lead text-ink-2">{t.notReady}</p>
      </section>
    );
  }

  const showConnect = !signer && !session;
  const unbondingDays = secondsToDaysLabel(UNBONDING_TIME_SECONDS);

  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <Eyebrow>{t.tag}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.title}</h1>
      <p className="mt-3 max-w-2xl text-lead text-ink-2">{t.lead}</p>
      <Chip tone="value" className="mt-4">{t.networkBadge}</Chip>
      {!reachable ? <p className="mt-4 text-sm text-warm">{t.unreachable}</p> : null}

      {showConnect ? (
        <div className="surface-elevated mt-8 rounded-2xl p-6 text-center">
          <p className="text-ink-2">{t.connectPrompt}</p>
          <div className="mt-4 flex justify-center">
            <ConnectWalletMenu />
          </div>
        </div>
      ) : null}

      {signer ? (
        <div className="surface-elevated mt-8 rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">{t.myDelegationsTitle}</h2>
            <div className="text-sm text-ink-2">
              {t.totalRewardsLabel}: <strong className="text-ink">{totalPendingRewards.toFixed(6)} PPL</strong>
            </div>
          </div>
          {myDelegations.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">{t.myDelegationsEmpty}</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-ink-3">
                  <tr>
                    <th className="px-4 py-3">{t.colMoniker}</th>
                    <th className="px-4 py-3">{t.myStakeLabel}</th>
                    <th className="px-4 py-3">{t.myRewardsLabel}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {myDelegations.map((row) => (
                    <tr key={row.operatorAddress} className="border-t border-line">
                      <td className="px-4 py-3">{row.description || row.operatorAddress}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">{row.myStakePpl.toFixed(4)} PPL</td>
                      <td className="px-4 py-3 font-mono tabular-nums">{row.myRewardPpl.toFixed(6)} PPL</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={ghostBtn} onClick={() => setUndelegateTarget(row)}>
                            {t.undelegateButton}
                          </button>
                          <button type="button" className={ghostBtn} onClick={() => setRedelegateTarget(row)}>
                            {t.redelegateButton}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4">
            <button type="button" className={ctaBtn} disabled={busy || totalPendingRewards <= 0} onClick={() => void claimAll()}>
              {busy ? t.claimRewardsSending : t.claimRewardsButton}
            </button>
          </div>

          {pendingUnbondings.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-ink">{t.pendingUnbondingsTitle}</h3>
              <ul className="mt-2 space-y-1 text-sm text-ink-2">
                {pendingUnbondings.map((entry, i) => (
                  <li key={i}>
                    {entry.validator.description || entry.validator.operatorAddress} · {entry.balancePpl.toFixed(4)} PPL ·{" "}
                    {t.completesOn}: {new Date(Number(entry.completionTime) * 1000).toLocaleString(lang)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="surface-elevated mt-8 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-ink">{t.validatorsTitle}</h2>
        <p className="mt-1 text-xs text-ink-3">
          {t.networkStakeLabel}: {Number(formatEther(totalBondedTokens)).toFixed(0)} PPL
        </p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-ink-3">{t.validatorsEmpty}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-4 py-3">{t.colMoniker}</th>
                  <th className="px-4 py-3">{t.colCommission}</th>
                  <th className="px-4 py-3">{t.colStake}</th>
                  <th className="px-4 py-3">{t.colApr}</th>
                  <th className="px-4 py-3">{t.colStatus}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const commissionPct = commissionPercent(row.commission);
                  const stakePpl = coinToPpl(row.tokens);
                  const apr = estimateAprPercent(row.myRewardPpl, row.myStakePpl, commissionPct, EPOCHS_PER_YEAR);
                  const active = row.status === 3 && !row.jailed;
                  return (
                    <tr key={row.operatorAddress} className="border-t border-line">
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm font-semibold text-ink">{row.operatorAddress}</div>
                        {row.description ? <div className="text-xs text-ink-3">{row.description}</div> : null}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">{commissionPct.toFixed(2)}%</td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {stakePpl.toFixed(0)} PPL
                        <div className="text-xs text-ink-3">{networkSharePercent(row.tokens, totalBondedTokens).toFixed(2)}%</div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums" title={t.aprDisclaimer}>
                        {row.myStakePpl > 0 ? `~${apr.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            active ? "bg-value/10 text-value" : "bg-surface-2 text-ink-3"
                          }`}
                        >
                          {statusLabel(row.status, row.jailed)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {signer ? (
                          <button type="button" className={ghostBtn} onClick={() => setDelegateTarget(row)}>
                            {t.delegateButton}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-3">{t.aprDisclaimer}</p>
      </div>

      {txHash ? (
        <p className="mt-4 text-sm text-value" role="status">
          {notice ? <>{notice} </> : null}
          {t.txLink}:{" "}
          <Link href={`/explorer/tx/${txHash}`} className="underline">
            {txHash.slice(0, 18)}…
          </Link>
        </p>
      ) : null}

      {delegateTarget ? (
        <WalletDialog title={fill(t.delegateTitle, { validator: delegateTarget.description || delegateTarget.operatorAddress })} onClose={closeModals} busy={busy}>
          <label className="block text-sm text-ink-2">{t.amountLabel}</label>
          <input
            className={inputClass}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(",", "."))}
            placeholder="0"
            inputMode="decimal"
            autoComplete="off"
          />
          {error ? <p className="mt-2 text-sm text-warm">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={ghostBtn} onClick={closeModals} disabled={busy}>
              {t.cancel}
            </button>
            <button type="button" className={ctaBtn} onClick={() => void submitDelegate()} disabled={busy}>
              {busy ? t.delegateSending : t.delegateConfirm}
            </button>
          </div>
        </WalletDialog>
      ) : null}

      {undelegateTarget ? (
        <WalletDialog
          title={fill(t.undelegateConfirmTitle, { validator: undelegateTarget.description || undelegateTarget.operatorAddress })}
          onClose={closeModals}
          busy={busy}
        >
          <p className="rounded-xl border border-warm/50 bg-warm/10 px-3 py-2 text-sm text-warm">
            {fill(t.undelegateWarning, { days: unbondingDays })}
          </p>
          <label className="mt-4 block text-sm text-ink-2">{t.amountLabel}</label>
          <input
            className={inputClass}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(",", "."))}
            placeholder="0"
            inputMode="decimal"
            autoComplete="off"
          />
          {error ? <p className="mt-2 text-sm text-warm">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={ghostBtn} onClick={closeModals} disabled={busy}>
              {t.cancel}
            </button>
            <button type="button" className={ctaBtn} onClick={() => void submitUndelegate()} disabled={busy}>
              {busy ? t.undelegateSending : t.undelegateConfirm}
            </button>
          </div>
        </WalletDialog>
      ) : null}

      {redelegateTarget ? (
        <WalletDialog title={fill(t.redelegateTitle, { validator: redelegateTarget.description || redelegateTarget.operatorAddress })} onClose={closeModals} busy={busy}>
          <p className="text-sm text-ink-3">{t.redelegateHint}</p>
          <label className="mt-4 block text-sm text-ink-2">{t.redelegateToLabel}</label>
          <select
            className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-3 text-ink outline-none focus:border-brand"
            value={redelegateDst}
            onChange={(e) => setRedelegateDst(e.target.value)}
          >
            <option value="">—</option>
            {validators
              .filter((v) => v.operatorAddress !== redelegateTarget.operatorAddress)
              .map((v) => (
                <option key={v.operatorAddress} value={v.operatorAddress}>
                  {v.description || v.operatorAddress}
                </option>
              ))}
          </select>
          <label className="mt-4 block text-sm text-ink-2">{t.amountLabel}</label>
          <input
            className={inputClass}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(",", "."))}
            placeholder="0"
            inputMode="decimal"
            autoComplete="off"
          />
          {error ? <p className="mt-2 text-sm text-warm">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={ghostBtn} onClick={closeModals} disabled={busy}>
              {t.cancel}
            </button>
            <button type="button" className={ctaBtn} onClick={() => void submitRedelegate()} disabled={busy || !redelegateDst}>
              {busy ? t.redelegateSending : t.redelegateConfirm}
            </button>
          </div>
        </WalletDialog>
      ) : null}
    </section>
  );
}
