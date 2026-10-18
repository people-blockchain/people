import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useLive } from "../LiveContext.js";
import { people } from "../peopleClient.js";
import { classifyNetwork, showDevnetTools } from "../networkEnv.js";
import { computeSupply } from "../supplyMath.js";
import {
  loadStatusIncidents,
  loadStatusSamples,
  recordStatusIncident,
  recordStatusSample,
  uptimePercent,
  type StatusIncident,
  type StatusSample
} from "../statusHistory.js";

export function StatusPage() {
  const { t, language } = usePrefs();
  const { connected, offline, metrics, snapshot, headHeight, feed } = useLive();
  const [threshold, setThreshold] = useState<number | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [samples, setSamples] = useState<StatusSample[]>(() => loadStatusSamples());
  const [incidents, setIncidents] = useState<StatusIncident[]>(() => loadStatusIncidents());
  const wasOnlineRef = useRef<boolean | null>(null);
  const lastDegradedAtRef = useRef(0);

  useEffect(() => {
    people
      .getChainConfig()
      .then((config) => setThreshold(config.attestationFinalityThreshold ?? null))
      .catch(() => setThreshold(null));
    people
      .getHealth()
      .then((health) => setHealthOk(Boolean(health.ok)))
      .catch(() => setHealthOk(false));
  }, []);

  useEffect(() => {
    const online = connected && !offline;
    const now = Date.now();
    const last = samples[0];
    const shouldSample = !last || now - last.at >= 60_000;
    if (shouldSample) {
      setSamples(
        recordStatusSample({
          at: now,
          online,
          lag: metrics?.finalizedLag,
          peers: metrics?.peerCount,
          head: headHeight
        })
      );
    }
    if (wasOnlineRef.current === null) {
      wasOnlineRef.current = online;
      return;
    }
    if (wasOnlineRef.current && !online) {
      setIncidents(
        recordStatusIncident({
          at: now,
          kind: "offline",
          detail: t.statusIncidentOffline
        })
      );
    } else if (!wasOnlineRef.current && online) {
      setIncidents(
        recordStatusIncident({
          at: now,
          kind: "recovered",
          detail: t.statusIncidentRecovered
        })
      );
    } else if (
      online &&
      metrics?.finalizedLag !== undefined &&
      metrics.finalizedLag >= 20 &&
      now - lastDegradedAtRef.current >= 5 * 60_000
    ) {
      lastDegradedAtRef.current = now;
      setIncidents(
        recordStatusIncident({
          at: now,
          kind: "degraded",
          detail: t.statusIncidentDegraded.replace("{lag}", String(metrics.finalizedLag))
        })
      );
    }
    wasOnlineRef.current = online;
  }, [connected, offline, metrics?.finalizedLag, metrics?.peerCount, headHeight, t, samples]);

  const chainId = metrics?.chainId;
  const kind = classifyNetwork(chainId);
  const networkLabel =
    kind === "mainnet"
      ? t.networkKindMainnet
      : kind === "testnet"
        ? t.networkKindTestnet
        : kind === "devnet"
          ? t.networkKindDevnet
          : t.networkKindUnknown;

  const activeValidators =
    metrics?.activeValidators ?? snapshot?.validators.filter((v) => v.status === "active").length;
  const finalizedHeight = metrics?.finalizedHeight ?? snapshot?.finalizedHeight ?? 0;
  const finalizedLag = metrics?.finalizedLag;
  const quorumHint =
    threshold !== null
      ? t.statusQuorumHint.replace("{threshold}", String(Math.round(threshold * 100)))
      : t.statusQuorumUnknown;
  const uptime24h = uptimePercent(samples);
  const supply = useMemo(
    () =>
      computeSupply({
        accounts: feed?.accounts ?? [],
        validators: snapshot?.validators ?? [],
        feePool: metrics?.feePool,
        issuedRewards: metrics?.totalValidatorRewards
      }),
    [feed?.accounts, snapshot?.validators, metrics?.feePool, metrics?.totalValidatorRewards]
  );

  return (
    <>
      <PageMeta title={t.statusPageTitle} description={t.statusPageDescription} />
      <section className="card page-header">
        <h1>{t.statusPageTitle}</h1>
        <p className="lead">{t.statusPageDescription}</p>
        <p className="wallet-hint">
          <span className={`network-badge network-badge--${kind}`}>{networkLabel}</span>
          {chainId ? (
            <>
              {" "}
              <span className="mono">{chainId}</span>
            </>
          ) : null}
        </p>
        {showDevnetTools(chainId) && <p className="wallet-hint">{t.statusDevnetDisclaimer}</p>}
      </section>

      <section className="card">
        <h2>{t.networkState}</h2>
        {!connected && offline ? (
          <p>{t.nodeOffline}</p>
        ) : (
          <div className="grid">
            <div>
              <strong>{t.statusApi}</strong>
              <p>
                {connected ? t.statusOnline : t.statusConnecting}
                {healthOk === false ? ` · ${t.statusHealthFail}` : ""}
              </p>
            </div>
            <div>
              <strong>{t.statusRpc}</strong>
              <p>
                <code>/api</code> · {connected ? t.statusOnline : t.statusConnecting}
              </p>
            </div>
            <div>
              <strong>{t.head}</strong>
              <p>{connected ? headHeight : "…"}</p>
            </div>
            <div>
              <strong>{t.finalized}</strong>
              <p>{connected ? finalizedHeight || "—" : "…"}</p>
            </div>
            <div>
              <strong>{t.finalizedLag}</strong>
              <p>{connected && finalizedLag !== undefined ? finalizedLag : "…"}</p>
            </div>
            <div>
              <strong>{t.activeValidators}</strong>
              <p>{activeValidators ?? "…"}</p>
            </div>
            <div>
              <strong>{t.validatorsCount}</strong>
              <p>{metrics?.validators ?? snapshot?.validators.length ?? "…"}</p>
            </div>
            <div>
              <strong>{t.statusPeers}</strong>
              <p>{metrics?.peerCount ?? "…"}</p>
            </div>
            <div>
              <strong>{t.statusQuorum}</strong>
              <p>{quorumHint}</p>
            </div>
            <div>
              <strong>{t.epoch}</strong>
              <p>{metrics?.epoch ?? "…"}</p>
            </div>
            <div>
              <strong>{t.statusBlockTime}</strong>
              <p>
                {metrics?.blockIntervalMs !== undefined
                  ? `${(metrics.blockIntervalMs / 1000).toFixed(1)}s`
                  : "…"}
              </p>
            </div>
            <div>
              <strong>{t.statusUptime24h}</strong>
              <p>{uptime24h.toFixed(1)}%</p>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t.supplyTitle}</h2>
        <p className="wallet-hint">{t.supplyHint}</p>
        <div className="grid">
          <div>
            <strong>{t.supplyLiquid}</strong>
            <p>{supply.liquidBalances.toFixed(2)} PPL</p>
          </div>
          <div>
            <strong>{t.supplyLocked}</strong>
            <p>{supply.lockedStake.toFixed(2)} PPL</p>
          </div>
          <div>
            <strong>{t.supplyCirculating}</strong>
            <p>{supply.circulating.toFixed(2)} PPL</p>
          </div>
          <div>
            <strong>{t.supplyTracked}</strong>
            <p>{supply.totalTracked.toFixed(2)} PPL</p>
          </div>
          <div>
            <strong>{t.supplyIssuedRewards}</strong>
            <p>{supply.issuedRewards.toFixed(2)} PPL</p>
          </div>
          <div>
            <strong>{t.supplyFeePool}</strong>
            <p>{supply.feePool.toFixed(2)} PPL</p>
          </div>
        </div>
        <p className="wallet-hint">{t.supplyNoBurn}</p>
      </section>

      <section className="card">
        <h2>{t.statusIncidentsTitle}</h2>
        {incidents.length === 0 ? (
          <p>{t.statusIncidentsEmpty}</p>
        ) : (
          <ul className="log-list">
            {incidents.slice(0, 12).map((item) => (
              <li key={item.id}>
                <span className="mono">
                  {new Date(item.at).toLocaleString(language === "ru" ? "ru-RU" : "en-US")}
                </span>
                {" · "}
                {item.kind === "offline"
                  ? t.statusIncidentKindOffline
                  : item.kind === "degraded"
                    ? t.statusIncidentKindDegraded
                    : t.statusIncidentKindRecovered}
                {" — "}
                {item.detail}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>{t.statusAvailabilityTitle}</h2>
        <p className="wallet-hint">{t.statusAvailabilityHint}</p>
        {samples.length === 0 ? (
          <p>{t.statusAvailabilityEmpty}</p>
        ) : (
          <ul className="balance-history__list">
            {samples.slice(0, 16).map((sample) => (
              <li key={sample.at}>
                <span>
                  {new Date(sample.at).toLocaleString(language === "ru" ? "ru-RU" : "en-US")}
                  {sample.lag !== undefined ? ` · Δ${sample.lag}` : ""}
                  {sample.peers !== undefined ? ` · peers ${sample.peers}` : ""}
                </span>
                <strong>{sample.online ? t.statusOnline : t.nodeOffline}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showDevnetTools(chainId) && (
        <section className="card">
          <h2>{t.statusDevToolsTitle}</h2>
          <p className="wallet-hint">{t.statusDevToolsHint}</p>
          <ul className="log-list">
            <li>{t.statusDevToolFaucet}</li>
            <li>{t.statusDevToolPrice}</li>
            <li>{t.statusDevToolBootstrap}</li>
          </ul>
        </section>
      )}

      <section className="card">
        <div className="link-row">
          <Link to="/explorer" className="ghost button-link">
            {t.explorer}
          </Link>
          <Link to="/docs" className="ghost button-link">
            {t.docs}
          </Link>
        </div>
      </section>
    </>
  );
}
