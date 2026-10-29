/**
 * Preflight for every EVM transaction the site sends: simulate (`eth_call`), then `eth_estimateGas`,
 * and only send when both succeed. A transaction that would revert is never signed, so no gas is
 * burned on a doomed call (for example the stablecoin payment when the daily limit is used up).
 *
 * The gas limit sent is the node's estimate plus a 20% buffer; nothing is hardcoded or inflated.
 */
import {
  decodeAbiParameters,
  decodeErrorResult,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

export type PreflightTx = {
  account: Address;
  to?: Address;
  data?: Hex;
  value?: bigint;
  chainId?: number;
};

export type RevertReason = {
  kind: "error" | "custom" | "panic" | "unknown";
  message: string;
  errorName?: string;
  args?: readonly unknown[];
  panicCode?: bigint;
  data?: Hex;
};

export type PreflightResult =
  | { ok: true; estimate: bigint; gas: bigint }
  | { ok: false; reason: RevertReason };

export type PreflightClient = Pick<PublicClient, "call" | "estimateGas">;

export const GAS_BUFFER_NUM = BigInt(12);
export const GAS_BUFFER_DEN = BigInt(10);

/** `ceil(estimate * 12 / 10)` in bigint math. */
export function withGasBuffer(estimate: bigint): bigint {
  return (estimate * GAS_BUFFER_NUM + GAS_BUFFER_DEN - BigInt(1)) / GAS_BUFFER_DEN;
}

const ERROR_STRING_SELECTOR = "0x08c379a0";
const PANIC_SELECTOR = "0x4e487b71";

/** Errors of the app's own contracts, so they decode even when the caller passes no ABI. */
const KNOWN_ERRORS_ABI = [
  { type: "error", name: "DailyCapExceeded", inputs: [{ name: "account", type: "address" }] },
  {
    type: "error",
    name: "InsufficientFloat",
    inputs: [
      { name: "required", type: "uint256" },
      { name: "available", type: "uint256" },
    ],
  },
] as const satisfies Abi;

const DAILY_LIMIT_ERROR_NAMES = new Set(["DailyCapExceeded", "DailyLimitExceeded", "DailyLimitReached"]);

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

function isRevertData(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{8,}$/.test(value) && value.length % 2 === 0;
}

type Walked = {
  hexes: Hex[];
  texts: string[];
  names: string[];
  decoded?: { errorName: string; args?: readonly unknown[] };
  reason?: string;
};

function walkError(err: unknown): Walked {
  const out: Walked = { hexes: [], texts: [], names: [] };
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number) => {
    if (value == null || depth > 12) return;
    if (isRevertData(value)) {
      out.hexes.push(value);
      return;
    }
    if (!isRecord(value) || seen.has(value)) return;
    seen.add(value);
    if (typeof value.name === "string") out.names.push(value.name);
    for (const key of ["shortMessage", "message", "details", "reason"] as const) {
      const field = value[key];
      if (typeof field === "string") out.texts.push(field);
    }
    if (typeof value.reason === "string" && value.name === "ContractFunctionRevertedError") out.reason = value.reason;
    if (isRevertData(value.raw)) out.hexes.push(value.raw);
    const data = value.data;
    if (isRevertData(data)) out.hexes.push(data);
    else if (isRecord(data)) {
      if (typeof data.errorName === "string" && !out.decoded) {
        out.decoded = { errorName: data.errorName, args: Array.isArray(data.args) ? data.args : undefined };
      }
      visit(data, depth + 1);
    }
    if (isRecord(value.error)) visit(value.error, depth + 1);
    if (value.cause !== undefined) visit(value.cause, depth + 1);
  };
  visit(err, 0);
  return out;
}

function reasonFromData(data: Hex, abi?: Abi): RevertReason | null {
  const selector = data.slice(0, 10).toLowerCase();
  try {
    if (selector === ERROR_STRING_SELECTOR) {
      const [message] = decodeAbiParameters([{ type: "string" }], `0x${data.slice(10)}`);
      return { kind: "error", message: String(message), data };
    }
    if (selector === PANIC_SELECTOR) {
      const [code] = decodeAbiParameters([{ type: "uint256" }], `0x${data.slice(10)}`);
      return { kind: "panic", message: `Panic(0x${code.toString(16)})`, panicCode: code, data };
    }
  } catch {
    return { kind: "unknown", message: "execution reverted", data };
  }
  for (const candidate of abi ? [abi, KNOWN_ERRORS_ABI as Abi] : [KNOWN_ERRORS_ABI as Abi]) {
    try {
      const decoded = decodeErrorResult({ abi: candidate, data });
      return { kind: "custom", message: decoded.errorName, errorName: decoded.errorName, args: decoded.args, data };
    } catch {
      /* try the next ABI */
    }
  }
  return null;
}

