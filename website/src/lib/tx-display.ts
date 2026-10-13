import { formatAssetAmount, formatPpl, symbolOf, txAmountAssetId, type AssetInfo } from "@/lib/asset-amounts";
import { displaySymbol, txTypeLabel, type UxCopy } from "@/lib/ux-copy";

export type TxLike = {
  type?: string;
  assetId?: string;
  amount?: number;
  fee?: number;
  payload?: Record<string, unknown> | null;
};

/** "0.2 TPITP" — amount in the asset it is denominated in, decimals applied. */
export function txAmountText(tx: TxLike, assets: Record<string, AssetInfo>, u: UxCopy): string {
  const id = txAmountAssetId(tx);
  const asset = assets[id];
  return `${formatAssetAmount(id, tx.amount ?? 0, asset)} ${displaySymbol(id, symbolOf(id, asset), u)}`;
}

export function txFeeText(tx: TxLike): string {
  return `${formatPpl(tx.fee ?? 0)} PPL`;
}

export function txSummary(tx: TxLike, assets: Record<string, AssetInfo>, u: UxCopy, feeLabel: string): string {
  const parts = [txTypeLabel(tx.type, u)];
  if ((tx.amount ?? 0) > 0) parts.push(txAmountText(tx, assets, u));
  parts.push(`${feeLabel} ${txFeeText(tx)}`);
  return parts.join(" · ");
}
