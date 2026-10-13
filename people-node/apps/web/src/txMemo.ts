import { formatTxMemo, formatPaymentMemos, getTxMemo, getBatchRecipients, getPaymentMemoForAddress, MAX_TRANSFER_MEMO_LENGTH } from "@ovn/sdk";

export const MAX_TX_MEMO_LENGTH = MAX_TRANSFER_MEMO_LENGTH;

export { formatTxMemo, formatPaymentMemos, getTxMemo, getBatchRecipients, getPaymentMemoForAddress };

export function hasTxMemo(tx: Pick<import("@ovn/protocol").Transaction, "payload" | "type">): boolean {
  return formatPaymentMemos(tx) !== null;
}
