import { getAddress, getContractAddress } from "viem";
import artifacts from "@/lib/generated/contract-template-artifacts.json" with { type: "json" };
import { findTemplateById } from "@/lib/contract-templates";
import { evmJsonRpc, evmJsonRpcBatch } from "@/lib/evm/rpc-server";

/**
 * Server-side view of one deployed contract for the explorer: runtime code, the creator and deploy
 * transaction, recent events and — for contracts deployed from a wizard template — the template
 * source, recognised by matching the runtime bytecode against the precompiled artifacts.
 *
 * Every part except the code itself is best effort: a failed or slow read leaves that field empty
 * and sets `partial`, it never turns the whole page into an error.
 */

type TemplateArtifact = { templateId: string; name: string; fileName: string; deployedBytecode: string };

const TEMPLATE_ARTIFACTS = Object.values(
  (artifacts as { templates: Record<string, TemplateArtifact> }).templates
);

/** Cosmos EVM caps eth_getLogs around 10k blocks (same window as the address history scan). */
const LOG_WINDOW = 9000;
const MAX_EVENT_TXS = 25;
const MAX_CREATION_BLOCK_TXS = 50;
const CREATION_PROBES_PER_ROUND = 15;
const CREATION_MAX_ROUNDS = 12;
const READ_TIMEOUT_MS = 8_000;
const CREATION_BUDGET_MS = 10_000;
const EVENTS_BUDGET_MS = 8_000;

/** `PUSH32` followed by 32 zero bytes: how solc leaves an immutable in `deployedBytecode`. */
const PUSH32_ZERO = `7f${"00".repeat(32)}`;

export type ContractReceipt = {
  txId: string;
  status: number;
  gasUsed: number;
  blockNumber: number | null;
  logs: Array<{ topics: string[]; data: string }>;
};

export type VerifiedTemplateSource = { templateId: string; name: string; fileName: string; source: string };

export type ContractInfo = {
  address: string;
  code: string;
  codeSize: number;
  creator: string | null;
  deployTxId: string | null;
  creationBlock: number | null;
  verified: boolean;
  verifiedSource: VerifiedTemplateSource | null;
  receipts: ContractReceipt[];
  /** True when some best-effort part (creator lookup or events) could not be read. */
  partial: boolean;
};

export type ContractInfoResult =
  | { status: "ok"; info: ContractInfo }
  | { status: "not_found" }
  | { status: "unavailable" };

/** Drops the trailing CBOR metadata (its byte length is the last two bytes) from bytecode hex. */
export function stripBytecodeMetadata(hex: string): string {
  const clean = hex.replace(/^0x/i, "").toLowerCase();
  if (clean.length < 4) return clean;
  const total = (Number.parseInt(clean.slice(-4), 16) + 2) * 2;
  if (!Number.isFinite(total) || total > clean.length) return clean;
  // The metadata is a CBOR map (0xa1..0xa5 header); anything else is not a metadata trailer.
  if (!/^a[1-5]$/.test(clean.slice(clean.length - total, clean.length - total + 2))) return clean;
  return clean.slice(0, clean.length - total);
}

/** Hex-char ranges of the zeroed immutable operands in an artifact's runtime bytecode. */
function immutableRanges(artifactHex: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let from = 0;
  for (;;) {
    const at = artifactHex.indexOf(PUSH32_ZERO, from);
    if (at < 0) return out;
    if (at % 2 !== 0) {
      from = at + 1;
      continue;
    }
    out.push([at + 2, at + PUSH32_ZERO.length]);
    from = at + PUSH32_ZERO.length;
  }
}

/**
 * True when deployed runtime code equals the artifact's runtime code, ignoring the metadata hash
 * and the immutable values the constructor wrote into the zeroed `PUSH32` slots.
 */
export function runtimeBytecodeMatches(deployedHex: string, artifactHex: string): boolean {
  const deployed = stripBytecodeMetadata(deployedHex);
  const artifact = stripBytecodeMetadata(artifactHex);
  if (!artifact.length || deployed.length !== artifact.length) return false;
  if (deployed === artifact) return true;
  let pos = 0;
  for (const [start, end] of immutableRanges(artifact)) {
    if (deployed.slice(pos, start) !== artifact.slice(pos, start)) return false;
    pos = end;
  }
  return deployed.slice(pos) === artifact.slice(pos);
}

