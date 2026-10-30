"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Address } from "viem";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { useLanguage } from "@/context/LanguageContext";
import { describePreflightError } from "@/lib/tx-preflight-copy";
import {
  readPublicClient,
  sendViaActiveSigner,
  useExternalWallet,
} from "@/context/ExternalWalletContext";
import { networkJson } from "@/lib/network-client";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import {
  buildContractDeployTx,
  classifyContractDeployError,
  contractAddressFromReceipt,
} from "@/lib/evm/contract-deploy";
import {
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  TYPICAL_CONTRACT_DEPLOY_FEE_PPL,
} from "@/lib/factory-fees";
import {
  defaultGasLimitFromEstimate,
  estimateContractDeployGas,
  quoteContractFeePpl,
} from "@/lib/contract-gas-estimate";
import { Chip, Eyebrow } from "@/components/ui/primitives";
import { contractCopy, type ContractCopy } from "@/lib/contract-copy";
import { crowdfundCopy } from "@/lib/crowdfund/campaign-copy";
import { formatPpl } from "@/lib/asset-amounts";
import {
  constructorFields,
  defaultFieldValue,
  deployBytecode,
  encodeConstructorArgs,
  splitDaysHours,
  type ConstructorField,
} from "@/lib/contract-constructor";

interface ComposeResult {
  templateId: string;
  title: string;
  summary: string;
  source: string;
  fileName: string;
  warning?: string;
  aiUsed?: boolean;
  audited?: boolean;
}

interface CompileResult {
  name: string;
  bytecode: string;
  abi: unknown;
}

interface Params {
  gasPricePpl?: number;
  quoteDeployFeePpl?: number;
  quoteTypicalDeployFeePpl?: number;
  typicalDeployGas?: number;
  defaultTxGasLimit?: number;
  ownerApprovedPublicTariff?: boolean;
}

/** Two whole-number inputs (days, hours) stored as "D:H" (see `parseDaysHours`). */
function DaysHoursInput({
  id,
  value,
  invalid,
  daysLabel,
  hoursLabel,
  onChange,
}: {
  id: string;
  value: string;
  invalid: boolean;
  daysLabel: string;
  hoursLabel: string;
  onChange: (next: string) => void;
}) {
  const { days, hours } = splitDaysHours(value);
  const digits = (text: string) => text.replace(/\D/g, "").slice(0, 5);
  const box = "w-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm";
  return (
    <span className="mt-1 flex items-center gap-2">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-invalid={invalid}
        aria-label={daysLabel}
        autoComplete="off"
        value={days}
        onChange={(e) => onChange(`${digits(e.target.value)}:${hours}`)}
        className={box}
      />
      <span className="text-ink-2">{daysLabel}</span>
      <input
        type="text"
        inputMode="numeric"
        aria-invalid={invalid}
        aria-label={hoursLabel}
        autoComplete="off"
        value={hours}
        onChange={(e) => onChange(`${days}:${digits(e.target.value)}`)}
        className={box}
      />
      <span className="text-ink-2">{hoursLabel}</span>
    </span>
  );
}

