"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { networkJson } from "@/lib/network-client";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { explorerCopy } from "@/lib/explorer-copy";
import { NetworkStatus } from "@/components/NetworkStatus";
import { Eyebrow } from "@/components/ui/primitives";
import { SkeletonRows } from "./ExplorerSkeleton";
import { SampleContracts } from "./SampleContracts";
import { ExplorerSubnav } from "./ExplorerSubnav";

/**
 * `initialLoaded` tells the client the server already settled this list's initial state, so the
 * first frame shows the empty state instead of a skeleton. On the EVM chain that is always the
 * case — there is nothing to fetch (see the E2E-M1 note below) — and waiting for hydration only to
 * flip to the same empty list is pure delay. The legacy chain keeps fetching in the effect, and
 * with `initialLoaded` unset it renders exactly as it did before.
 */
export function ContractList({ initialLoaded = false }: { initialLoaded?: boolean } = {}) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const [items, setItems] = useState<Array<{ address: string; creator: string; codeSize: number }>>([]);

  const [loading, setLoading] = useState(!initialLoaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    // E2E-M1: the legacy compat layer has no `contracts` index (only `contracts/<address>`), so
    // on the EVM chain the request would 404 on every load. There is no EVM-native contract
    // index yet, so skip the fetch and show the empty state instead of a spurious error.
    if (isCosmosEvmChain()) {
      setLoading(false);
      return () => { alive = false; };
    }
    void networkJson<typeof items>("contracts")
      .then((body) => { if (alive) setItems(Array.isArray(body) ? body : []); })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Eyebrow>
        <Link href="/explorer">{t.title}</Link>
      </Eyebrow>
      <h1 className="mt-3 text-h2 font-bold">{t.contracts}</h1>
      <ExplorerSubnav />
      <div className="mt-4">
        <NetworkStatus />
      </div>
      <div className="mt-8">
        <SampleContracts />
      </div>
      {failed ? <p role="alert" className="mt-6 text-warm">{t.networkUnavailable}</p> : null}
      {loading ? <SkeletonRows /> : null}
      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line" aria-busy={loading} hidden={loading}>
        {!loading && !failed && items.length === 0 ? <li className="px-4 py-3 text-sm text-ink-3">{t.empty}</li> : null}
        {items.map((item) => (
          <li key={item.address} className="px-4 py-3 text-sm">
            <Link className="font-mono text-brand" href={`/explorer/contract/${item.address}`}>
              {item.address}
            </Link>
            <p className="text-xs text-ink-3">{t.contractCodeSize.replace("{size}", String(item.codeSize))}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
