"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { networkJson } from "@/lib/network-client";
import { explorerCopy } from "@/lib/explorer-copy";
import { NetworkStatus } from "@/components/NetworkStatus";
import { PeopleLoader } from "@/components/ui/PeopleLoader";
import { Eyebrow } from "@/components/ui/primitives";

interface ContractView {
  address: string;
  creator?: string;
  code?: string;
  nonce?: number;
  verifiedSource?: { source?: string; templateId?: string; name?: string } | null;
  deployTxId?: string | null;
  receipts?: Array<{
    txId: string;
    status: number;
    gasUsed: number;
    logs: Array<{ topics: string[]; data: string }>;
  }>;
}

export function ContractExplorer({ address }: { address: string }) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const [data, setData] = useState<ContractView | null>(null);
  const [source, setSource] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    void networkJson<ContractView>(`contracts/${encodeURIComponent(address)}`)
      .then((body) => {
        setData(body);
        const text = body.verifiedSource?.source;
        setSource(typeof text === "string" ? text : "");
        setError("");
      })
      .catch(() => setError(t.contractNotFound));
  }, [address, t.contractNotFound]);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Eyebrow>
        <Link href="/explorer">{t.title}</Link>
      </Eyebrow>
      <h1 className="mt-3 text-h2 font-bold">{t.contractTitle}</h1>
      <p className="mt-2 break-all font-mono text-sm">{address}</p>
      <div className="mt-4">
        <NetworkStatus />
      </div>
      {error ? <p className="mt-4 text-sm text-warm">{error}</p> : null}
      {!data && !error ? <PeopleLoader /> : null}
      {data ? (
        <dl className="mt-6 space-y-3 text-sm">
          <div>
            <dt className="text-ink-3">{t.creator}</dt>
            <dd>
              {data.creator ? (
                <Link className="font-mono text-brand" href={`/explorer/address/${data.creator}`}>
                  {data.creator}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          {data.code ? (
            <details className="rounded-2xl border border-line bg-surface-2 p-3">
              <summary className="cursor-pointer text-sm font-medium text-ink-2">{t.technicalDetails}</summary>
              <div className="mt-3">
                <p className="text-xs text-ink-3">{t.contractBytecode}</p>
                <pre className="mt-2 max-h-56 overflow-auto text-xs">{data.code}</pre>
              </div>
            </details>
          ) : null}
        </dl>
      ) : null}
      <h2 className="mt-8 font-bold">{t.contractSource}</h2>
      <pre className="mt-2 max-h-80 overflow-auto rounded-2xl border border-line bg-surface-2 p-3 text-xs">
        {source || "—"}
      </pre>
      <h2 className="mt-8 font-bold">{t.contractCalls}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {(data?.receipts ?? []).length === 0 ? <li className="text-ink-3">{t.contractReceiptEmpty}</li> : null}
        {(data?.receipts ?? []).map((item) => (
          <li key={item.txId} className="rounded-xl border border-line p-3">
            <Link className="font-mono text-brand" href={`/explorer/tx/${encodeURIComponent(item.txId)}`}>
              {item.txId}
            </Link>
            <p>
              {t.contractReceiptMeta
                .replace("{status}", String(item.status))
                .replace("{gas}", String(item.gasUsed))
                .replace("{logs}", String(item.logs.length))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