export function ContractWizard() {
  const { lang } = useLanguage();
  const t: ContractCopy = (contractCopy as Record<string, ContractCopy>)[lang] ?? contractCopy.en;
  const { signer } = useExternalWallet();
  const searchParams = useSearchParams();
  const prefillCrowdfund = searchParams?.get("template") === "crowdfund";
  const promptEdited = useRef(false);
  const [prompt, setPrompt] = useState(prefillCrowdfund ? t.crowdfundPrompt : "");
  const [compose, setCompose] = useState<ComposeResult | null>(null);
  const [compiled, setCompiled] = useState<CompileResult | null>(null);
  const [params, setParams] = useState<Params | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deployed, setDeployed] = useState<{ address: Address; hash: string } | null>(null);
  const [gasEstimate, setGasEstimate] = useState<number | null>(null);
  const [gasLimit, setGasLimit] = useState<number | null>(null);
  const [ctorEdits, setCtorEdits] = useState<Record<string, string>>({});

  const cf = crowdfundCopy[lang];
  const ctorFields = useMemo<ConstructorField[]>(() => {
    try {
      return compiled ? constructorFields(compiled.abi, compose?.templateId) : [];
    } catch {
      return [];
    }
  }, [compiled, compose?.templateId]);
  const ctorValues = useMemo(
    () =>
      Object.fromEntries(
        ctorFields.map((field) => [field.name, ctorEdits[field.name] ?? defaultFieldValue(field, signer?.address)])
      ) as Record<string, string>,
    [ctorFields, ctorEdits, signer?.address]
  );
  const ctorEncoded = useMemo(() => encodeConstructorArgs(ctorFields, ctorValues), [ctorFields, ctorValues]);

  const gasPricePpl = params?.gasPricePpl ?? APPROVED_CONTRACT_GAS_PRICE_PPL;
  const typicalDeployFee =
    params?.quoteTypicalDeployFeePpl ?? TYPICAL_CONTRACT_DEPLOY_FEE_PPL;

  useEffect(() => {
    // Landing from the "Start crowdfunding" card: keep the prefill in the visitor's language until they type.
    if (prefillCrowdfund && !promptEdited.current) setPrompt(t.crowdfundPrompt);
  }, [prefillCrowdfund, t.crowdfundPrompt]);

  useEffect(() => {
    // E2E-M1: on the EVM chain the legacy compat layer only implements `contracts/<address>`,
    // so `contracts/params` would 404 on every load. Keep the built-in tariff constants.
    if (isCosmosEvmChain()) return;
    void networkJson<Params>("contracts/params")
      .then(setParams)
      .catch(() => setParams(null));
  }, []);

  const generate = async () => {
    setBusy(true);
    setError("");
    setCompiled(null);
    setDeployed(null);
    setGasEstimate(null);
    setGasLimit(null);
    try {
      const res = await fetch("/api/contracts/compose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, lang })
      });
      const body = (await res.json()) as ComposeResult & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? t.error);
      }
      setCompose(body);
      setGasEstimate(null);
      setGasLimit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const compile = async () => {
    if (!compose) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/contracts/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: compose.source,
          fileName: compose.fileName,
          templateId: compose.templateId
        })
      });
      const body = (await res.json()) as CompileResult & { error?: string; details?: string[] };
      if (!res.ok) {
        throw new Error(body.details?.[0] ?? body.error ?? t.error);
      }
      setCompiled(body);
      setCtorEdits({});
      let argRoom = 0;
      try {
        argRoom = constructorFields(body.abi, compose.templateId).length + 8;
      } catch {
        argRoom = 8;
      }
      // Leave room for the encoded constructor inputs appended on deploy.
      const estimate = estimateContractDeployGas(body.bytecode + "ff".repeat(32 * argRoom));
      setGasEstimate(estimate);
      setGasLimit(defaultGasLimitFromEstimate(estimate));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const deploy = async () => {
    if (!signer || !compiled || gasLimit == null || !ctorEncoded.ok) return;
    setBusy(true);
    setError("");
    setDeployed(null);
    try {
      // A contract-creation tx: creation code + ABI-encoded constructor args in `data`, no `to`.
      const tx = buildContractDeployTx({ data: deployBytecode(compiled.bytecode, ctorEncoded.hex) });
      const client = readPublicClient();
      // Simulation + gas (eth_estimateGas * 1.2) happen inside sendViaActiveSigner; a deploy that
      // would revert is never sent. The limit shown above is only a fee quote.
      const hash = await sendViaActiveSigner(signer, tx);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`receipt: deploy reverted (${hash})`);
      const address = contractAddressFromReceipt(receipt);
      if (!address) throw new Error("contract address not found in the deploy receipt");
      setDeployed({ address, hash });
    } catch (err) {
      setError(describePreflightError(err, lang)?.text ?? classifyContractDeployError(err).detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Eyebrow>{t.tag}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight">{t.title}</h1>
      <p className="mt-3 text-lead text-ink-2">{t.lead}</p>
      <label htmlFor="contract-prompt" className="mt-6 block text-sm font-semibold text-ink">
        {t.label}
      </label>
      <textarea
        id="contract-prompt"
        data-testid="contract-prompt"
        className="mt-2 w-full rounded-2xl border border-line bg-surface-2 p-4 text-sm"
        rows={4}
        value={prompt}
        onChange={(e) => {
          promptEdited.current = true;
          setPrompt(e.target.value);
        }}
        placeholder={t.placeholder}
      />
      <p className="mt-2 text-xs text-ink-3">{t.examplesLabel}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {t.examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              promptEdited.current = true;
              setPrompt(example);
            }}
            className="min-h-11 rounded-full border border-line bg-surface px-3 py-2 text-left text-xs text-ink-2 hover:border-brand hover:text-brand"
          >
            {example}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
          disabled={busy || prompt.trim().length < 8}
          onClick={() => void generate()}
        >
          {t.generate}
        </button>
        {prompt.trim().length > 0 && prompt.trim().length < 8 ? (
          <span className="text-xs text-ink-3">{t.generateHint}</span>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-ink-3">{t.templates}</p>
      <div className="mt-6 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-ink-2">
        <p>
          {t.gasPrice}: <span className="font-mono text-ink">{gasPricePpl.toFixed(8)} {t.perGas}</span>
        </p>
        <p className="mt-1">
          {t.deployEstimate} <span className="font-mono text-ink">{formatPpl(typicalDeployFee)} PPL</span>
        </p>
        <p className="mt-2 text-xs text-ink-3">
          <Link href="/fees" className="text-brand hover:underline">
            {t.allFees}
          </Link>
        </p>
      </div>
      {compose ? (
        <div className="mt-8 space-y-4">
          <Chip tone="value">{compose.title}</Chip>
          <div>
            <h2 className="font-bold">{t.summary}</h2>
            <p className="mt-2 text-sm text-ink-2">{compose.summary}</p>
          </div>
          {compose.warning ? (
            <p className="text-xs text-warm">
              {t.warning}: {compose.warning}
            </p>
          ) : null}
          <div>
            <h2 className="font-bold">{t.source}</h2>
            <pre className="mt-2 max-h-80 overflow-auto rounded-2xl border border-line bg-surface-2 p-4 text-xs">
              {compose.source}
            </pre>
          </div>
          <button
            type="button"
            className="rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => void compile()}
          >
            {t.compile}
          </button>
          <p className="text-xs text-ink-3">{t.compileHint}</p>
        </div>
      ) : null}
      {compiled ? (
        <div className="mt-6 space-y-3 text-sm">
          {ctorFields.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4" data-testid="contract-settings">
              <div>
                <h2 className="font-bold text-ink">{t.settingsTitle}</h2>
                <p className="mt-1 text-xs text-ink-3">{t.settingsHint}</p>
              </div>
              {ctorFields.map((field) => {
                const label =
                  (t.fields as Record<string, string>)[field.labelKey] ??
                  (cf as Record<string, string>)[field.labelKey] ??
                  field.name;
                const value = ctorValues[field.name] ?? "";
                const invalid = !ctorEncoded.ok && ctorEncoded.field === field.name;
                const isNumber = field.kind === "count" || field.kind === "days" || field.kind === "hours" || field.kind === "tokenAmount";
                const common = {
                  id: `ctor-${field.name}`,
                  value,
                  "aria-invalid": invalid,
                  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setCtorEdits((prev) => ({ ...prev, [field.name]: e.target.value })),
                  className: "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm",
                };
                return (
                  <label key={field.name} htmlFor={`ctor-${field.name}`} className="block">
                    <span className="text-ink-2">{label}</span>
                    {field.kind === "addressList" ? (
                      <textarea {...common} rows={3} spellCheck={false} />
                    ) : field.kind === "duration" ? (
                      <DaysHoursInput
                        id={common.id}
                        value={value}
                        invalid={invalid}
                        daysLabel={cf.unitDays}
                        hoursLabel={cf.unitHours}
                        onChange={(next) => setCtorEdits((prev) => ({ ...prev, [field.name]: next }))}
                      />
                    ) : (
                      <input
                        {...common}
                        type="text"
                        inputMode={isNumber ? "decimal" : "text"}
                        spellCheck={false}
                        autoComplete="off"
                      />
                    )}
                    {invalid ? (
                      <span className="mt-1 block text-xs text-warm" role="status">
                        {ctorEncoded.reason === "address" ? t.invalidAddress : t.invalidNumber}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          ) : null}
          {gasEstimate != null && gasLimit != null ? (
            <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-4">
              <p>
                {t.gasEstimate}:{" "}
                <span className="font-mono text-ink">{gasEstimate.toLocaleString()} gas</span>
              </p>
              <label className="block">
                <span className="text-ink-2">{t.gasLimit}</span>
                <span className="mt-0.5 block text-xs text-ink-3">{t.gasLimitHint}</span>
                <input
                  type="number"
                  min={gasEstimate}
                  step={1_000}
                  value={gasLimit}
                  onChange={(e) => setGasLimit(Number(e.target.value) || gasEstimate)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm"
                />
              </label>
              <p>
                {t.maxPrepay}:{" "}
                <span className="font-mono text-ink">
                  {formatPpl(quoteContractFeePpl(gasLimit, gasPricePpl))} PPL
                </span>{" "}
                ({t.fee})
              </p>
            </div>
          ) : (
            <p className="text-ink-3">{t.noRpc}</p>
          )}
          <button
            type="button"
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
            disabled={busy || !signer || gasLimit == null || !ctorEncoded.ok}
            onClick={() => void deploy()}
          >
            {t.deploy}
          </button>
          {!signer ? (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-ink-3">{t.connectFirst}</p>
              <ConnectWalletMenu />
            </div>
          ) : null}
        </div>
      ) : null}
      {deployed ? (
        <div className="mt-4 space-y-2 rounded-2xl border border-value/40 bg-surface p-4 text-sm">
          <p className="font-semibold text-ink">{t.success}</p>
          <p className="break-all">
            {t.contractAddress}:{" "}
            <Link className="font-mono text-brand hover:underline" href={`/explorer/address/${deployed.address}`}>
              {deployed.address}
            </Link>
          </p>
          {compose?.templateId === "crowdfund" ? (
            <p>
              <Link className="font-semibold text-brand hover:underline" href={`/crowdfund/${deployed.address}`}>
                {cf.openCampaign}
              </Link>
            </p>
          ) : null}
          <p className="break-all">
            {t.transaction}:{" "}
            <Link
              className="font-mono text-brand hover:underline"
              href={`/explorer/tx/${encodeURIComponent(deployed.hash)}`}
            >
              {deployed.hash}
            </Link>
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-4 text-sm text-warm">{error}</p> : null}
    </section>
  );
}