/** The wizard template whose precompiled runtime code matches `code`, with its source. */
export function matchTemplateBytecode(code: string): VerifiedTemplateSource | null {
  for (const artifact of TEMPLATE_ARTIFACTS) {
    if (!runtimeBytecodeMatches(code, artifact.deployedBytecode)) continue;
    const template = findTemplateById(artifact.templateId);
    if (!template) continue;
    return { templateId: artifact.templateId, name: artifact.name, fileName: artifact.fileName, source: template.source };
  }
  return null;
}

const toHex = (n: number) => `0x${n.toString(16)}`;
const hexNumber = (v: unknown): number | null =>
  typeof v === "string" && /^0x[0-9a-f]+$/i.test(v) ? Number.parseInt(v, 16) : null;

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("deadline")), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * First block at which `address` has code, by a batched k-ary search over historical
 * `eth_getCode`. A failed probe counts as "no code": the caller confirms the result against the
 * block's transactions, so a pruned or flaky height cannot produce a wrong creator.
 */
export async function findCreationBlock(address: string, head: number): Promise<number> {
  let low = 0;
  let high = head;
  for (let round = 0; round < CREATION_MAX_ROUNDS && low < high; round++) {
    const span = high - low;
    const points = [
      ...new Set(
        Array.from({ length: CREATION_PROBES_PER_ROUND }, (_, i) =>
          low + Math.floor((span * (i + 1)) / (CREATION_PROBES_PER_ROUND + 1))
        )
      ),
    ].filter((b) => b >= low && b < high);
    if (!points.length) points.push(low);
    const codes = await evmJsonRpcBatch<string>(
      points.map((b) => ({ method: "eth_getCode", params: [address, toHex(b)] }))
    );
    let nextLow = low;
    let nextHigh = high;
    for (let i = 0; i < points.length; i++) {
      const hasCode = typeof codes[i] === "string" && codes[i] !== "0x";
      if (hasCode) {
        nextHigh = points[i]!;
        break;
      }
      nextLow = points[i]! + 1;
    }
    low = nextLow;
    high = nextHigh;
  }
  return high;
}

type RpcTx = { hash: string; from: string; to: string | null; nonce: string };
type RpcLog = { address?: string; topics?: string[]; data?: string; transactionHash?: string; blockNumber?: string; logIndex?: string };
type RpcReceipt = { transactionHash: string; status?: string; gasUsed?: string; blockNumber?: string; contractAddress?: string | null; logs?: RpcLog[] };

/** The transaction in `block` that created `address`: a direct CREATE, or a factory call that touched it. */
export async function findCreatorInBlock(
  address: string,
  block: number
): Promise<{ creator: string; deployTxId: string } | null> {
  const lower = address.toLowerCase();
  const bare = lower.slice(2);
  const body = await evmJsonRpc<{ transactions?: RpcTx[] } | null>(
    "eth_getBlockByNumber",
    [toHex(block), true],
    { timeoutMs: READ_TIMEOUT_MS }
  );
  const txs = (body?.transactions ?? []).filter((tx) => tx && typeof tx === "object");
  for (const tx of txs) {
    if (tx.to) continue;
    const nonce = hexNumber(tx.nonce);
    if (nonce === null) continue;
    if (getContractAddress({ from: getAddress(tx.from), nonce: BigInt(nonce) }).toLowerCase() === lower) {
      return { creator: getAddress(tx.from), deployTxId: tx.hash };
    }
  }
  const candidates = txs.slice(0, MAX_CREATION_BLOCK_TXS);
  const receipts = await evmJsonRpcBatch<RpcReceipt>(
    candidates.map((tx) => ({ method: "eth_getTransactionReceipt", params: [tx.hash] }))
  );
  for (let i = 0; i < candidates.length; i++) {
    const receipt = receipts[i];
    if (!receipt) continue;
    const touched =
      receipt.contractAddress?.toLowerCase() === lower ||
      (receipt.logs ?? []).some(
        (log) =>
          log.address?.toLowerCase() === lower ||
          (log.topics ?? []).some((topic) => topic.toLowerCase().endsWith(bare)) ||
          (log.data ?? "").toLowerCase().includes(bare)
      );
    if (touched) return { creator: getAddress(candidates[i]!.from), deployTxId: candidates[i]!.hash };
  }
  return null;
}

