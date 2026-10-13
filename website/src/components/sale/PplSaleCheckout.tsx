"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { saleCopy } from "@/lib/sale/copy";
import type { SaleNetworkId } from "@/lib/sale/networks";

type SaleConfig = {
  soldPpl: number;
  supplyPpl: number;
  spotUsdt: number;
  minUsdt: number;
  maxUsdt: number;
  networks: {
    id: SaleNetworkId;
    kind: string;
    label: string;
    enabled: boolean;
    pendingBadge: boolean;
    stables: string[];
    receiverAddress?: string;
    saleContract?: string;
  }[];
};

type OrderView = {
  id: string;
  paymentAmount: string;
  paymentMemo: string | null;
  pplQuoted: number;
  usdtQuoted: number;
  expiresAt: string;
  status?: string;
  deliveryTxId?: string | null;
};

export function PplSaleCheckout({ compact }: { compact?: boolean }) {
  const { lang } = useLanguage();
  const t = saleCopy[lang] ?? saleCopy.en;
  const [config, setConfig] = useState<SaleConfig | null>(null);
  const [networkId, setNetworkId] = useState<SaleNetworkId>("bsc");
  const [stable, setStable] = useState("usdt");
  const [peopleAddress, setPeopleAddress] = useState("");
  const [payerAddress, setPayerAddress] = useState("");
  const [usdtAmount, setUsdtAmount] = useState("100");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/sale/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setConfig(data as SaleConfig))
      .catch(() => setConfig(null));
  }, []);

  const network = useMemo(
    () => config?.networks.find((n) => n.id === networkId),
    [config, networkId]
  );

  // M05-7: Tron/TON/Solana orders are bound to the exact wallet the buyer pays from, so an
  // unrelated transfer of the same amount can't satisfy someone else's order. EVM purchases
  // are already bound on-chain (the Purchased event names the People address), so the field
  // is only shown — and only sent — for the non-EVM rails.
  const needsPayerAddress = Boolean(network && network.kind !== "evm");

  useEffect(() => {
    if (!order?.id || order.status === "delivered") return;
    const id = order.id;
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/sale/orders/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as OrderView & { status: string };
      setOrder((prev) => (prev ? { ...prev, status: body.status, deliveryTxId: body.deliveryTxId } : prev));
      if (body.status === "delivered") window.clearInterval(timer);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [order?.id, order?.status]);

  const createOrder = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/sale/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          networkId,
          stable,
          peopleAddress,
          payerAddress: needsPayerAddress ? payerAddress : undefined,
          usdtAmount: Number(usdtAmount),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "order_failed");
        return;
      }
      setOrder(body as OrderView);
    } finally {
      setLoading(false);
    }
  };

  if (!config) {
    return <p className="text-sm text-ink-3">{t.poll}</p>;
  }

  return (
    <div className={compact ? "space-y-4" : "mt-6 space-y-4 rounded-2xl border border-line bg-surface p-5"}>
      {!compact && (
        <>
          <h3 className="text-base font-bold text-ink">{t.title}</h3>
          <p className="text-sm text-ink-2">{t.lead}</p>
          <p className="text-xs text-ink-3">{t.networksList}</p>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-ink">{t.network}</span>
          <select
            className={`mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm ${
              network && !network.enabled ? "opacity-60" : ""
            }`}
            value={networkId}
            onChange={(e) => setNetworkId(e.target.value as SaleNetworkId)}
          >
            {config.networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
                {n.pendingBadge && !n.enabled ? ` — ${t.pendingBadge}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">{t.stable}</span>
          <select
            className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm"
            value={stable}
            onChange={(e) => setStable(e.target.value)}
          >
            {(network?.stables ?? ["usdt"]).map((s) => (
              <option key={s} value={s}>{s.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-ink">{t.peopleAddress}</span>
          <input
            className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-sm"
            value={peopleAddress}
            onChange={(e) => setPeopleAddress(e.target.value)}
            placeholder="0x…"
            autoComplete="off"
          />
        </label>
        {needsPayerAddress && (
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-ink">{t.payerAddress}</span>
            <input
              className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-sm"
              value={payerAddress}
              onChange={(e) => setPayerAddress(e.target.value)}
              placeholder={network?.id === "ton" ? "UQ… / 0:…" : network?.id === "solana" ? "Base58…" : "T…"}
              autoComplete="off"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="font-medium text-ink">{t.amountUsdt}</span>
          <input
            type="number"
            min={config.minUsdt}
            max={config.maxUsdt}
            className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-sm"
            value={usdtAmount}
            onChange={(e) => setUsdtAmount(e.target.value)}
          />
        </label>
        <div className="flex items-end text-sm text-ink-2">
          <span>
            {t.quotePpl}:{" "}
            <span className="font-mono font-semibold text-brand">
              {config.spotUsdt.toFixed(4)} USDT spot · {config.soldPpl.toLocaleString()} / {config.supplyPpl.toLocaleString()} sold
            </span>
          </span>
        </div>
      </div>

      {network && !network.enabled && (
        <p className="rounded-xl border border-warm/30 bg-warm/10 px-3 py-2 text-sm text-ink-2">{t.unavailable}</p>
      )}

      <button
        type="button"
        disabled={loading || !network?.enabled || (needsPayerAddress && !payerAddress.trim())}
        onClick={createOrder}
        className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
      >
        {t.createOrder}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {order && (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm text-ink-2">
          <p>
            {t.payTransfer}{" "}
            <span className="font-mono font-bold text-ink">{order.paymentAmount} {stable.toUpperCase()}</span>
          </p>
          {network?.receiverAddress && (
            <p className="mt-2 break-all">
              {t.receiver}: <span className="font-mono text-ink">{network.receiverAddress}</span>
            </p>
          )}
          {order.paymentMemo && (
            <p className="mt-2">
              {t.payMemo}: <span className="font-mono">{order.paymentMemo}</span>
            </p>
          )}
          <p className="mt-2 font-mono text-xs text-ink-3">
            {t.status}: {order.status ?? "pending_payment"} · {t.expires}: {new Date(order.expiresAt).toLocaleString(lang)}
          </p>
          {order.deliveryTxId && (
            <p className="mt-2 text-brand">{t.delivered}: {order.deliveryTxId}</p>
          )}
        </div>
      )}
    </div>
  );
}
