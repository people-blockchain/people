import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { RewardDistribution, Validator } from "@people/protocol";
import { addressPath, isWalletAddress } from "../address.js";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { useLive, type LiveTransaction } from "../LiveContext.js";
import { people } from "../peopleClient.js";
import { labelNodeKind, labelValidatorStatus } from "../i18n.js";
import { referralSharePath } from "../referral.js";
import {
  forecastAprPercent,
  networkSharePercent,
  realizedAprPercent,
  totalActiveStake
} from "../yieldMath.js";
import { TokenIcon } from "../TokenIcon.js";

export function ValidatorPage() {
  const { address: rawAddress = "" } = useParams();
  const address = rawAddress.trim();
  const { t } = usePrefs();
  const notify = useNotify();
  const { snapshot, rewards, metrics } = useLive();
  const [remote, setRemote] = useState<Validator | null>(null);
  const [rewardHistory, setRewardHistory] = useState<RewardDistribution[]>([]);
  const [attestations, setAttestations] = useState<LiveTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const valid = isWalletAddress(address);

  const validator = useMemo(() => {
    if (!valid) {
      return null;
    }
    return snapshot?.validators.find((item) => item.address.toLowerCase() === address.toLowerCase()) ?? remote;
  }, [snapshot, address, remote, valid]);

  useEffect(() => {
    if (!valid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      people.getValidators().catch(() => [] as Validator[]),
      people.getRewardHistory(30).catch(() => [] as RewardDistribution[]),
      people.getAddressTransactions(address, 40).catch(() => [])
    ])
      .then(([validators, history, txs]) => {
        if (cancelled) {
          return;
        }
        setRemote(
          validators.find((item) => item.address.toLowerCase() === address.toLowerCase()) ?? null
        );
        setRewardHistory(history);
        setAttestations(
          (txs as LiveTransaction[]).filter((tx) => tx.type === "attestation").slice(0, 15)
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [address, valid]);

  const activeStake = totalActiveStake(snapshot?.validators ?? []);
  const share = validator ? networkSharePercent(validator.stake, activeStake) : 0;
  const epochReward = rewards && validator ? (rewards.rewards[validator.address] ?? 0) : 0;
  const myEpochs = rewardHistory
    .map((entry) => ({
      epoch: entry.epoch,
      reward: entry.rewards[address] ?? 0,
      total: entry.totalReward
    }))
    .filter((entry) => entry.reward > 0);
  const lifetime = myEpochs.reduce((sum, entry) => sum + entry.reward, 0);
  const forecastApr = validator ? forecastAprPercent(epochReward, validator.stake) : 0;
  const realizedApr = validator
    ? realizedAprPercent(lifetime, validator.stake, Math.max(1, myEpochs.length))
    : 0;

  const shareUrl =
    typeof window !== "undefined" && valid
      ? `${window.location.origin}/validator/${address}`
      : "";
  const inviteUrl =
    typeof window !== "undefined" && valid
      ? `${window.location.origin}${referralSharePath(address)}`
      : "";

  async function copy(text: string, okMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify.success(okMessage);
    } catch {
      notify.error(t.walletCreateFailed);
    }
  }

  if (!valid) {
    return (
      <>
        <PageMeta title={t.validatorProfileTitle} description={t.validatorProfileDescription} />
        <section className="card">
          <p>{t.walletInvalidRecipient}</p>
          <Link to="/validators" className="ghost button-link">
            {t.launch}
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t.validatorProfileTitle} · ${address.slice(0, 10)}…`}
        description={t.validatorProfileDescription}
      />
      <section className="card page-header">
        <h1>{t.validatorProfileTitle}</h1>
        <p className="lead">{t.validatorProfileDescription}</p>
        <p className="mono">{address}</p>
        <div className="link-row">
          <Link to={addressPath(address)} className="ghost button-link">
            {t.walletViewOnExplorer}
          </Link>
          <button
            type="button"
            className="ghost"
            onClick={() => void copy(shareUrl, t.validatorShareCopied)}
          >
            {t.validatorShareLink}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void copy(inviteUrl, t.referralCopied)}
          >
            {t.validatorInviteLink}
          </button>
        </div>
      </section>

      <section className="card">
        {loading && !validator ? (
          <p>{t.loading}</p>
        ) : !validator ? (
          <p>{t.validatorNotFound}</p>
        ) : (
          <dl className="detail-grid">
            <div>
              <dt>{t.status}</dt>
              <dd>
                <span className={`status-badge${validator.status === "active" ? " status-badge--ok" : ""}`}>
                  {labelValidatorStatus(t, validator.status)}
                </span>
                {" · "}
                {labelNodeKind(t, validator.nodeKind)}
              </dd>
            </div>
            <div>
              <dt>{t.stake}</dt>
              <dd className="value-with-token">
                <TokenIcon size={16} />
                {validator.stake.toFixed(4)} PPL
              </dd>
            </div>
            <div>
              <dt>{t.uptime}</dt>
              <dd>{validator.uptimeScore.toFixed(3)}</dd>
            </div>
            <div>
              <dt>{t.attestScore}</dt>
              <dd>{validator.attestationScore.toFixed(3)}</dd>
            </div>
            <div>
              <dt>{t.yieldNetworkShare}</dt>
              <dd>{share.toFixed(2)}%</dd>
            </div>
            <div>
              <dt>{t.earnEpochReward}</dt>
              <dd>{epochReward.toFixed(4)} PPL</dd>
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
              <dt>{t.epoch}</dt>
              <dd>{metrics?.epoch ?? rewards?.epoch ?? "—"}</dd>
            </div>
            {validator.referredBy && (
              <div>
                <dt>{t.referralBound}</dt>
                <dd>
                  <Link className="mono table-link" to={`/validator/${validator.referredBy}`}>
                    {validator.referredBy.slice(0, 14)}…
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="card">
        <h2>{t.rewardHistory}</h2>
        {myEpochs.length === 0 ? (
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
                {myEpochs.map((entry) => (
                  <tr key={entry.epoch}>
                    <td>{entry.epoch}</td>
                    <td>{entry.reward.toFixed(4)} PPL</td>
                    <td>{entry.total.toFixed(4)} PPL</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="wallet-hint">
          {t.earnLifetime}: <strong>{lifetime.toFixed(4)} PPL</strong>
        </p>
      </section>

      <section className="card">
        <h2>{t.validatorAttestations}</h2>
        {attestations.length === 0 ? (
          <p>{t.validatorNoAttestations}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.txId}</th>
                  <th>{t.block}</th>
                  <th className="hide-mobile">{t.height}</th>
                </tr>
              </thead>
              <tbody>
                {attestations.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <Link to={`/tx/${tx.id}`} className="table-link">
                        {tx.id.slice(0, 12)}…
                      </Link>
                    </td>
                    <td>
                      <Link to={`/block/${tx.blockHeight}`} className="table-link">
                        {tx.blockHeight}
                      </Link>
                    </td>
                    <td className="hide-mobile">
                      {typeof tx.payload?.headerHeight === "number" ? tx.payload.headerHeight : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
