export type WalletAccountView = {
  balance: number | null;
  nonce: number;
  balances: Record<string, number>;
  partial: boolean;
};

/**
 * Maps a compat address payload onto the wallet screen. A finite native balance is shown as a
 * number. `null` means the request has not produced a balance yet (the screen keeps the dash).
 */
export function mapWalletAccount(payload: unknown): WalletAccountView | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as {
    error?: unknown;
    balance?: unknown;
    nonce?: unknown;
    balances?: unknown;
    partial?: unknown;
  };
  if (typeof body.error === "string") return null;
  const balance = typeof body.balance === "number" && Number.isFinite(body.balance) ? body.balance : null;
  const balances: Record<string, number> = {};
  if (body.balances && typeof body.balances === "object") {
    for (const [key, value] of Object.entries(body.balances as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) balances[key] = value;
    }
  }
  if (balance === null && Object.keys(balances).length === 0) return null;
  const nonce = typeof body.nonce === "number" && Number.isFinite(body.nonce) ? body.nonce : 0;
  return {
    balance,
    nonce,
    balances,
    partial: body.partial === true || balance === null,
  };
}

/** Native amount for the total and the PEOPLE row. The dash is only for a missing read. */
export function formatWalletNative(
  account: { balance: number | null } | null,
  format: (value: number) => string,
): string {
  if (!account || account.balance === null || !Number.isFinite(account.balance)) return "—";
  return format(account.balance);
}
