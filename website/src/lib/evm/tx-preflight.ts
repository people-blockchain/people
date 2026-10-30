/**
 * Pre-send simulation for EVM transactions: `eth_call` first, then `estimateGas`.
 *
 * A transaction that would revert is never sent: the caller gets a decoded revert reason
 * (`Error(string)`, a custom error from the supplied ABI, or `Panic(uint256)`) instead of a
 * wallet "gas estimation failed" prompt or a burnt-fee failed receipt. The gas limit for the
 * real send is the estimate plus a 20% buffer.
 *
 * Kept free of React and wallet code so it can be unit-tested in plain Node with a mocked client.
 */
import { decodeErrorResult, type Abi, type Address, type Hex, type PublicClient } from "viem";

export type PreflightTx = { account: Address; to?: Address; data?: Hex; value?: bigint; chainId?: number };

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

/** `ceil(estimate * 12 / 10)` in bigint arithmetic. */
export function withGasBuffer(estimate: bigint): bigint {
  return (estimate * GAS_BUFFER_NUM + GAS_BUFFER_DEN - BigInt(1)) / GAS_BUFFER_DEN;
}

const ERROR_STRING_SELECTOR = "0x08c379a0";
const PANIC_SELECTOR = "0x4e487b71";
/** `DailyCapExceeded(address)` from `StableFeeGateway`. */
const DAILY_CAP_SELECTOR = "0x89dc0b80";

const BUILTIN_ERRORS_ABI = [
  { type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] },
  { type: "error", name: "Panic", inputs: [{ name: "code", type: "uint256" }] },
] as const satisfies Abi;

const PANIC_MESSAGES: Record<string, string> = {
  "0x1": "assertion failed",
  "0x11": "arithmetic overflow or underflow",
  "0x12": "division by zero",
  "0x21": "invalid enum value",
  "0x22": "corrupted storage byte array",
  "0x31": "pop on an empty array",
  "0x32": "array index out of bounds",
  "0x41": "out of memory",
  "0x51": "call to an uninitialised function",
};

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

function isRevertHex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{8,}$/.test(value) && value.length % 2 === 0;
}

type Extracted = { data?: Hex; decoded?: { errorName: string; args?: readonly unknown[] }; text: string };

/** Walk the `cause` chain (viem nests the useful bits several levels deep) for revert data. */
function extract(err: unknown): Extracted {
  const seen = new Set<unknown>();
  let data: Hex | undefined;
  let decoded: Extracted["decoded"];
  let text = "";

  const visit = (value: unknown, depth: number) => {
    if (value == null || depth > 12 || seen.has(value)) return;
    if (isRevertHex(value)) {
      data ??= value;
      return;
    }
    if (!isRecord(value)) return;
    seen.add(value);

    if (!text) {
      const short = value.shortMessage;
      if (typeof short === "string" && short) text = short;
      else if (typeof value.message === "string" && value.message) text = value.message;
    }
    // viem's `ContractFunctionRevertedError` carries an already-decoded `{ errorName, args }`.
    if (!decoded && typeof value.errorName === "string") {
      decoded = { errorName: value.errorName, args: Array.isArray(value.args) ? value.args : undefined };
    }
    if (isRecord(value.data) && !decoded && typeof value.data.errorName === "string") {
      decoded = {
        errorName: value.data.errorName,
        args: Array.isArray(value.data.args) ? value.data.args : undefined,
      };
    }
    for (const key of ["data", "raw", "details", "cause"] as const) {
      visit(value[key], depth + 1);
    }
    if (typeof value.details === "string") {
      const match = value.details.match(/0x[0-9a-fA-F]{8,}/);
      if (match && isRevertHex(match[0])) data ??= match[0];
    }
  };

  visit(err, 0);
  return { data, decoded, text };
}

function describeArgs(args: readonly unknown[] | undefined): string {
  if (!args || args.length === 0) return "";
  return args.map((arg) => (typeof arg === "bigint" ? arg.toString() : String(arg))).join(", ");
}

function customMessage(errorName: string, args: readonly unknown[] | undefined): string {
  const rendered = describeArgs(args);
  return rendered ? `${errorName}(${rendered})` : errorName;
}

/**
 * Turn whatever a failed `eth_call` / `estimateGas` threw into a {@link RevertReason}.
 * Custom errors are only decoded when their definition is in `abi`; otherwise the raw `data`
 * is returned so the caller can still match on the selector.
 */