/** Turn whatever viem or a wallet threw into a structured revert reason. */
export function decodeRevertReason(err: unknown, abi?: Abi): RevertReason {
  const walked = walkError(err);
  for (const data of walked.hexes) {
    const decoded = reasonFromData(data, abi);
    if (decoded) return decoded;
  }
  if (walked.decoded) {
    return {
      kind: "custom",
      message: walked.decoded.errorName,
      errorName: walked.decoded.errorName,
      args: walked.decoded.args,
    };
  }
  if (walked.reason) return { kind: "error", message: walked.reason };
  const text = walked.texts.join("\n");
  const named = text.match(/\b(DailyCapExceeded|DailyLimitExceeded|DailyLimitReached|InsufficientFloat)\b/);
  if (named) return { kind: "custom", message: named[1], errorName: named[1] };
  const reverted = text.match(/execution reverted(?::\s*([^\n]+))?/i);
  if (reverted?.[1]) return { kind: "error", message: reverted[1].trim() };
  const first = walked.texts.find((line) => line.trim() !== "");
  const hexFallback = walked.hexes[0];
  return { kind: "unknown", message: first ? first.split("\n")[0] : "execution reverted", data: hexFallback };
}

/** True when the daily stablecoin payment limit is what stopped the transaction. */
export function isDailyLimitRevert(reason: RevertReason): boolean {
  if (reason.errorName && DAILY_LIMIT_ERROR_NAMES.has(reason.errorName)) return true;
  if (reason.kind === "custom" || reason.kind === "unknown") {
    if (/dailycap|daily[\s_-]?limit/i.test(reason.message)) return true;
  }
  if (reason.kind === "error" && /daily[\s_-]?(cap|limit)/i.test(reason.message)) return true;
  return false;
}

function isRevertError(err: unknown): boolean {
  const walked = walkError(err);
  if (walked.hexes.length > 0 || walked.decoded || walked.reason) return true;
  if (walked.names.some((name) => /Revert/.test(name))) return true;
  return /revert/i.test(walked.texts.join("\n"));
}

/**
 * Simulate the call, then estimate its gas. A revert in either step comes back as `{ ok: false }`;
 * failures that are not reverts (RPC down, wallet without funds) are rethrown unchanged so the
 * caller's own error mapping still applies. Either way nothing has been sent.
 */
export async function preflightTx(
  client: PreflightClient,
  tx: PreflightTx,
  opts?: { abi?: Abi },
): Promise<PreflightResult> {
  const request = {
    account: tx.account,
    ...(tx.to ? { to: tx.to } : {}),
    ...(tx.data ? { data: tx.data } : {}),
    ...(tx.value !== undefined ? { value: tx.value } : {}),
  };
  let estimate: bigint;
  try {
    await client.call(request as never);
    estimate = await client.estimateGas(request as never);
  } catch (err) {
    if (isRevertError(err)) return { ok: false, reason: decodeRevertReason(err, opts?.abi) };
    throw err;
  }
  return { ok: true, estimate, gas: withGasBuffer(estimate) };
}

export class TxPreflightError extends Error {
  readonly reason: RevertReason;

  constructor(reason: RevertReason) {
    const label = reason.errorName && reason.errorName !== reason.message ? `${reason.errorName}: ` : "";
    super(`Transaction would revert (${label}${reason.message}). Nothing was sent.`);
    this.name = "TxPreflightError";
    this.reason = reason;
  }
}

/** Preflight, then send with `gas = estimate * 1.2`. On a revert `send` is never called. */
export async function preflightAndSend(
  client: PreflightClient,
  send: (tx: PreflightTx & { gas: bigint }) => Promise<Hex>,
  tx: PreflightTx,
  opts?: { abi?: Abi },
): Promise<Hex> {
  const result = await preflightTx(client, tx, opts);
  if (!result.ok) throw new TxPreflightError(result.reason);
  return send({ ...tx, gas: result.gas });
}
