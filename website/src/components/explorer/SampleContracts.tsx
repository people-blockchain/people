"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits, zeroAddress, type Address } from "viem";
import { erc20Abi } from "@/lib/evm/client";
import { useLanguage } from "@/context/LanguageContext";
import { describePreflightError } from "@/lib/tx-preflight-copy";
import { useExternalWallet, readPublicClient, sendViaActiveSigner, writeViaActiveSigner } from "@/context/ExternalWalletContext";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { samplesCopy } from "@/lib/samples-copy";
import { sampleTemplates, testStablecoinAbi, PAY_ASSETS, type PayAssetId, type SampleTemplate } from "@/lib/sample-contracts";
import { defaultSampleArgs, encodeSampleArgs, parseSampleValuePpl, parseSampleAmount } from "@/lib/sample-contract-deploy";
import { buildContractDeployTx, classifyContractDeployError, contractAddressFromReceipt } from "@/lib/evm/contract-deploy";
import { Chip } from "@/components/ui/primitives";

/** Constructor field holding the chosen pay-asset's amount, for templates with a "Pay in" selector. */
const PAY_AMOUNT_FIELD: Record<string, string> = { escrow: "amount_", crowdfund: "goal_" };

type DeployState = {
  open: boolean;
  args: Record<string, string>;
  value: string;
  payAsset: PayAssetId;
  busy: boolean;
  error: string;
  invalidField: string | null;
  result: { address: Address; hash: string } | null;
  approveBusy: boolean;
  approveDone: boolean;
  depositBusy: boolean;
  depositDone: boolean;
  settleError: string;
};

function emptyDeployState(): DeployState {
  return {
    open: false,
    args: {},
    value: "",
    payAsset: "PPL",
    busy: false,
    error: "",
    invalidField: null,
    result: null,
    approveBusy: false,
    approveDone: false,
    depositBusy: false,
    depositDone: false,
    settleError: "",
  };
}

function FaucetButton() {
  const { lang } = useLanguage();
  const t = samplesCopy[lang];
  const { signer } = useExternalWallet();
  const [busy, setBusy] = useState<PayAssetId | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<PayAssetId[]>([]);
  const [balances, setBalances] = useState<Partial<Record<PayAssetId, string>>>({});
  const [showConnect, setShowConnect] = useState(false);

  useEffect(() => {
    if (signer) setShowConnect(false);
  }, [signer]);

  const mint = async (assetId: PayAssetId) => {
    if (!signer) {
      setShowConnect(true);
      return;
    }
    const asset = PAY_ASSETS.find((a) => a.id === assetId);
    if (!asset || asset.address === zeroAddress) return;
    setBusy(assetId);
    setError("");
    try {
      const hash = await writeViaActiveSigner(signer, {
        address: asset.address,
        abi: testStablecoinAbi(),
        functionName: "mint",
        args: [],
      });
      const client = readPublicClient();
      await client.waitForTransactionReceipt({ hash });
      const balance = await client.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [signer.address],
      });
      setBalances((prev) => ({ ...prev, [assetId]: formatUnits(balance, asset.decimals) }));
      setDone((prev) => (prev.includes(assetId) ? prev : [...prev, assetId]));
    } catch (err) {
      const detail = describePreflightError(err, lang)?.text ?? classifyContractDeployError(err).detail;
      setError(/faucetcooldown/i.test(detail) ? t.faucetCooldown : detail);
    } finally {
      setBusy(null);
    }
  };

  const faucetAssets = PAY_ASSETS.filter((a) => a.id !== "PPL" && a.address !== zeroAddress);
  if (faucetAssets.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {faucetAssets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink-2 hover:border-brand hover:text-brand disabled:opacity-50"
            disabled={busy === asset.id}
            onClick={() => void mint(asset.id)}
          >
            {busy === asset.id
              ? t.faucetMinting
              : done.includes(asset.id)
                ? t.faucetDone
                : t.faucetCta.replace("{symbol}", asset.symbol)}
          </button>
        ))}
      </div>
      {faucetAssets.map((asset) =>
        balances[asset.id] ? (
          <p key={asset.id} className="text-xs text-ink-2">
            {t.faucetBalance.replace("{amount}", balances[asset.id] as string).replace("{symbol}", asset.symbol)}{" "}
            <span className="text-ink-3">{t.faucetLimitHint}</span>
          </p>
        ) : null
      )}
      {error ? <p className="text-xs text-warm">{error}</p> : null}
      {showConnect && !signer ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-3">{t.connectFirst}</p>
          <ConnectWalletMenu />
        </div>
      ) : null}
    </div>
  );
}

