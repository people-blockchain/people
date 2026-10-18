import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import type { RewardDistribution } from "@people/protocol";
import { addressPath } from "../address.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { useLive } from "../LiveContext.js";
import { people } from "../peopleClient.js";
import type { NodeKind } from "../devices.js";
import {
  createMnemonicWallet,
  pickMnemonicConfirmIndices,
  verifyMnemonicConfirm
} from "../seedPhrase.js";
import {
  captureReferrer,
  getBoundReferrer,
  getStoredReferrer,
  inheritReferrerBinding,
  resolveJoinReferrer
} from "../referral.js";
import { useWallet } from "../WalletContext.js";
import { useDeviceVault } from "../DeviceVaultContext.js";
import { MIN_WALLET_PASSWORD_LENGTH } from "../walletStorage.js";
import { labelNodeKind, labelValidatorStatus, type Translation } from "../i18n.js";
import {
  buildNodeReadiness,
  probeBrowserStorage,
  readinessOverall,
  type ReadinessCheck,
  type ReadinessStatus
} from "../nodeReadiness.js";

interface PendingValidator {
  privateKey: string;
  address: string;
  name: string;
  kind: NodeKind;
  stake: number;
  fromSession?: boolean;
  mnemonic?: string;
  confirmIndices?: number[];
}

type JoinPhase = "idle" | "funding" | "joining";
type KeySource = "session" | "new";
type LaunchScenario = "phone" | "pc" | "server";

