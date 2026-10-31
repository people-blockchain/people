/**
 * Browser-local record of tokens launched through the EVM factory.
 *
 * The chain is the source of truth, but a freshly created token is not guaranteed to be in the
 * catalog scan yet (and the creator's balance can be split across CreatorVesting), so the wallet
 * uses these records to ask the compat endpoint for the token by address. Kept free of React and
 * of browser globals for unit tests: callers pass a Storage-like object.
 */

export const CREATED_TOKENS_STORAGE_KEY = "people.createdTokens.v1";

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";
/** `TokenCreated(...)` with and without the trailing `uint8 leftoverMode`. */
const TOKEN_CREATED_TOPICS = new Set([
  "0x10911c4cd4fbfa42352cbeb31e021abbab48257dff3d94957b57da33a205d724",
  "0xdcb5d6c49a959a42d0c67fe9b9aa48b4da6065c9f47789f71789f629d84d30f1",
]);

export type CreatedTokenRecord = {
  creator: string;
  address: string;
  name: string;
  symbol: string;
  tx: string;
  image: string;
  createdAt: number;
};

export type CreatedTokenStorage = Pick<Storage, "getItem" | "setItem">;

export type DuplicateToken = {
  creator: string;
  address: string;
  name: string;
  symbol: string;
  image?: string;
  createdAt?: number;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRecord(value: unknown): CreatedTokenRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const address = safeString(raw.address);
  const creator = safeString(raw.creator);
  const name = safeString(raw.name);
  const symbol = safeString(raw.symbol);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^0x[0-9a-fA-F]{40}$/.test(creator) || !name || !symbol) {
    return null;
  }
  return {
    creator: creator.toLowerCase(),
    address: address.toLowerCase(),
    name,
    symbol,
    tx: safeString(raw.tx),
    image: safeString(raw.image),
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
  };
}

/** Parse the local record list, ignoring a corrupt value instead of breaking the wallet. */
export function readCreatedTokens(storage: CreatedTokenStorage | null | undefined): CreatedTokenRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CREATED_TOKENS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRecord).filter((row): row is CreatedTokenRecord => row !== null);
  } catch {
    return [];
  }
}

export function writeCreatedTokens(storage: CreatedTokenStorage | null | undefined, rows: readonly CreatedTokenRecord[]): void {
  if (!storage) return;
  try {
    storage.setItem(CREATED_TOKENS_STORAGE_KEY, JSON.stringify(rows.map(normalizeRecord).filter(Boolean)));
  } catch {
    // Storage full or disabled (private mode): the chain catalog still shows the token.
  }
}

/** Insert or replace one record by address, newest first. Returns the updated list. */
export function addCreatedToken(
  storage: CreatedTokenStorage | null | undefined,
  record: CreatedTokenRecord,
): CreatedTokenRecord[] {
  const normalized = normalizeRecord(record);
  if (!normalized) return readCreatedTokens(storage);
  const next = [normalized, ...readCreatedTokens(storage).filter((row) => row.address !== normalized.address)];
  writeCreatedTokens(storage, next);
  return next;
}

export function createdTokensForAddress(
  rows: readonly CreatedTokenRecord[],
  creator: string,
): CreatedTokenRecord[] {
  const wanted = creator.trim().toLowerCase();
  if (!wanted) return [];
  return rows.filter((row) => row.creator.toLowerCase() === wanted);
}

/**
 * Tokens the same wallet already created whose name or symbol matches the draft (trimmed,
 * case-insensitive). Duplicate addresses are collapsed; the caller only decides whether to ask
 * for confirmation.
 */
export function findDuplicateTokens(
  rows: readonly DuplicateToken[],
  query: { creator: string; name: string; symbol: string },
): DuplicateToken[] {
  const creator = query.creator.trim().toLowerCase();
  const name = query.name.trim().toLowerCase();
  const symbol = query.symbol.trim().toLowerCase();
  if (!creator || (!name && !symbol)) return [];
  const seen = new Set<string>();
  const out: DuplicateToken[] = [];
  for (const row of rows) {
    if (row.creator.trim().toLowerCase() !== creator) continue;
    const address = row.address.trim().toLowerCase();
    if (!address || seen.has(address)) continue;
    const nameMatch = Boolean(name) && row.name.trim().toLowerCase() === name;
    const symbolMatch = Boolean(symbol) && row.symbol.trim().toLowerCase() === symbol;
    if (!nameMatch && !symbolMatch) continue;
    seen.add(address);
    out.push(row);
  }
  return out;
}

type ReceiptLogLike = { address: string; topics: readonly string[] };

function addressFromTopic(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  const address = `0x${topic.slice(-40)}`.toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(address) ? address : null;
}

/**
 * The new token address from a factory `createToken` receipt: the `TokenCreated` event emitted by
 * the factory, or (older stacks) the first ERC-20 `Transfer` minted from the zero address.
 */
export function tokenAddressFromReceipt(logs: readonly ReceiptLogLike[], factory: string): string | null {
  const factoryLc = factory.trim().toLowerCase();
  for (const log of logs) {
    if (log.address.trim().toLowerCase() !== factoryLc) continue;
    const topic0 = log.topics[0]?.toLowerCase();
    if (topic0 && TOKEN_CREATED_TOPICS.has(topic0)) {
      const token = addressFromTopic(log.topics[1]);
      if (token) return token;
    }
  }
  for (const log of logs) {
    const topic0 = log.topics[0]?.toLowerCase();
    const from = log.topics[1]?.toLowerCase();
    if (topic0 === ERC20_TRANSFER_TOPIC && from === ZERO_TOPIC) {
      return log.address.trim().toLowerCase();
    }
  }
  return null;
}