function TemplateCard({ template }: { template: SampleTemplate }) {
  const { lang } = useLanguage();
  const t = samplesCopy[lang];
  const { signer } = useExternalWallet();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deploy, setDeploy] = useState<DeployState>(emptyDeployState());

  const copyText = t.templates[template.id] ?? { title: template.id, description: "" };
  const payAmountField = PAY_AMOUNT_FIELD[template.id];
  const asset = PAY_ASSETS.find((a) => a.id === deploy.payAsset) ?? PAY_ASSETS[0];
  const isErc20Asset = asset.address !== zeroAddress;

  useEffect(() => {
    if (!signer || !deploy.open) return;
    const walletFields = template.fields.filter((f) => f.prefill === "wallet" && !deploy.args[f.name]);
    if (walletFields.length === 0) return;
    setDeploy((prev) => ({
      ...prev,
      args: walletFields.reduce((args, f) => ({ ...args, [f.name]: signer.address }), { ...prev.args }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signer, deploy.open]);

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(template.source);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied; the source is still visible to select/copy manually.
    }
  };

  const runDeploy = async () => {
    if (!signer) return;
    const args = { ...deploy.args };
    let value = BigInt(0);
    let decimalsOverride: Record<string, number> | undefined;
    if (template.supportsPayAsset) {
      args.token_ = asset.address;
      decimalsOverride = payAmountField ? { [payAmountField]: asset.decimals } : undefined;
      if (template.payable && payAmountField) {
        const parsed = parseSampleAmount(deploy.args[payAmountField] ?? "", asset.decimals);
        if (parsed == null) {
          setDeploy((prev) => ({ ...prev, invalidField: payAmountField, error: "" }));
          return;
        }
        value = asset.id === "PPL" ? parsed : BigInt(0);
      }
    } else if (template.payable) {
      const parsed = parseSampleValuePpl(deploy.value);
      if (parsed == null) {
        setDeploy((prev) => ({ ...prev, invalidField: "value", error: "" }));
        return;
      }
      value = parsed;
    }
    const encoded = encodeSampleArgs(template, args, decimalsOverride);
    if (!encoded.ok) {
      setDeploy((prev) => ({ ...prev, invalidField: encoded.field, error: "" }));
      return;
    }
    setDeploy((prev) => ({ ...prev, busy: true, error: "", invalidField: null, result: null }));
    try {
      const tx = buildContractDeployTx({ data: encoded.data, value });
      const client = readPublicClient();
      const hash = await sendViaActiveSigner(signer, tx);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`receipt: deploy reverted (${hash})`);
      const address = contractAddressFromReceipt(receipt);
      if (!address) throw new Error("contract address not found in the deploy receipt");
      setDeploy((prev) => ({ ...prev, busy: false, result: { address, hash } }));
    } catch (err) {
      setDeploy((prev) => ({ ...prev, busy: false, error: describePreflightError(err, lang)?.text ?? classifyContractDeployError(err).detail }));
    }
  };

  const runApproveAndDeposit = async () => {
    if (!signer || !deploy.result || !payAmountField) return;
    const parsed = parseSampleAmount(deploy.args[payAmountField] ?? "", asset.decimals);
    if (parsed == null) return;
    setDeploy((prev) => ({ ...prev, approveBusy: true, settleError: "" }));
    try {
      const approveHash = await writeViaActiveSigner(signer, {
        address: asset.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [deploy.result.address, parsed],
      });
      const client = readPublicClient();
      await client.waitForTransactionReceipt({ hash: approveHash });
      setDeploy((prev) => ({ ...prev, approveBusy: false, approveDone: true }));
    } catch (err) {
      setDeploy((prev) => ({ ...prev, approveBusy: false, settleError: describePreflightError(err, lang)?.text ?? classifyContractDeployError(err).detail }));
      return;
    }
    setDeploy((prev) => ({ ...prev, depositBusy: true }));
    try {
      const depositHash = await writeViaActiveSigner(signer, {
        address: deploy.result.address,
        abi: template.abi,
        functionName: "deposit",
        args: [],
      });
      const client = readPublicClient();
      await client.waitForTransactionReceipt({ hash: depositHash });
      setDeploy((prev) => ({ ...prev, depositBusy: false, depositDone: true }));
    } catch (err) {
      setDeploy((prev) => ({ ...prev, depositBusy: false, settleError: describePreflightError(err, lang)?.text ?? classifyContractDeployError(err).detail }));
    }
  };

  const needsApproveDeposit = template.id === "escrow" && isErc20Asset && deploy.result && !deploy.depositDone;

  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-ink">{copyText.title}</h3>
        <Chip tone="neutral">{template.fileName}</Chip>
      </div>
      <p className="mt-2 text-sm text-ink-2">{copyText.description}</p>

      <div className="mt-3 text-xs">
        {template.testnetAddress ? (
          <Link
            className="break-all font-mono text-brand hover:underline"
            href={`/explorer/contract/${template.testnetAddress}`}
          >
            {t.testnetAddress}: {template.testnetAddress}
          </Link>
        ) : (
          <p className="text-ink-3">
            {t.testnetAddress}: {t.notDeployed}
          </p>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2 hover:border-brand hover:text-brand"
          onClick={() => setSourceOpen((v) => !v)}
        >
          {sourceOpen ? t.hideSource : t.viewSource}
        </button>
        {sourceOpen ? (
          <div className="mt-3 w-full min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ink-3">{template.fileName}</span>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-brand hover:text-brand"
                onClick={() => void copySource()}
              >
                {copied ? t.copied : t.copy}
              </button>
            </div>
            <pre className="mt-2 max-h-72 w-full min-w-0 overflow-auto rounded-xl border border-line bg-surface-2 p-3 text-xs">
              <code>{template.source}</code>
            </pre>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        {!deploy.open ? (
          <button
            type="button"
            className="min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
            onClick={() =>
              setDeploy((prev) => ({ ...prev, open: true, args: defaultSampleArgs(template, signer?.address) }))
            }
          >
            {t.deployCta}
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
            <p className="text-sm font-semibold text-ink">{t.constructorArgs}</p>

            {template.supportsPayAsset ? (
              <label className="block text-sm">
                <span className="text-ink-2">{t.fields.payIn}</span>
                <select
                  value={deploy.payAsset}
                  onChange={(e) => setDeploy((prev) => ({ ...prev, payAsset: e.target.value as PayAssetId }))}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                >
                  {PAY_ASSETS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.symbol}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {template.fields
              .filter((field) => field.prefill !== "asset")
              .map((field) => (
                <label key={field.name} className="block text-sm">
                  <span className="text-ink-2">
                    {field.name === payAmountField
                      ? (t.fields[field.labelKey] ?? field.name).replace("{symbol}", asset.symbol)
                      : t.fields[field.labelKey] ?? field.name}
                  </span>
                  <input
                    type="text"
                    spellCheck={false}
                    autoComplete="off"
                    value={deploy.args[field.name] ?? ""}
                    onChange={(e) =>
                      setDeploy((prev) => ({ ...prev, args: { ...prev.args, [field.name]: e.target.value } }))
                    }
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    aria-invalid={deploy.invalidField === field.name}
                  />
                  {deploy.invalidField === field.name ? (
                    <span className="mt-1 block text-xs text-warm" role="status">
                      {field.kind === "address"
                        ? t.invalidAddress
                        : field.kind === "uint256"
                          ? t.invalidNumber
                          : t.invalidText}
                    </span>
                  ) : null}
                </label>
              ))}
            {template.payable && !template.supportsPayAsset ? (
              <label className="block text-sm">
                <span className="text-ink-2">{t.fields.value}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  value={deploy.value}
                  onChange={(e) => setDeploy((prev) => ({ ...prev, value: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                  aria-invalid={deploy.invalidField === "value"}
                />
                {deploy.invalidField === "value" ? (
                  <span className="mt-1 block text-xs text-warm" role="status">
                    {t.invalidNumber}
                  </span>
                ) : null}
              </label>
            ) : null}

            {!signer ? (
              <div className="space-y-2">
                <p className="text-xs text-ink-3">{t.connectFirst}</p>
                <ConnectWalletMenu />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
                  disabled={deploy.busy}
                  onClick={() => void runDeploy()}
                >
                  {deploy.busy ? t.deploying : t.deployButton}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-2"
                  disabled={deploy.busy}
                  onClick={() => setDeploy(emptyDeployState())}
                >
                  {t.cancel}
                </button>
              </div>
            )}

            {deploy.error ? <p className="text-sm text-warm">{deploy.error}</p> : null}
            {deploy.result ? (
              <div className="space-y-1 rounded-lg border border-value/40 bg-surface p-3 text-sm">
                <p className="font-semibold text-ink">{t.success}</p>
                <p className="break-all">
                  {t.contractAddress}:{" "}
                  <Link
                    className="font-mono text-brand hover:underline"
                    href={`/explorer/contract/${deploy.result.address}`}
                  >
                    {deploy.result.address}
                  </Link>
                </p>
                <p className="break-all">
                  {t.transaction}:{" "}
                  <Link
                    className="font-mono text-brand hover:underline"
                    href={`/explorer/tx/${encodeURIComponent(deploy.result.hash)}`}
                  >
                    {deploy.result.hash}
                  </Link>
                </p>
                {needsApproveDeposit ? (
                  <div className="mt-2 space-y-2 border-t border-line pt-2">
                    <p className="text-xs text-ink-2">{t.approveDepositLead}</p>
                    <button
                      type="button"
                      className="min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
                      disabled={deploy.approveBusy || deploy.depositBusy || deploy.approveDone}
                      onClick={() => void runApproveAndDeposit()}
                    >
                      {deploy.approveBusy
                        ? t.approving
                        : deploy.depositBusy
                          ? t.depositing
                          : deploy.approveDone
                            ? t.depositing
                            : t.approveAndDeposit}
                    </button>
                    {deploy.settleError ? <p className="text-sm text-warm">{deploy.settleError}</p> : null}
                  </div>
                ) : null}
                {template.id === "escrow" && isErc20Asset && deploy.depositDone ? (
                  <p className="text-xs text-value">{t.depositComplete}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function SampleContracts() {
  const { lang } = useLanguage();
  const t = samplesCopy[lang];
  const templates = sampleTemplates();

  return (
    <section className="mt-2">
      <h2 className="text-h3 font-bold text-ink">{t.title}</h2>
      <p className="mt-2 text-sm text-ink-2">{t.lead}</p>
      <FaucetButton />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </section>
  );
}