function toReceipt(txId: string, receipt: RpcReceipt | null, ownLogs: RpcLog[], address: string): ContractReceipt {
  const lower = address.toLowerCase();
  const logs = receipt?.logs ? receipt.logs.filter((log) => log.address?.toLowerCase() === lower) : ownLogs;
  return {
    txId,
    status: hexNumber(receipt?.status) ?? 1,
    gasUsed: hexNumber(receipt?.gasUsed) ?? 0,
    blockNumber: hexNumber(receipt?.blockNumber) ?? hexNumber(ownLogs[0]?.blockNumber),
    logs: logs.map((log) => ({ topics: log.topics ?? [], data: log.data ?? "0x" })),
  };
}

/** Transactions that emitted events from `address`: the newest window plus the one after creation. */
export async function loadContractEvents(
  address: string,
  head: number,
  creationBlock: number | null,
  deployTxId: string | null
): Promise<ContractReceipt[]> {
  const windows: Array<[number, number]> = [[Math.max(0, head - LOG_WINDOW + 1), head]];
  if (creationBlock !== null && creationBlock < windows[0]![0]) {
    windows.push([creationBlock, Math.min(creationBlock + LOG_WINDOW - 1, windows[0]![0] - 1)]);
  }
  const results = await evmJsonRpcBatch<RpcLog[]>(
    windows.map(([from, to]) => ({
      method: "eth_getLogs",
      params: [{ address, fromBlock: toHex(from), toBlock: toHex(to) }],
    }))
  );
  if (results.every((r) => r === null)) throw new Error("logs_unavailable");
  const logs = results
    .flatMap((r) => r ?? [])
    .sort((a, b) => (hexNumber(b.blockNumber) ?? 0) - (hexNumber(a.blockNumber) ?? 0) || (hexNumber(b.logIndex) ?? 0) - (hexNumber(a.logIndex) ?? 0));
  const byTx = new Map<string, RpcLog[]>();
  for (const log of logs) {
    if (!log.transactionHash) continue;
    const list = byTx.get(log.transactionHash) ?? [];
    list.push(log);
    byTx.set(log.transactionHash, list);
  }
  const txIds = [...byTx.keys()].slice(0, MAX_EVENT_TXS);
  if (deployTxId && !byTx.has(deployTxId)) txIds.push(deployTxId);
  const receipts = await evmJsonRpcBatch<RpcReceipt>(
    txIds.map((hash) => ({ method: "eth_getTransactionReceipt", params: [hash] }))
  ).catch(() => txIds.map(() => null));
  return txIds.map((txId, i) => toReceipt(txId, receipts[i] ?? null, [...(byTx.get(txId) ?? [])].reverse(), address));
}

type Creation = { creator: string; deployTxId: string; creationBlock: number };
/** A contract's creation never changes, so a found one is kept for the life of the server. */
const creationCache = new Map<string, Creation>();

export function resetContractInfoCacheForTests(): void {
  creationCache.clear();
}

export async function loadContractInfo(addressRaw: string): Promise<ContractInfoResult> {
  const address = getAddress(addressRaw);
  let code: string;
  try {
    code = await evmJsonRpc<string>("eth_getCode", [address, "latest"], { timeoutMs: READ_TIMEOUT_MS });
  } catch {
    return { status: "unavailable" };
  }
  if (!code || code === "0x") return { status: "not_found" };

  const verifiedSource = matchTemplateBytecode(code);
  let partial = false;
  const head = await evmJsonRpc<string>("eth_blockNumber", [], { timeoutMs: READ_TIMEOUT_MS })
    .then(hexNumber)
    .catch(() => null);

  let creation: Creation | null = creationCache.get(address.toLowerCase()) ?? null;
  if (!creation && head !== null) {
    try {
      creation = await withDeadline(
        (async () => {
          const block = await findCreationBlock(address, head);
          const found = await findCreatorInBlock(address, block);
          return found ? { ...found, creationBlock: block } : null;
        })(),
        CREATION_BUDGET_MS
      );
      if (creation) creationCache.set(address.toLowerCase(), creation);
    } catch {
      partial = true;
    }
  }

  let receipts: ContractReceipt[] = [];
  if (head === null) {
    partial = true;
  } else {
    try {
      receipts = await withDeadline(
        loadContractEvents(address, head, creation?.creationBlock ?? null, creation?.deployTxId ?? null),
        EVENTS_BUDGET_MS
      );
    } catch {
      partial = true;
    }
  }

  return {
    status: "ok",
    info: {
      address,
      code,
      codeSize: Math.max(0, (code.length - 2) / 2),
      creator: creation?.creator ?? null,
      deployTxId: creation?.deployTxId ?? null,
      creationBlock: creation?.creationBlock ?? null,
      verified: verifiedSource !== null,
      verifiedSource,
      receipts,
      partial,
    },
  };
}
