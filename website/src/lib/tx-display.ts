import {
  formatAssetAmount,
  formatPpl,
  formatPplExact,
  formatPplLabeled,
  symbolOf,
  txAmountAssetId,
  weiFromField,
  type AssetInfo,
} from "@/lib/asset-amounts";
import { displaySymbol, txTypeLabel, type UxCopy } from "@/lib/ux-copy";

export type TxLike = {
  type?: string;
  assetId?: string;
  amount?: number;
  fee?: number;
  amountWei?: string;
  feeWei?: string;
  payload?: Record<string, unknown> | null;
};

export type AmountMode = "compact" | "exact";

function nativeText(wei: bigint, mode: AmountMode, dustLabel?: string): string {
  if (mode === "exact") return `${formatPplExact(wei)} PPL`;
  return formatPplLabeled(wei, dustLabel);
}

/** "0.2 TPITP" — amount in the asset it is denominated in. Native PPL uses wei. */
export function txAmountText(tx: TxLike, assets: Record<string, AssetInfo>, u: UxCopy, mode: AmountMode = "compact"): string {
  const id = txAmountAssetId(tx);
  const wei = id === "ppl" ? weiFromField(tx.amountWei) : null;
  if (wei !== null) return nativeText(wei, mode, u.pplDust);
  const asset = assets[id];
  return `${formatAssetAmount(id, tx.amount ?? 0, asset)} ${displaySymbol(id, symbolOf(id, asset), u)}`;
}

export function txFeeText(tx: TxLike, mode: AmountMode = "compact", dustLabel?: string): string {
  const wei = weiFromField(tx.feeWei);
  if (wei !== null) return nativeText(wei, mode, dustLabel);
  return `${formatPpl(tx.fee ?? 0)} PPL`;
}

export function txSummary(tx: TxLike, assets: Record<string, AssetInfo>, u: UxCopy, feeLabel: string): string {
  const parts = [txTypeLabel(tx.type, u)];
  const amountWei = weiFromField(tx.amountWei);
  const showAmount = amountWei !== null ? amountWei > BigInt(0) : (tx.amount ?? 0) > 0;
  if (showAmount) parts.push(txAmountText(tx, assets, u, "compact"));
  parts.push(`${feeLabel} ${txFeeText(tx, "compact", u.pplDust)}`);
  return parts.join(" · ");
}

/** Full-precision native amount and fee, for a title or transaction details. */
export function txExactTitle(tx: TxLike): string {
  const parts: string[] = [];
  const amount = weiFromField(tx.amountWei);
  if (amount !== null) parts.push(`${formatPplExact(amount)} PPL`);
  const fee = weiFromField(tx.feeWei);
  if (fee !== null && fee > BigInt(0)) parts.push(`${formatPplExact(fee)} PPL`);
  return parts.join(" · ");
}
