/**
 * Token metadata for `/explorer/token/<0x address>`.
 *
 * Tokens created through the EVM factory are not in the node's asset catalog, so the explorer
 * reads name/symbol/decimals/totalSupply straight from the ERC-20 contract. Each call is isolated
 * (`allSettled`): non-standard tokens may revert on `name()`/`symbol()` (bytes32 variants) and one
 * failure must not blank the others. Resolution order: contract -> catalog -> short address label.
 * Pure: the client is injected, so tests never touch a network.
 */

import { withTimeout } from "./fetch-timeout.ts";

export const erc20MetaAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export type Erc20Meta = { name: string | null; symbol: string | null; decimals: number | null; totalSupply: string | null };

export type Erc20ReadClient = {
  readContract(args: { address: `0x${string}`; abi: typeof erc20MetaAbi; functionName: "name" | "symbol" | "decimals" | "totalSupply" }): Promise<unknown>;
};

export const EMPTY_ERC20_META: Erc20Meta = { name: null, symbol: null, decimals: null, totalSupply: null };
export const ERC20_CALL_TIMEOUT_MS = 8_000;

/** Printable, bounded label text from an untrusted contract string. */
export function cleanLabel(value: unknown, max = 64): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "").trim();
  return text ? text.slice(0, max) : null;
}

export async function readErc20Meta(client: Erc20ReadClient, address: `0x${string}`, timeoutMs = ERC20_CALL_TIMEOUT_MS): Promise<Erc20Meta> {
  const call = (functionName: "name" | "symbol" | "decimals" | "totalSupply") =>
    withTimeout(() => client.readContract({ address, abi: erc20MetaAbi, functionName }), timeoutMs);
  const [name, symbol, decimals, supply] = await Promise.allSettled([call("name"), call("symbol"), call("decimals"), call("totalSupply")]);
  const ok = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? r.value : undefined);
  const dec = ok(decimals);
  const sup = ok(supply);
  const decNum = typeof dec === "bigint" ? Number(dec) : typeof dec === "number" ? dec : null;
  return {
    name: cleanLabel(ok(name)),
    symbol: cleanLabel(ok(symbol), 24),
    decimals: decNum !== null && Number.isInteger(decNum) && decNum >= 0 && decNum <= 36 ? decNum : null,
    totalSupply: typeof sup === "bigint" && sup >= BigInt(0) ? sup.toString() : null,
  };
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Raw uint amount -> grouped human string ("1,000,000", "0.5"); null when decimals are unknown. */
export function formatTokenSupply(raw: string | bigint | null | undefined, decimals: number | null | undefined): string | null {
  if (raw === null || raw === undefined || decimals === null || decimals === undefined) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  let units: bigint;
  try { units = BigInt(raw); } catch { return null; }
  if (units < BigInt(0)) return null;
  const digits = units.toString().padStart(decimals + 1, "0");
  const intPart = decimals === 0 ? digits : digits.slice(0, -decimals);
  const frac = (decimals === 0 ? "" : digits.slice(-decimals)).replace(/0+$/, "");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

export type CatalogAssetLike = {
  name?: unknown; symbol?: unknown; decimals?: unknown; totalSupply?: unknown;
  creator?: unknown; createdAt?: unknown; status?: unknown; type?: unknown;
};

export type ResolvedTokenMeta = {
  name: string;
  symbol: string;
  decimals: number | null;
  /** Formatted supply from the contract, or null when it must come from the catalog / is unknown. */
  supplyText: string | null;
  /** Catalog supply (node units) used only when the contract did not answer. */
  catalogSupply: number | null;
  source: "contract" | "catalog" | "address";
};

export function resolveTokenMeta(input: { assetId: string; contract: Erc20Meta | null; catalog: CatalogAssetLike | null }): ResolvedTokenMeta {
  const { assetId, contract, catalog } = input;
  const label = shortAddress(assetId);
  const catalogName = cleanLabel(catalog?.name);
  const catalogSymbol = cleanLabel(catalog?.symbol, 24);
  const catalogDecimals = typeof catalog?.decimals === "number" && Number.isInteger(catalog.decimals) && catalog.decimals >= 0 && catalog.decimals <= 36 ? catalog.decimals : null;
  const decimals = contract?.decimals ?? catalogDecimals;
  const supplyText = contract?.totalSupply != null ? formatTokenSupply(contract.totalSupply, decimals) : null;
  const catalogSupply = typeof catalog?.totalSupply === "number" && Number.isFinite(catalog.totalSupply) && catalog.totalSupply >= 0 ? catalog.totalSupply : null;
  const fromContract = Boolean(contract && (contract.name || contract.symbol || contract.decimals !== null || contract.totalSupply !== null));
  return {
    name: contract?.name ?? catalogName ?? label,
    symbol: contract?.symbol ?? catalogSymbol ?? label,
    decimals,
    supplyText,
    catalogSupply: supplyText === null ? catalogSupply : null,
    source: fromContract ? "contract" : catalog ? "catalog" : "address",
  };
}
