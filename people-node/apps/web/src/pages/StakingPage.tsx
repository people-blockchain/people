import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RewardDistribution } from "@ovn/protocol";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { labelValidatorStatus } from "../i18n.js";
import { useWallet } from "../WalletContext.js";
import { useLive } from "../LiveContext.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ovn } from "../ovnClient.js";
import { useDeviceVault } from "../DeviceVaultContext.js";
import { TokenIcon } from "../TokenIcon.js";
import {
  forecastAprPercent,
  networkSharePercent,
  realizedAprPercent,
  totalActiveStake
} from "../yieldMath.js";

export function StakingPage() {
  const { t } = usePrefs();
  const notify = useNotify();
  const { session } = useWallet();
  const { devices, getUnlockedKeyByAddress } = useDeviceVault();
  const { rewards, snapshot, metrics } = useLive();
  const [rewardHistory, setRewardHistory] = useState<RewardDistribution[]>([]);
  const [confirmAction, setConfirmAction] = useState<"leave" | "unstake" | null>(null);

  const address = session?.address ?? devices[0]?.address;
  const privateKey =
    session?.privateKey ?? (address ? getUnlockedKeyByAddress(address) : undefined);
  const validator = snapshot?.validators.find((item) => item.address === address) ?? null;
  const isLight =
    validator?.nodeKind === "light" || devices.some((d) => d.address === address && d.kind === "light");
  const isUnbonding = validator?.status === "unbonding";

  useEffect(() => {
    ovn
      .getRewardHistory(30)
      .then(setRewardHistory)
      .catch(() => setRewardHistory([]));
  }, [rewards?.epoch]);

  async function resolveNonce(): Promise<number> {
    if (!address) {
      return 0;
    }
    const account = await ovn.getAddress(address);
    return account.nonce;
  }

  async function leave() {
    if (!privateKey) {
      notify.error(session ? t.deviceUnlockRequired : t.walletImportFailed);
      return;
    }
    try {
      const nonce = await resolveNonce();
      const result = await ovn.leaveValidator(privateKey, nonce);
      if (!result.accepted) {
        throw new Error(result.error ?? t.leaveFailed);
      }
      notify.success(t.leaveValidator);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.leaveFailed);
    }
  }

  async function claim() {
    if (!privateKey) {
      notify.error(session ? t.deviceUnlockRequired : t.walletImportFailed);
      return;
    }
    try {
      const nonce = await resolveNonce();
      const result = await ovn.unstake(privateKey, nonce);
      if (!result.accepted) {
        throw new Error(result.error ?? t.unstakeFailed);
      }
      notify.success(t.unstake);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.unstakeFailed);
    }
  }

  const activeStake = useMemo(
    () => totalActiveStake(snapshot?.validators ?? []),
    [snapshot?.validators]
  );

  const myEpochRewards = rewardHistory.map((entry) => ({
    epoch: entry.epoch,
    reward: entry.rewards[address ?? ""] ?? 0,
    total: entry.totalReward
  }));

  const rewardedEpochs = myEpochRewards.filter((entry) => entry.reward > 0);
  const currentEpochReward = rewards && address ? (rewards.rewards[address] ?? 0) : 0;
  const lifetimeTotal = myEpochRewards.reduce((sum, entry) => sum + entry.reward, 0);
  const stake = validator?.stake ?? 0;
  const share = networkSharePercent(stake, activeStake);
  const forecastApr = forecastAprPercent(currentEpochReward, stake);
  const realizedApr = realizedAprPercent(
    lifetimeTotal,
    stake,
    Math.max(1, rewardedEpochs.length)
  );
  const poolShare =
    rewards && address && rewards.totalReward > 0
      ? ((rewards.rewards[address] ?? 0) / rewards.totalReward) * 100
      : 0;

  return (
    <>
      <PageMeta title={t.yieldTitle} description={t.yieldDescription} />
      <section className="card page-header">
        <h1>{t.yieldTitle}</h1>
        <p className="lead">{t.yieldDescription}</p>
      </section>
      {!address ? (
        <section className="card">
          <p>{t.walletLoginHint}</p>
          <Link to="/wallet" className="cta button-link">
            {t.openCabinet}
          </Link>
        </section>
      ) : (
        <section className="card">
          <h2>{t.yieldDashboard}</h2>
          <dl className="detail-grid">
            <div>
              <dt>{t.walletAddress}</dt>
              <dd>
                {validator ? (
                  <Link className="mono table-link" to={`/validator/${address}`}>
                    {address}
                  </Link>
                ) : (
                  <span className="mono">{address}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>{t.status}</dt>
              <dd>
                <span className={`status-badge${validator?.status === "active" ? " status-badge--ok" : ""}`}>
                  {validator?.status ? labelValidatorStatus(t, validator.status) : "—"}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t.stake}</dt>
              <dd className="value-with-token">
                <TokenIcon size={16} />
                {validator ? `${stake.toFixed(4)} PPL` : "—"}
              </dd>
            </div>
            <div>
              <dt>{t.uptime}</dt>
              <dd>{validator ? validator.uptimeScore.toFixed(3) : "—"}</dd>
            </div>
            <div>
              <dt>{t.attestScore}</dt>
              <dd>{validator ? validator.attestationScore.toFixed(3) : "—"}</dd>
            </div>
            <div>
              <dt>{t.yieldNetworkShare}</dt>
              <dd>{share.toFixed(2)}%</dd>
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
              <dd>{poolShare.toFixed(2)}%</dd>
            </div>
            <div>
              <dt>{t.yieldForecastApr}</dt>
              <dd>{forecastApr.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>{t.yieldRealizedApr}</dt>
              <dd>{realizedApr.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>{t.earnLifetime}</dt>
              <dd>{lifetimeTotal.toFixed(4)} PPL</dd>
            </div>
            <div>
              <dt>{t.epoch}</dt>
              <dd>{metrics?.epoch ?? rewards?.epoch ?? "—"}</dd>
            </div>
            {isUnbonding && (
              <div>
                <dt>{t.stakeClaimable}</dt>
                <dd>{validator ? `${validator.stake.toFixed(4)} PPL` : "—"}</dd>
              </div>
            )}
          </dl>
          <p className="wallet-hint">{t.yieldAprHint}</p>
          {isUnbonding && <p className="wallet-hint">{t.stakeUnbondingHint}</p>}
          {isLight && <p className="wallet-hint">{t.lightForegroundHint}</p>}
          <div className="link-row">
            <button type="button" onClick={() => setConfirmAction("leave")} disabled={isUnbonding || !validator}>
              {t.leaveValidator}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setConfirmAction("unstake")}
              disabled={!isUnbonding}
            >
              {t.unstake}
            </button>
            {validator && (
              <Link to={`/validator/${address}`} className="ghost button-link">
                {t.validatorProfileTitle}
              </Link>
            )}
            <Link to="/wallet" className="ghost button-link">
              {t.openCabinet}
            </Link>
            {isLight && (
              <Link to="/light" className="cta button-link">
                {t.earnKeepOnline}
              </Link>
            )}
            {!validator && (
              <Link to="/validators" className="cta button-link">
                {t.launch}
              </Link>
            )}
          </div>
        </section>
      )}
      <section className="card section-prose">
        <h2>{t.rewardHowTitle}</h2>
        <ul>
          <li>{t.rewardHowEpochPool}</li>
          <li>{t.rewardHowSplit}</li>
          <li>{t.rewardHowWeight}</li>
          <li>{t.rewardHowLight}</li>
          <li>{t.rewardHowFormula}</li>
        </ul>
        <p className="wallet-hint">
          {t.rewardHowCurrent}: <strong>{rewards ? `${rewards.totalReward.toFixed(4)} PPL` : "—"}</strong>
          {" · "}
          {t.rewardHowMine}: <strong>{`${currentEpochReward.toFixed(4)} PPL`}</strong>
        </p>
      </section>

      <section className="card">
        <h2>{t.rewardHistory}</h2>
        {myEpochRewards.length === 0 ? (
          <p>{t.noRewards}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.epoch}</th>
                  <th>{t.rewards}</th>
                  <th>{t.total}</th>
                </tr>
              </thead>
              <tbody>
                {myEpochRewards.map((entry) => (
                  <tr key={entry.epoch} className={entry.reward > 0 ? "earn-row--mine" : undefined}>
                    <td>{entry.epoch}</td>
                    <td>
                      <strong>{entry.reward.toFixed(4)} PPL</strong>
                    </td>
                    <td>{entry.total.toFixed(4)} PPL</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ConfirmDialog
        open={confirmAction === "leave"}
        title={t.leaveConfirmTitle}
        message={t.leaveConfirmMessage}
        confirmLabel={t.leaveValidator}
        cancelLabel={t.cancel}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null);
          void leave();
        }}
      />
      <ConfirmDialog
        open={confirmAction === "unstake"}
        title={t.unstakeConfirmTitle}
        message={t.unstakeConfirmMessage}
        confirmLabel={t.unstake}
        cancelLabel={t.cancel}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null);
          void claim();
        }}
      />
    </>
  );
}
