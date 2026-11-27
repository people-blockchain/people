"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { confirmTurnkeyExportReady, getTurnkeyBrowserBridge } from "@/lib/turnkey-client";
import { WalletCloudError } from "@/lib/wallet-cloud-client";

export function TurnkeyExportPrivateKey({
  address,
  subOrganizationId,
  onBeforeTurnkeyModal,
}: {
  address: string;
  subOrganizationId: string;
  /**
   * Called right before the Turnkey export modal opens. The wallet settings use a native
   * <dialog> (top layer, everything else inert), so it must close first or the Turnkey
   * modal renders underneath it and cannot be clicked.
   */
  onBeforeTurnkeyModal?: () => void;
}) {
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startExport = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const ready = await confirmTurnkeyExportReady();
      if (ready.address.toLowerCase() !== address.trim().toLowerCase()) {
        throw new WalletCloudError("address_mismatch");
      }
      const bridge = getTurnkeyBrowserBridge();
      if (!bridge?.exportWalletAccount) throw new WalletCloudError("turnkey_client_unready");
      const organizationId = ready.subOrganizationId || subOrganizationId;
      if (bridge.ensureSession && !(await bridge.ensureSession({ subOrganizationId: organizationId }))) {
        throw new WalletCloudError("reauth_required");
      }
      setOpen(false);
      onBeforeTurnkeyModal?.();
      // Upgraded vault wallets were imported as a Turnkey private key, not a wallet account.
      const exportedImported = bridge.exportPrivateKey
        ? await bridge.exportPrivateKey({ address: ready.address, organizationId })
        : false;
      if (!exportedImported) {
        await bridge.exportWalletAccount({ address: ready.address, organizationId });
      }
    } catch (err) {
      const code = err instanceof WalletCloudError ? err.code : "export_failed";
      setError(code === "reauth_required" ? c.exportPrivateKeyReauth : c.exportPrivateKeyFailed);
    } finally {
      setBusy(false);
    }
  }, [address, c.exportPrivateKeyFailed, c.exportPrivateKeyReauth, onBeforeTurnkeyModal, subOrganizationId]);

  return (
    <div className="space-y-3" data-testid="turnkey-export-private-key">
      <button
        type="button"
        className="text-sm text-ink-2"
        data-testid="turnkey-export-open"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {c.exportPrivateKeyCta}
      </button>
      {open ? (
        <div className="space-y-3 rounded-2xl border border-warm/40 bg-surface-2 p-4">
          <p className="text-sm font-semibold text-warm">{c.exportPrivateKeyCta}</p>
          <p className="text-sm leading-relaxed text-ink-2">{c.exportPrivateKeyWarning}</p>
          {error ? (
            <p className="text-sm text-warm" role="alert">
              {error}{" "}
              {error === c.exportPrivateKeyReauth ? (
                <a href="/login" className="font-semibold text-brand hover:underline">
                  /login
                </a>
              ) : null}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              data-testid="turnkey-export-confirm"
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-40"
              onClick={() => void startExport()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {c.exportPrivateKeyConfirm}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl border border-line px-4 py-2 text-sm"
              onClick={() => setOpen(false)}
            >
              {c.exportPrivateKeyCancel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