export function decodeRevertReason(err: unknown, abi?: Abi): RevertReason {
  const { data, decoded, text } = extract(err);

  if (data) {
    const selector = data.slice(0, 10).toLowerCase();
    if (selector === ERROR_STRING_SELECTOR) {
      try {
        const result = decodeErrorResult({ abi: BUILTIN_ERRORS_ABI, data });
        const message = String(result.args?.[0] ?? "");
        return { kind: "error", message, errorName: "Error", args: result.args, data };
      } catch {
        /* malformed payload: fall through to unknown */
      }
    } else if (selector === PANIC_SELECTOR) {
      try {
        const result = decodeErrorResult({ abi: BUILTIN_ERRORS_ABI, data });
        const code = BigInt(result.args?.[0] as bigint);
        const label = PANIC_MESSAGES[`0x${code.toString(16)}`];
        return {
          kind: "panic",
          message: `Panic(0x${code.toString(16)})${label ? `: ${label}` : ""}`,
          errorName: "Panic",
          args: result.args,
          panicCode: code,
          data,
        };
      } catch {
        /* malformed payload: fall through to unknown */
      }
    } else if (abi) {
      try {
        const result = decodeErrorResult({ abi, data });
        return {
          kind: "custom",
          message: customMessage(result.errorName, result.args),
          errorName: result.errorName,
          args: result.args,
          data,
        };
      } catch {
        /* selector not in this ABI */
      }
    }
  }

  if (decoded) {
    if (decoded.errorName === "Error") {
      return { kind: "error", message: String(decoded.args?.[0] ?? ""), errorName: "Error", args: decoded.args, data };
    }
    if (decoded.errorName === "Panic") {
      const code = typeof decoded.args?.[0] === "bigint" ? decoded.args[0] : undefined;
      return {
        kind: "panic",
        message: code !== undefined ? `Panic(0x${code.toString(16)})` : "Panic",
        errorName: "Panic",
        args: decoded.args,
        panicCode: code,
        data,
      };
    }
    return {
      kind: "custom",
      message: customMessage(decoded.errorName, decoded.args),
      errorName: decoded.errorName,
      args: decoded.args,
      data,
    };
  }

  return { kind: "unknown", message: text || "execution reverted", data };
}

/** True when the revert is the stablecoin gateway's per-payer daily cap (`DailyCapExceeded`). */
export function isDailyLimitRevert(reason: RevertReason): boolean {
  if (reason.errorName === "DailyCapExceeded") return true;
  if (reason.data?.slice(0, 10).toLowerCase() === DAILY_CAP_SELECTOR) return true;
  return /DailyCapExceeded/i.test(reason.message);
}

/** A transport failure (node unreachable / timeout) says nothing about whether the tx would revert. */
function isTransportError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  for (let depth = 0; depth < 12 && isRecord(current) && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current.name === "HttpRequestError" || current.name === "TimeoutError" || current.name === "WebSocketRequestError") {
      return true;
    }
    if (typeof current.message === "string" && /failed to fetch|fetch failed|networkerror|econnrefused/i.test(current.message)) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function failure(err: unknown, abi?: Abi): PreflightResult {
  if (isTransportError(err)) throw err;
  return { ok: false, reason: decodeRevertReason(err, abi) };
}

/**
 * Simulate `tx`: `eth_call`, then `estimateGas`. Never sends anything. A revert is returned as
 * `{ ok: false }`; a transport failure (node unreachable) is rethrown, not reported as a revert.
 */
export async function preflightTx(
  client: PreflightClient,
  tx: PreflightTx,
  opts?: { abi?: Abi },
): Promise<PreflightResult> {
  const request = { account: tx.account, to: tx.to, data: tx.data, value: tx.value };
  try {
    await client.call(request);
  } catch (err) {
    return failure(err, opts?.abi);
  }
  try {
    const estimate = await client.estimateGas(request);
    return { ok: true, estimate, gas: withGasBuffer(estimate) };
  } catch (err) {
    return failure(err, opts?.abi);
  }
}

export class TxPreflightError extends Error {
  readonly reason: RevertReason;
  constructor(reason: RevertReason) {
    super(`transaction would revert: ${reason.message}`);
    this.name = "TxPreflightError";
    this.reason = reason;
  }
}

/** Run the preflight and call `send` with the buffered gas only if the simulation passed. */
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
