export interface TransferAsset {
  assetId: string;
  name: string;
  symbol: string;
  decimals: number;
  tokenAddress?: string;
  imageUri?: string;
  creationMetadata?: { image?: unknown };
}

function validDecimals(decimals: number) {
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 18;
}

/** Token transfers use integer base units; PPL transfers use native PPL amounts. */
export function parseTransferAmount(input: string, assetId: string, decimals: number): number {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error("amount");
  if (assetId === "ppl") {
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) throw new Error("amount");
    return value;
  }
  if (!validDecimals(decimals)) throw new Error("asset");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error("precision");
  const units = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (units <= BigInt(0) || units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("amount");
  return Number(units);
}

export function formatTokenBalance(units: number, decimals: number): string {
  if (!validDecimals(decimals) || !Number.isSafeInteger(units) || units < 0) return "—";
  if (decimals === 0) return String(units);
  const digits = String(units).padStart(decimals + 1, "0");
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`.replace(/\.?0+$/, "");
}

export function validateTransfer(input: {
  to: string; amount: string; assetId: string; decimals: number;
  balance: number; nativeBalance: number; fee: number;
}): number {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.to.trim())) throw new Error("address");
  const amount = parseTransferAmount(input.amount, input.assetId, input.decimals);
  if (amount > input.balance) throw new Error("balance");
  if (input.nativeBalance < input.fee + (input.assetId === "ppl" ? amount : 0)) throw new Error("fee");
  return amount;
}
