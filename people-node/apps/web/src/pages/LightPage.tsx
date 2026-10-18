import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { useWallet } from "../WalletContext.js";
import { useDeviceVault } from "../DeviceVaultContext.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { InstallPwaButton } from "../InstallPwaButton.js";
import { useLive } from "../LiveContext.js";
import { people, signTransaction } from "../peopleClient.js";
import { deviceHasStoredKey } from "../devices.js";
import { MIN_WALLET_PASSWORD_LENGTH } from "../walletStorage.js";
import { getSignedAttestation, recordSignedAttestation } from "../attestationLog.js";

export function LightPage() {
  const { t } = usePrefs();
  const notify = useNotify();
  const { session } = useWallet();
  const {
    devices: allDevices,
    legacyDevices,
    getUnlockedKey,
    isUnlocked,
    unlockDevice,
    migrateDevice,
    saveDeviceEncrypted
  } = useDeviceVault();
  const { headHeight, connected, metrics } = useLive();

  const devices = useMemo(() => allDevices.filter(deviceHasStoredKey), [allDevices]);
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [lastAttestedHeight, setLastAttestedHeight] = useState(0);
  const [addCabinetOpen, setAddCabinetOpen] = useState(false);
  const [devicePassword, setDevicePassword] = useState("");
  const [cabinetPassword, setCabinetPassword] = useState("");
  const [migratePassword, setMigratePassword] = useState("");
  const [migrateId, setMigrateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastAttestedRef = useRef(0);
  const pausedByBackgroundRef = useRef(false);

  useEffect(() => {
    if (deviceId && devices.some((item) => item.id === deviceId)) {
      return;
    }
    setDeviceId(devices[0]?.id ?? "");
  }, [devices, deviceId]);

  const finalizedHeight = metrics?.finalizedHeight ?? 0;
  const statusLabel = !connected ? t.lightOffline : running ? t.lightRunning : t.lightStopped;
  const statusClass = !connected
    ? "light-status__state--offline"
    : running
      ? "light-status__state--running"
      : "light-status__state--stopped";

  const cabinetAlreadyAdded = useMemo(
    () => Boolean(session?.address && devices.some((item) => item.address === session.address)),
    [devices, session?.address]
  );

  const selectedDevice = devices.find((item) => item.id === deviceId);
  const selectedUnlocked = Boolean(deviceId && isUnlocked(deviceId));
  const selectedNeedsMigration = Boolean(
    selectedDevice && legacyDevices.some((item) => item.id === selectedDevice.id)
  );

  useEffect(() => {
    if (!running || !connected || headHeight <= 0 || !deviceId) {
      return;
    }
    const privateKey = getUnlockedKey(deviceId);
    const device = devices.find((item) => item.id === deviceId);
    if (!privateKey || !device) {
      notify.error(t.deviceUnlockRequired);
      setRunning(false);
      return;
    }

    if (headHeight <= lastAttestedRef.current) {
      return;
    }

    let stopped = false;

    async function attestWindow() {
      if (stopped || !privateKey || !device) {
        return;
      }
      const from = Math.max(1, headHeight - 3);
      for (let height = from; height <= headHeight; height += 1) {
        if (stopped || height <= lastAttestedRef.current) {
          continue;
        }
        try {
          const block = await people.getBlock(height);
          // The only thing the wallet attests to is whatever hash the node reports, and it
          // has no way to recompute it. Read the same height twice and refuse to sign if the
          // node contradicts itself, or if it now offers a different hash than one we have
          // already signed at this height.
          const confirmation = await people.getBlock(height);
          if (confirmation.hash !== block.hash) {
            notify.error(t.lightAttestationHashConflict.replace("{height}", String(height)));
            stopped = true;
            setRunning(false);
            return;
          }
          const previouslySigned = getSignedAttestation(height);
          if (previouslySigned && previouslySigned.hash !== block.hash) {
            notify.error(t.lightAttestationHashConflict.replace("{height}", String(height)));
            stopped = true;
            setRunning(false);
            return;
          }
          const account = await people.getAddress(device.address);
          const tx = signTransaction(privateKey, {
            chainId: (await people.getHealth()).chainId,
            id: `${device.address}-att-${height}-${Date.now()}`,
            from: device.address,
            to: "attestation",
            amount: 0,
            fee: 0,
            nonce: account.nonce,
            timestamp: Date.now(),
            type: "attestation",
            payload: {
              headerHeight: height,
              blockHash: block.hash,
              kind: "light"
            }
          });
          const result = await people.submitTx(tx);
          if (result.accepted) {
            recordSignedAttestation(height, block.hash);
          }
          lastAttestedRef.current = height;
          setLastAttestedHeight(height);
          setLog((prev) =>
            [
              t.lightAttestationEntry
                .replace("{height}", String(height))
                .replace("{accepted}", String(result.accepted)),
              ...prev
            ].slice(0, 12)
          );
        } catch {
          // skip single height failures
        }
      }
    }

    void attestWindow();
    return () => {
      stopped = true;
    };
  }, [running, deviceId, devices, headHeight, connected, t, notify, getUnlockedKey]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        if (running) {
          pausedByBackgroundRef.current = true;
          setRunning(false);
          notify.info(t.lightBackgroundPaused);
        }
        return;
      }
      if (pausedByBackgroundRef.current) {
        pausedByBackgroundRef.current = false;
        notify.info(t.lightBackgroundResumed);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [running, notify, t.lightBackgroundPaused, t.lightBackgroundResumed]);

  async function handleUnlock(event: FormEvent) {
    event.preventDefault();
    if (!deviceId || !devicePassword) {
      return;
    }
    setBusy(true);
    try {
      await unlockDevice(deviceId, devicePassword);
      setDevicePassword("");
      notify.success(t.deviceUnlocked);
    } catch {
      notify.error(t.walletWrongPassword);
    } finally {
      setBusy(false);
    }
  }

  async function handleMigrate(event: FormEvent) {
    event.preventDefault();
    const id = migrateId ?? selectedDevice?.id;
    if (!id || !migratePassword) {
      return;
    }
    setBusy(true);
    try {
      await migrateDevice(id, migratePassword);
      setMigratePassword("");
      setMigrateId(null);
      notify.success(t.deviceMigrated);
    } catch {
      notify.error(t.walletWrongPassword);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCabinet() {
    if (!session?.privateKey || !session.address) {
      notify.error(t.lightNeedSession);
      setAddCabinetOpen(false);
      return;
    }
    if (cabinetAlreadyAdded) {
      notify.info(t.lightAlreadyAdded);
      setAddCabinetOpen(false);
      return;
    }
    if (cabinetPassword.length < MIN_WALLET_PASSWORD_LENGTH) {
      notify.error(t.devicePasswordTooShort);
      return;
    }
    setBusy(true);
    try {
      const saved = await saveDeviceEncrypted(
        {
          id: `cabinet-${session.address}`,
          name: session.label || "cabinet",
          address: session.address,
          kind: "light",
          privateKey: session.privateKey
        },
        cabinetPassword
      );
      setDeviceId(saved.id);
      setCabinetPassword("");
      setAddCabinetOpen(false);
      notify.success(t.lightAddCabinetSuccess);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.walletCreateFailed);
    } finally {
      setBusy(false);
    }
  }

  function handleToggleRun() {
    if (running) {
      setRunning(false);
      return;
    }
    if (!deviceId) {
      return;
    }
    if (selectedNeedsMigration) {
      notify.error(t.deviceMigrateRequired);
      return;
    }
    if (!isUnlocked(deviceId)) {
      notify.error(t.deviceUnlockRequired);
      return;
    }
    setRunning(true);
  }

  return (
    <>
      <PageMeta title={t.lightTitle} description={t.lightDescription} />
      <section className="card page-header">
        <h1>{t.lightTitle}</h1>
        <p className="lead">{t.lightDescription}</p>
        <div className="light-honesty" role="note">
          <p className="wallet-hint">
            <strong>{t.lightHonestyTitle}</strong> {t.lightForegroundHint}
          </p>
          <p className="wallet-hint">{t.lightHonestyUptime}</p>
        </div>
        <p className="wallet-hint">{t.installPwaHint}</p>
        <p className="wallet-hint">{t.lightAfterInstallHint}</p>
        <div className="link-row">
          <InstallPwaButton className="cta" />
          <Link to="/staking" className="ghost button-link">
            {t.yieldNav}
          </Link>
        </div>
      </section>

      {legacyDevices.length > 0 && (
        <section className="card">
          <h2>{t.deviceMigrateTitle}</h2>
          <p className="wallet-hint">{t.deviceMigrateHint}</p>
          <ul className="log-list">
            {legacyDevices.map((device) => (
              <li key={device.id}>
                {device.name}{" "}
                <span className="mono">{device.address.slice(0, 12)}…</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setMigrateId(device.id);
                    setDeviceId(device.id);
                  }}
                >
                  {t.deviceMigrateAction}
                </button>
              </li>
            ))}
          </ul>
          {(migrateId || selectedNeedsMigration) && (
            <form className="form" onSubmit={(e) => void handleMigrate(e)}>
              <label>
                {t.devicePassword}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={migratePassword}
                  onChange={(e) => setMigratePassword(e.target.value)}
                  minLength={6}
                  required
                />
              </label>
              <p className="wallet-hint">{t.devicePasswordHint}</p>
              <button type="submit" disabled={busy}>
                {t.deviceMigrateAction}
              </button>
            </form>
          )}
        </section>
      )}

      <section className="card">
        {devices.length === 0 ? (
          <>
            <p className="lead">{t.lightEmptyHint}</p>
            <div className="link-row">
              <Link to="/validators" className="cta button-link">
                {t.lightEmptyCta}
              </Link>
              {session ? (
                <button type="button" className="ghost" onClick={() => setAddCabinetOpen(true)}>
                  {t.lightEmptyCabinetCta}
                </button>
              ) : (
                <Link to="/wallet" className="ghost button-link">
                  {t.openCabinet}
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="light-status" role="status" aria-live="polite">
              <p className={`light-status__state ${statusClass}`}>{statusLabel}</p>
              <div className="light-status__row">
                <div>
                  <div className="light-status__label">{t.lightLastAttested}</div>
                  <div className="light-status__value">{lastAttestedHeight || "—"}</div>
                </div>
                <div>
                  <div className="light-status__label">{t.head}</div>
                  <div className="light-status__value">{connected ? headHeight : "…"}</div>
                </div>
                <div>
                  <div className="light-status__label">{t.finalized}</div>
                  <div className="light-status__value">{connected ? finalizedHeight || "—" : "…"}</div>
                </div>
              </div>
            </div>
            <label>
              {t.deviceName}
              <select
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  setRunning(false);
                }}
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} ({device.address.slice(0, 10)}...)
                    {legacyDevices.some((item) => item.id === device.id) ? ` — ${t.deviceLegacyBadge}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {!selectedNeedsMigration && !selectedUnlocked && deviceId && (
              <form className="form" onSubmit={(e) => void handleUnlock(e)}>
                <label>
                  {t.devicePassword}
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={devicePassword}
                    onChange={(e) => setDevicePassword(e.target.value)}
                    required
                  />
                </label>
                <button type="submit" disabled={busy}>
                  {t.deviceUnlock}
                </button>
              </form>
            )}

            {selectedUnlocked && <p className="wallet-hint">{t.deviceSessionUnlocked}</p>}

            <div className="link-row">
              <button className="cta" onClick={handleToggleRun} type="button">
                {running ? t.stopLight : t.startLight}
              </button>
              {session && !cabinetAlreadyAdded && (
                <button type="button" className="ghost" onClick={() => setAddCabinetOpen(true)}>
                  {t.lightEmptyCabinetCta}
                </button>
              )}
            </div>
            {log.length > 0 && (
              <details className="advanced-panel">
                <summary>{t.lightAttestationLog}</summary>
                <ul className="log-list">
                  {log.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={addCabinetOpen}
        title={t.lightAddCabinetConfirmTitle}
        message={t.lightAddCabinetConfirm}
        confirmLabel={busy ? t.connecting : t.lightEmptyCabinetCta}
        cancelLabel={t.cancel}
        onCancel={() => {
          setAddCabinetOpen(false);
          setCabinetPassword("");
        }}
        onConfirm={() => void handleAddCabinet()}
      >
        <label>
          {t.devicePassword}
          <input
            type="password"
            autoComplete="new-password"
            value={cabinetPassword}
            onChange={(e) => setCabinetPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <p className="wallet-hint">{t.devicePasswordHint}</p>
      </ConfirmDialog>
    </>
  );
}