export function ValidatorsPage() {
  const { language, t } = usePrefs();
  const notify = useNotify();
  const { session } = useWallet();
  const { devices, saveDeviceEncrypted, removeDevice: removeVaultDevice, isUnlocked } = useDeviceVault();
  const [searchParams] = useSearchParams();
  const { snapshot, rewards, offline, slashCandidate, metrics, connected } = useLive();
  const [bootstrapPayload, setBootstrapPayload] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [pending, setPending] = useState<PendingValidator | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [referrer, setReferrer] = useState<string | null>(() => getStoredReferrer());
  const [keySource, setKeySource] = useState<KeySource>("new");
  const [devicePassword, setDevicePassword] = useState("");
  const [devicePasswordConfirm, setDevicePasswordConfirm] = useState("");
  const [seedStep, setSeedStep] = useState<"show" | "confirm">("show");
  const [seedAnswers, setSeedAnswers] = useState<Record<number, string>>({});
  const [seedSaved, setSeedSaved] = useState(false);
  const [scenario, setScenario] = useState<LaunchScenario | null>(null);

  const [deviceName, setDeviceName] = useState("my-validator");
  const [kind, setKind] = useState<NodeKind>("light");
  const [stake, setStake] = useState(120);
  const [submitting, setSubmitting] = useState(false);
  const [joinPhase, setJoinPhase] = useState<JoinPhase>("idle");
  const [rewardHistory, setRewardHistory] = useState<RewardDistribution[]>([]);
  const [slashAddress, setSlashAddress] = useState("");
  const [slashHeight, setSlashHeight] = useState(0);
  const [slashHashA, setSlashHashA] = useState("");
  const [slashHashB, setSlashHashB] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "leaving">("all");
  const [kindFilter, setKindFilter] = useState<"all" | "full" | "light">("all");
  const [sortBy, setSortBy] = useState<"stake" | "uptime">("stake");
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [removeDeviceId, setRemoveDeviceId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessCheck[]>([]);
  const [minStake, setMinStake] = useState(100);
  const [nodeVersion, setNodeVersion] = useState<string | undefined>();

  const networkValidators = snapshot?.validators ?? [];
  const loading = !snapshot && !offline;

  useEffect(() => {
    captureReferrer(searchParams.get("ref"));
    if (pending?.address) {
      setReferrer(
        resolveJoinReferrer({
          joiningAddress: pending.address,
          sessionAddress: session?.address
        })
      );
      return;
    }
    setReferrer(
      (session?.address ? getBoundReferrer(session.address) : null) ?? getStoredReferrer()
    );
  }, [searchParams, pending?.address, session?.address]);

  useEffect(() => {
    people.getRewardHistory(20)
      .then(setRewardHistory)
      .catch(() => setRewardHistory([]));
  }, [rewards?.epoch]);

  useEffect(() => {
    people
      .getChainConfig()
      .then((config) => setMinStake(config.minStake ?? 100))
      .catch(() => setMinStake(100));
    people
      .getHealthDetails()
      .then((details) => setNodeVersion(details.peerId))
      .catch(() => setNodeVersion(undefined));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const storage = await probeBrowserStorage();
      const targetAddress = pending?.address ?? session?.address ?? devices[0]?.address;
      const onChain = targetAddress
        ? networkValidators.find((item) => item.address === targetAddress)
        : undefined;
      const hasKey = Boolean(
        (session?.privateKey && session.address === targetAddress) ||
          devices.some((device) => device.address === targetAddress && (device.encryptedPrivateKey || isUnlocked(device.id)))
      );
      const checks = buildNodeReadiness({
        online: connected && navigator.onLine,
        peerCount: metrics?.peerCount ?? snapshot?.peerCount,
        finalizedLag: metrics?.finalizedLag,
        headHeight: metrics?.height ?? snapshot?.head.height,
        version: nodeVersion,
        hasKey,
        stake: onChain?.stake ?? (Number.isFinite(stake) ? stake : undefined),
        minStake,
        freeDiskBytes: storage.freeDiskBytes,
        quotaBytes: storage.quotaBytes
      });
      if (!cancelled) {
        setReadiness(checks);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    connected,
    metrics?.peerCount,
    metrics?.finalizedLag,
    metrics?.height,
    snapshot?.peerCount,
    snapshot?.head.height,
    nodeVersion,
    session?.privateKey,
    session?.address,
    devices,
    isUnlocked,
    pending?.address,
    stake,
    minStake,
    networkValidators
  ]);

  useEffect(() => {
    if (!slashCandidate) {
      return;
    }
    setSlashAddress(slashCandidate.validator);
    setSlashHeight(slashCandidate.height);
    setSlashHashA(slashCandidate.blockHashA);
    setSlashHashB(slashCandidate.blockHashB);
    notify.info(t.slashCandidatePrefill);
  }, [slashCandidate, t.slashCandidatePrefill, notify]);

  function removeDevice(id: string): void {
    removeVaultDevice(id);
    setRemoveDeviceId(null);
  }

  function resetWizard(): void {
    setPending(null);
    setSavedConfirmed(false);
    setJoinPhase("idle");
    setWizardStep(1);
    setDevicePassword("");
    setDevicePasswordConfirm("");
    setSeedStep("show");
    setSeedAnswers({});
    setSeedSaved(false);
    setScenario(null);
  }

  function selectScenario(next: LaunchScenario): void {
    setScenario(next);
    if (next === "phone") {
      setKind("light");
    } else if (next === "server") {
      setKind("full");
    } else {
      setKind("light");
    }
  }

  const readinessLabel = useMemo(() => {
    const overall = readinessOverall(readiness);
    if (overall === "ok") {
      return t.readinessOk;
    }
    if (overall === "warn") {
      return t.readinessWarn;
    }
    if (overall === "fail") {
      return t.readinessFail;
    }
    return t.readinessUnknown;
  }, [readiness, t]);

  const visibleValidators = networkValidators
    .filter((validator) => (statusFilter === "all" ? true : validator.status === statusFilter))
    .filter((validator) => (kindFilter === "all" ? true : validator.nodeKind === kindFilter))
    .sort((a, b) => (sortBy === "stake" ? b.stake - a.stake : b.uptimeScore - a.uptimeScore));

  async function handleSlashReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await people.reportSecurity(slashAddress.trim(), {
        type: "double_sign",
        validator: slashAddress.trim(),
        height: Number(slashHeight),
        blockHashA: slashHashA.trim(),
        blockHashB: slashHashB.trim()
      });
      if (!result.ok) {
        throw new Error("slash_failed");
      }
      notify.success(t.slashSuccess);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "slash_failed");
    }
  }

  useEffect(() => {
    if (session?.address && !networkValidators.some((item) => item.address === session.address)) {
      setKeySource("session");
      setKind("light");
    }
  }, [session?.address, networkValidators]);

  async function handlePrepareJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (keySource === "session") {
        if (!session?.privateKey || !session.address) {
          notify.error(t.joinSessionNeedUnlock);
          return;
        }
        if (networkValidators.some((item) => item.address === session.address)) {
          notify.error(t.joinSessionAlreadyValidator);
          return;
        }
        const bound = inheritReferrerBinding(session.address, session.address);
        setReferrer(
          bound ??
            resolveJoinReferrer({
              joiningAddress: session.address,
              sessionAddress: session.address
            })
        );
        setPending({
          privateKey: session.privateKey,
          address: session.address,
          name: deviceName,
          kind,
          stake: Number(stake),
          fromSession: true
        });
        setSavedConfirmed(true);
        setWizardStep(2);
        return;
      }

      const { mnemonic, key } = createMnemonicWallet();
      const bound = inheritReferrerBinding(key.address, session?.address);
      setReferrer(bound ?? resolveJoinReferrer({ joiningAddress: key.address, sessionAddress: session?.address }));
      setPending({
        privateKey: key.privateKey,
        address: key.address,
        name: deviceName,
        kind,
        stake: Number(stake),
        mnemonic,
        confirmIndices: pickMnemonicConfirmIndices(12)
      });
      setSavedConfirmed(false);
      setSeedStep("show");
      setSeedAnswers({});
      setSeedSaved(false);
      setWizardStep(2);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.validatorCreateFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmJoin() {
    if (!pending || !savedConfirmed) {
      return;
    }
    if (!pending.fromSession && pending.mnemonic && pending.confirmIndices) {
      if (seedStep !== "confirm") {
        notify.error(t.seedConfirmFailed);
        return;
      }
      const answers = pending.confirmIndices.map((index) => ({
        index,
        word: seedAnswers[index] ?? ""
      }));
      if (!verifyMnemonicConfirm(pending.mnemonic, answers)) {
        notify.error(t.seedConfirmFailed);
        return;
      }
    }
    if (devicePassword.length < MIN_WALLET_PASSWORD_LENGTH) {
      notify.error(t.devicePasswordTooShort);
      return;
    }
    if (devicePassword !== devicePasswordConfirm) {
      notify.error(t.devicePasswordMismatch);
      return;
    }
    setSubmitting(true);
    setJoinPhase("funding");
    setWizardStep(3);
    try {
      let account = await people.getAddress(pending.address);
      if (account.balance < pending.stake + 1) {
        await people.fundFromFaucet(pending.address, pending.stake + 50);
        await new Promise((resolve) => setTimeout(resolve, 3500));
        account = await people.getAddress(pending.address);
      }
      setJoinPhase("joining");
      const joinReferrer =
        resolveJoinReferrer({
          joiningAddress: pending.address,
          sessionAddress: session?.address
        }) ?? undefined;
      const join = await people.joinValidator(
        pending.privateKey,
        pending.stake,
        pending.kind,
        account.nonce,
        joinReferrer
      );
      if (!join.accepted) {
        throw new Error(join.error ?? t.validatorJoinFailed);
      }

      const bundle = await people.getJoinBundle(pending.address, pending.kind);
      setBootstrapPayload(bundle.qrPayload);
      setQrDataUrl(await QRCode.toDataURL(bundle.qrPayload, { margin: 1, width: 220 }));

      await saveDeviceEncrypted(
        {
          id: `${pending.address}-${Date.now()}`,
          name: pending.name,
          address: pending.address,
          kind: pending.kind,
          privateKey: pending.privateKey
        },
        devicePassword
      );
      setDevicePassword("");
      setDevicePasswordConfirm("");
      setJoinPhase("idle");
      setWizardStep(4);
    } catch (err) {
      setJoinPhase("idle");
      setWizardStep(2);
      notify.error(
        err instanceof Error
          ? err.message
          : language === "ru"
            ? "Ошибка регистрации валидатора"
            : "Validator registration failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageMeta title={t.validatorsTitle} description={t.validatorsDescription} />

      <section className="card page-header">
        <div>
          <h1>{t.validatorsTitle}</h1>
          <p className="lead">{t.validatorsDescription}</p>
        </div>
      </section>

      <section className="card">
        <h2>{t.networkState}</h2>
        {loading || !snapshot ? (
          <p>{t.loading}</p>
        ) : (
          <div className="grid">
            <div>
              <strong>{t.head}</strong>
              <p>{snapshot.head.height}</p>
            </div>
            <div>
              <strong>{t.finalized}</strong>
              <p>{snapshot.finalizedHeight}</p>
            </div>
            <div>
              <strong>{t.validatorsCount}</strong>
              <p>{networkValidators.length}</p>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t.onboarding}</h2>
        <p className="wallet-hint">{t.validatorWizardStep} {wizardStep}/4</p>

        {wizardStep === 1 && (
          <>
            <h3>{t.launchScenarioTitle}</h3>
            <p className="wallet-hint">{t.launchScenarioHint}</p>
            <div className="launch-scenarios">
              {(
                [
                  ["phone", t.launchScenarioPhone, t.launchScenarioPhoneReq, t.launchScenarioPhoneRisk, t.launchScenarioPhoneYield],
                  ["pc", t.launchScenarioPc, t.launchScenarioPcReq, t.launchScenarioPcRisk, t.launchScenarioPcYield],
                  ["server", t.launchScenarioServer, t.launchScenarioServerReq, t.launchScenarioServerRisk, t.launchScenarioServerYield]
                ] as const
              ).map(([id, title, req, risk, yieldHint]) => (
                <button
                  key={id}
                  type="button"
                  className={`launch-scenario${scenario === id ? " launch-scenario--active" : ""}`}
                  onClick={() => selectScenario(id)}
                >
                  <strong>{title}</strong>
                  <span>{req}</span>
                  <span className="wallet-hint">{risk}</span>
                  <span className="wallet-hint">{yieldHint}</span>
                </button>
              ))}
            </div>
            {scenario === "phone" && <p className="wallet-hint">{t.lightForegroundHint}</p>}

            <section className="readiness-panel">
              <h3>{t.readinessTitle}</h3>
              <p className="wallet-hint">
                {t.readinessOverall}: <strong>{readinessLabel}</strong>
              </p>
              <ul className="readiness-list">
                {readiness.map((check) => (
                  <li key={check.id} className={`readiness-item readiness-item--${check.status}`}>
                    <span>{labelReadiness(t, check.id)}</span>
                    <strong>{labelReadinessStatus(t, check.status)}</strong>
                    {check.detail ? <em className="mono">{check.detail}</em> : null}
                  </li>
                ))}
              </ul>
            </section>

            <form className="form" onSubmit={handlePrepareJoin}>
              <fieldset className="join-key-source">
                <legend>{t.onboarding}</legend>
                <label className="wallet-checkbox">
                  <input
                    type="radio"
                    name="keySource"
                    checked={keySource === "session"}
                    disabled={!session}
                    onChange={() => setKeySource("session")}
                  />
                  {t.joinUseSession}
                </label>
                <label className="wallet-checkbox">
                  <input
                    type="radio"
                    name="keySource"
                    checked={keySource === "new"}
                    onChange={() => setKeySource("new")}
                  />
                  {t.joinUseNewKey}
                </label>
                {keySource === "session" ? (
                  <p className="wallet-hint">
                    {session ? t.joinSessionHint : t.joinSessionNeedUnlock}
                    {session ? (
                      <>
                        {" "}
                        <span className="mono">{session.address.slice(0, 14)}…</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                {referrer && (
                  <p className="wallet-hint">
                    {t.referralBound}: <span className="mono">{referrer}</span>
                  </p>
                )}
              </fieldset>
              <label>
                {t.deviceName}
                <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} required />
              </label>
              <label>
                {t.deviceType}
                <select value={kind} onChange={(e) => setKind(e.target.value as NodeKind)}>
                  <option value="full">{t.full}</option>
                  <option value="light">{t.light}</option>
                </select>
              </label>
              <label>
                {t.stake}
                <input
                  type="number"
                  min={minStake}
                  value={stake}
                  onChange={(e) => setStake(Number(e.target.value))}
                  required
                />
              </label>
              {scenario === "phone" && (
                <p className="wallet-hint">
                  {t.launchNextLightHint}{" "}
                  <Link to="/light">{t.lightClient}</Link>
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || !scenario || (keySource === "session" && !session)}
              >
                {submitting ? t.connecting : t.connectValidator}
              </button>
            </form>
          </>
        )}
        {wizardStep === 2 && pending && (
          <div className="wallet-reveal">
            <h3>{pending.fromSession ? t.joinUseSession : t.validatorRevealTitle}</h3>
            {!pending.fromSession && <p className="wallet-hint">{t.seedRevealWarning}</p>}
            {referrer && (
              <p className="wallet-hint">
                {t.referralBound}: <span className="mono">{referrer}</span>
              </p>
            )}
            <dl className="detail-grid">
              <div>
                <dt>{t.deviceName}</dt>
                <dd>{pending.name}</dd>
              </div>
              <div>
                <dt>{t.walletAddress}</dt>
                <dd className="mono">{pending.address}</dd>
              </div>
              {!pending.fromSession && pending.mnemonic && seedStep === "show" && (
                <div className="detail-wide">
                  <dt>{t.seedPhrase}</dt>
                  <dd>
                    <pre className="mono seed-phrase">{pending.mnemonic}</pre>
                  </dd>
                </div>
              )}
              {!pending.fromSession && pending.mnemonic && seedStep === "confirm" && pending.confirmIndices && (
                <div className="detail-wide">
                  <dt>{t.seedConfirmTitle}</dt>
                  <dd>
                    <p className="wallet-hint">{t.seedConfirmHint}</p>
                    {pending.confirmIndices.map((index) => (
                      <label key={index}>
                        {t.seedConfirmWord.replace("{n}", String(index))}
                        <input
                          value={seedAnswers[index] ?? ""}
                          onChange={(e) =>
                            setSeedAnswers((prev) => ({ ...prev, [index]: e.target.value }))
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
            {!pending.fromSession && seedStep === "show" && (
              <label className="wallet-checkbox">
                <input
                  type="checkbox"
                  checked={seedSaved}
                  onChange={(e) => setSeedSaved(e.target.checked)}
                />
                {t.seedSavedConfirm}
              </label>
            )}
            {!pending.fromSession && seedStep === "show" && (
              <div className="link-row">
                <button
                  type="button"
                  disabled={!seedSaved}
                  onClick={() => {
                    setSeedStep("confirm");
                    setSeedAnswers({});
                    setSavedConfirmed(true);
                  }}
                >
                  {t.seedContinueConfirm}
                </button>
                <button type="button" className="ghost" onClick={resetWizard}>
                  {t.cancel}
                </button>
              </div>
            )}
            {(pending.fromSession || seedStep === "confirm") && (
              <>
                <label>
                  {t.devicePassword}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={devicePassword}
                    onChange={(e) => setDevicePassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </label>
                <label>
                  {t.devicePasswordConfirm}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={devicePasswordConfirm}
                    onChange={(e) => setDevicePasswordConfirm(e.target.value)}
                    minLength={6}
                    required
                  />
                </label>
                <p className="wallet-hint">{t.devicePasswordHint}</p>
                <div className="link-row">
                  <button
                    type="button"
                    disabled={!savedConfirmed || submitting || devicePassword.length < MIN_WALLET_PASSWORD_LENGTH}
                    onClick={() => void handleConfirmJoin()}
                  >
                    {submitting ? t.connecting : t.validatorContinue}
                  </button>
                  {!pending.fromSession ? (
                    <button type="button" className="ghost" onClick={() => setSeedStep("show")}>
                      {t.seedBackToPhrase}
                    </button>
                  ) : (
                    <button type="button" className="ghost" onClick={resetWizard}>
                      {t.cancel}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {wizardStep === 3 && (
          <div className="join-progress" role="status" aria-live="polite">
            <p className="wallet-hint">
              {joinPhase === "joining" ? t.validatorJoinSubmitting : t.validatorJoinFunding}
            </p>
            <div className="join-progress__bar" aria-hidden="true">
              <span />
            </div>
          </div>
        )}
        {wizardStep === 4 && (
          <div className="wallet-reveal">
            <div className="success-check" aria-hidden="true">
              ✓
            </div>
            <h3>{t.validatorReadyTitle}</h3>
            <p className="wallet-hint">{t.validatorReadyHint}</p>
            <div className="link-row">
              <Link to="/light" className="cta button-link">
                {t.validatorNextLight}
              </Link>
              <Link to="/docs" className="ghost button-link">
                {t.validatorNextDocs}
              </Link>
              <button type="button" className="ghost" onClick={resetWizard}>
                {t.connectValidator}
              </button>
            </div>
          </div>
        )}

        {bootstrapPayload && wizardStep === 4 && (
          <div className="bootstrap">
            <h3>{t.bootstrapPayload}</h3>
            {qrDataUrl && <img src={qrDataUrl} alt={t.bootstrapQrAlt} />}
            <pre>{bootstrapPayload}</pre>
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t.myDevices}</h2>
        {devices.length === 0 ? (
          <p>{t.noDevices}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.deviceName}</th>
                  <th>{t.walletAddress}</th>
                  <th className="hide-mobile">{t.deviceType}</th>
                  <th scope="col">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id}>
                    <td>{device.name}</td>
                    <td>
                      <Link
                        to={addressPath(device.address)}
                        className="table-link mono"
                        aria-label={`${t.openAddressAria} ${device.address}`}
                      >
                        {device.address}
                      </Link>
                    </td>
                    <td className="hide-mobile">{device.kind}</td>
                    <td>
                      <button className="ghost" onClick={() => setRemoveDeviceId(device.id)}>
                        {t.remove}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>{t.networkValidators}</h2>
          <div className="link-row">
            <label>
              {t.filter}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "leaving")}
              >
                <option value="all">{t.filterAll}</option>
                <option value="active">{t.filterActive}</option>
                <option value="leaving">{t.filterLeaving}</option>
              </select>
            </label>
            <label>
              {t.filter}
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as "all" | "full" | "light")}
              >
                <option value="all">{t.filterAll}</option>
                <option value="full">{t.filterFull}</option>
                <option value="light">{t.filterLight}</option>
              </select>
            </label>
            <label>
              {t.sort}
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "stake" | "uptime")}>
                <option value="stake">{t.sortHighestStake}</option>
                <option value="uptime">{t.sortBestUptime}</option>
              </select>
            </label>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.walletAddress}</th>
                <th className="hide-mobile">{t.deviceType}</th>
                <th className="hide-mobile">{t.status}</th>
                <th>{t.stake}</th>
                <th className="hide-mobile">{t.attestScore}</th>
                <th className="hide-mobile">{t.uptime}</th>
              </tr>
            </thead>
            <tbody>
              {visibleValidators.length === 0 ? (
                <tr>
                  <td colSpan={6}>{t.noValidators}</td>
                </tr>
              ) : (
                visibleValidators.map((validator) => (
                  <tr key={validator.address}>
                    <td>
                      <Link
                        to={`/validator/${validator.address}`}
                        className="table-link mono"
                        aria-label={`${t.validatorProfileTitle} ${validator.address}`}
                      >
                        {validator.address.slice(0, 16)}...
                      </Link>
                    </td>
                    <td className="hide-mobile">{labelNodeKind(t, validator.nodeKind)}</td>
                    <td className="hide-mobile">{labelValidatorStatus(t, validator.status)}</td>
                    <td>{validator.stake.toFixed(2)}</td>
                    <td className="hide-mobile">{validator.attestationScore.toFixed(2)}</td>
                    <td className="hide-mobile">{validator.uptimeScore.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>{t.rewards}</h2>
        {!rewards ? (
          <p>{t.noRewards}</p>
        ) : (
          <>
            <p>
              {t.epoch}: <strong>{rewards.epoch}</strong>, {t.total}:{" "}
              <strong>{rewards.totalReward.toFixed(4)} PPL</strong>
            </p>
            <ul>
              {(Object.entries(rewards.rewards) as Array<[string, number]>).map(([validator, reward]) => (
                <li key={validator}>
                  {validator}: {reward.toFixed(4)} PPL
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h2>{t.rewardHistory}</h2>
        {rewardHistory.length === 0 ? (
          <p>{t.noRewards}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t.epoch}</th>
                <th>{t.total}</th>
              </tr>
            </thead>
            <tbody>
              {rewardHistory.map((entry) => (
                <tr key={entry.epoch}>
                  <td>{entry.epoch}</td>
                  <td>{entry.totalReward.toFixed(4)} PPL</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <details className="advanced-panel card">
        <summary>{t.advancedSecurity}</summary>
        <h2>{t.slashReportTitle}</h2>
        <p className="wallet-hint">{t.slashReportHint}</p>
        <form className="form" onSubmit={handleSlashReport}>
          <label>
            {t.slashValidatorAddress}
            <input value={slashAddress} onChange={(e) => setSlashAddress(e.target.value)} required />
          </label>
          <label>
            {t.slashHeight}
            <input
              type="number"
              min={0}
              value={slashHeight}
              onChange={(e) => setSlashHeight(Number(e.target.value))}
            />
          </label>
          <label>
            {t.slashBlockHashA}
            <input value={slashHashA} onChange={(e) => setSlashHashA(e.target.value)} required />
          </label>
          <label>
            {t.slashBlockHashB}
            <input value={slashHashB} onChange={(e) => setSlashHashB(e.target.value)} required />
          </label>
          <button type="submit">{t.slashSubmit}</button>
        </form>
      </details>
      <ConfirmDialog
        open={Boolean(removeDeviceId)}
        title={t.walletRemove}
        message={t.walletRemoveConfirm}
        confirmLabel={t.remove}
        cancelLabel={t.cancel}
        onCancel={() => setRemoveDeviceId(null)}
        onConfirm={() => removeDevice(removeDeviceId ?? "")}
      />
    </>
  );
}

function labelReadiness(t: Translation, id: string): string {
  switch (id) {
    case "internet":
      return t.readinessInternet;
    case "peers":
      return t.readinessPeers;
    case "sync":
      return t.readinessSync;
    case "version":
      return t.readinessVersion;
    case "disk":
      return t.readinessDisk;
    case "key":
      return t.readinessKey;
    case "stake":
      return t.readinessStake;
    default:
      return id;
  }
}

function labelReadinessStatus(t: Translation, status: ReadinessStatus): string {
  if (status === "ok") {
    return t.readinessStatusOk;
  }
  if (status === "warn") {
    return t.readinessStatusWarn;
  }
  if (status === "fail") {
    return t.readinessStatusFail;
  }
  return t.readinessStatusUnknown;
}
