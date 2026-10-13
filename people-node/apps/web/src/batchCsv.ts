import { isWalletAddress } from "./address.js";
import { csvSafeCell } from "./csvExport.js";
import { MAX_TX_MEMO_LENGTH } from "./txMemo.js";

export interface BatchCsvRow {
  line: number;
  to: string;
  amount: number;
  memo?: string;
  ok: boolean;
  error?: string;
}

export interface BatchCsvParseResult {
  rows: BatchCsvRow[];
  valid: Array<{ to: string; amount: number; memo?: string }>;
  invalidCount: number;
  totalAmount: number;
}

/** Parse CSV/text: address,amount[,memo] — header row optional. */
export function parseBatchCsv(text: string, maxRecipients: number): BatchCsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: BatchCsvRow[] = [];
  const valid: Array<{ to: string; amount: number; memo?: string }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;
    if (i === 0 && /address|to|recipient/i.test(line) && /amount/i.test(line)) {
      continue;
    }
    const firstComma = line.indexOf(",");
    if (firstComma < 0) {
      rows.push({ line: lineNo, to: "", amount: 0, ok: false, error: "format" });
      continue;
    }
    const toRaw = line.slice(0, firstComma).trim();
    const rest = line.slice(firstComma + 1);
    const secondComma = rest.indexOf(",");
    const amountRaw = (secondComma >= 0 ? rest.slice(0, secondComma) : rest).trim();
    const memoRaw = secondComma >= 0 ? rest.slice(secondComma + 1).trim() : "";
    const amountValue = Number(amountRaw);
    if (!isWalletAddress(toRaw)) {
      rows.push({ line: lineNo, to: toRaw, amount: amountValue || 0, memo: memoRaw || undefined, ok: false, error: "address" });
      continue;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      rows.push({ line: lineNo, to: toRaw, amount: amountValue || 0, memo: memoRaw || undefined, ok: false, error: "amount" });
      continue;
    }
    if (memoRaw.length > MAX_TX_MEMO_LENGTH) {
      rows.push({ line: lineNo, to: toRaw, amount: amountValue, memo: memoRaw, ok: false, error: "memo" });
      continue;
    }
    const entry = memoRaw ? { to: toRaw, amount: amountValue, memo: memoRaw } : { to: toRaw, amount: amountValue };
    if (valid.length >= maxRecipients) {
      rows.push({ ...entry, line: lineNo, ok: false, error: "limit" });
      continue;
    }
    rows.push({ ...entry, line: lineNo, ok: true });
    valid.push(entry);
  }

  return {
    rows,
    valid,
    invalidCount: rows.filter((row) => !row.ok).length,
    totalAmount: valid.reduce((sum, item) => sum + item.amount, 0)
  };
}

export function buildBatchReportCsv(
  rows: Array<{ to: string; amount: number; memo?: string; status: string; txId?: string }>
): string {
  const header = "address,amount,memo,status,txId";
  const body = rows.map((row) => {
    const memo = csvSafeCell(row.memo ?? "").replace(/"/g, '""');
    return `${csvSafeCell(row.to)},${row.amount},"${memo}",${csvSafeCell(row.status)},${csvSafeCell(row.txId ?? "")}`;
  });
  return [header, ...body].join("\n");
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
