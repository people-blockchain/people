import { readBalanceWei } from "@/lib/asset-amounts";
import { isHiddenAsset } from "@/lib/hidden-assets";
import { testStableMeta } from "@/lib/evm/test-stables";

export type WalletAccountView = {
  balance: number | null;
  /** Exact native wei when the address payload or the numeric balance can produce one. */
  balanceWei: bigint | null;
  nonce: number;
  balances: Record<string, number>;
  partial: boolean;
};

export type WalletAssetMeta = {
  assetId: string;
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  imageUri?: string;
  creationMetadata?: { image?: unknown };
};

export type WalletHolding = {
  id: string;
  amount: number;
  name: string;
  symbol: string;
  decimals: number;
  tokenAddress?: string;
  imageUri?: string;
};

export type WalletChainState = {
  account: WalletAccountView | null;
  assets: WalletAssetMeta[];
};

function imageOf(asset: WalletAssetMeta | undefined): string | undefined {
  const fromMeta = asset?.creationMetadata?.image;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta;
  return asset?.imageUri;
}

function findAsset(assets: readonly WalletAssetMeta[], id: string): WalletAssetMeta | undefined {
  const key = id.toLowerCase();
  return assets.find(
    (asset) => asset.assetId.toLowerCase() === key || asset.tokenAddress?.toLowerCase() === key,
  );
}

/**
 * Token rows for the wallet list. Balances are enough: names and logos fill in when the asset
 * catalog arrives. Test stables are labelled from their known metadata even when the catalog
 * omits them, whether the balance key is `tusdc` or the contract address.
 */
export function walletHoldings(
  balances: Record<string, number> | undefined,
  assets: readonly WalletAssetMeta[] = [],
  created: readonly { address: string }[] = [],
): WalletHolding[] {
  const rows = new Map<string, WalletHolding>();
  const put = (rawId: string, amount: number, force: boolean) => {
    if (isHiddenAsset(rawId)) return;
    const asset = findAsset(assets, rawId);
    const stable = testStableMeta(rawId) ?? testStableMeta(asset?.tokenAddress) ?? testStableMeta(asset?.assetId);
    const id = (stable?.assetId ?? rawId).toLowerCase();
    if (id === "ppl" || isHiddenAsset(id)) return;
    const current = rows.get(id);
    const nextAmount = Math.max(current?.amount ?? 0, amount);
    if (!force && nextAmount <= 0 && !current) return;
    const decimals = stable?.decimals ?? asset?.decimals ?? current?.decimals ?? 18;
    rows.set(id, {
      id,
      amount: nextAmount,
      name: stable?.name ?? asset?.name ?? current?.name ?? id,
      symbol: stable?.symbol ?? asset?.symbol ?? current?.symbol ?? id.toUpperCase(),
      decimals: Number.isInteger(decimals) && decimals >= 0 && decimals <= 18 ? decimals : 18,
      tokenAddress: stable?.tokenAddress ?? asset?.tokenAddress ?? current?.tokenAddress,
      imageUri: imageOf(asset) ?? current?.imageUri,
    });
  };
  for (const [id, value] of Object.entries(balances ?? {})) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    put(id, value, false);
  }
  for (const row of created) put(row.address, Number(balances?.[row.address.toLowerCase()] ?? balances?.[row.address] ?? 0), true);
  return [...rows.values()];
}

/** Address payload first. Assets stay as they were so the native balance can render alone. */
export function reduceWalletChain(
  state: WalletChainState,
  event: { type: "address"; payload: unknown } | { type: "assets"; rows: readonly WalletAssetMeta[] },
): WalletChainState {
  if (event.type === "address") {
    const account = mapWalletAccount(event.payload);
    return { account: account ?? state.account, assets: state.assets };
  }
  return { account: state.account, assets: [...event.rows] };
}

/**
 * Maps a compat address payload onto the wallet screen. A finite native balance is shown as a
 * number. `null` means the request has not produced a balance yet (the screen keeps the dash).
 */
export function mapWalletAccount(payload: unknown): WalletAccountView | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as {
    error?: unknown;
    balance?: unknown;
    balanceWei?: unknown;
    nonce?: unknown;
    balances?: unknown;
    partial?: unknown;
  };
  if (typeof body.error === "string") return null;
  const balance = typeof body.balance === "number" && Number.isFinite(body.balance) ? body.balance : null;
  const balanceWei = readBalanceWei(payload);
  const balances: Record<string, number> = {};
  if (body.balances && typeof body.balances === "object") {
    for (const [key, value] of Object.entries(body.balances as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) balances[key] = value;
    }
  }
  if (balance === null && balanceWei === null && Object.keys(balances).length === 0) return null;
  const nonce = typeof body.nonce === "number" && Number.isFinite(body.nonce) ? body.nonce : 0;
  return {
    balance,
    balanceWei,
    nonce,
    balances,
    partial: body.partial === true || (balance === null && balanceWei === null),
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
