"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { AssetInfo } from "@/lib/asset-amounts";
import { AssetImage } from "@/components/ui/AssetImage";
import { displaySymbol } from "@/lib/ux-copy";
import type { UxCopy } from "@/lib/ux-copy";

export type SwapTokenPickerLabels = {
  title: string;
  search: string;
  empty: string;
  close: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  tokens: AssetInfo[];
  selectedId: string;
  onSelect: (assetId: string) => void;
  labels: SwapTokenPickerLabels;
  ux: UxCopy;
};

export function SwapTokenPicker({ open, onClose, tokens, selectedId, onSelect, labels, ux }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tokens.filter((t) => t.assetId !== "ppl");
    if (!q) return list;
    return list.filter((t) => {
      const sym = (t.symbol ?? "").toLowerCase();
      const name = (t.name ?? "").toLowerCase();
      const id = t.assetId.toLowerCase();
      return sym.includes(q) || name.includes(q) || id.includes(q);
    });
  }, [tokens, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={labels.title}>
      <button type="button" className="absolute inset-0" aria-label={labels.close} onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(85vh,520px)] w-full max-w-md flex-col rounded-2xl border border-line bg-canvas shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="text-base font-bold text-ink">{labels.title}</h3>
          <button type="button" className="rounded-lg p-2 text-ink-2 hover:bg-surface" onClick={onClose} aria-label={labels.close}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              type="search"
              className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand"
              placeholder={labels.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </label>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-ink-3">{labels.empty}</li>
          ) : (
            filtered.map((token) => {
              const sym = displaySymbol(token.assetId, token.symbol, ux);
              const active = token.assetId === selectedId;
              return (
                <li key={token.assetId}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${active ? "bg-brand/10 ring-1 ring-brand" : "hover:bg-surface"}`}
                    onClick={() => {
                      onSelect(token.assetId);
                      onClose();
                      setQuery("");
                    }}
                  >
                    <AssetImage assetId={token.assetId} tokenAddress={token.tokenAddress} src={token.creationMetadata?.image} name={sym} className="h-9 w-9" testBadgeLabel={ux.testTokenNote} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{sym}</span>
                      {token.name ? <span className="block truncate text-xs text-ink-3">{token.name}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
