/**
 * Constructor inputs for template contracts: friendly field definitions derived
 * from the compiled ABI, and standard ABI encoding of the values so they can be
 * appended to the bytecode on deploy.
 */

/**
 * `duration` is a days + hours pair written as "D:H" (e.g. "3:12"); a bare number is read as days.
 * It is used where a short campaign length needs hour precision (crowdfund).
 */
export type FieldKind = "address" | "addressList" | "tokenAmount" | "days" | "hours" | "duration" | "count";

export type ConstructorField = {
  /** Parameter name in the Solidity constructor, e.g. `delay_`. */
  name: string;
  abiType: "address" | "uint256" | "address[]";
  kind: FieldKind;
  /** Copy key for the label (see `contractCopy[lang].fields`). */
  labelKey: string;
};

/** Plain-language meaning of each constructor parameter used by our templates. */
const PARAMS: Record<string, { kind: FieldKind; labelKey: string }> = {
  token_: { kind: "address", labelKey: "token" },
  stakingToken_: { kind: "address", labelKey: "stakingToken" },
  rewardToken_: { kind: "address", labelKey: "rewardToken" },
  beneficiary_: { kind: "address", labelKey: "beneficiary" },
  seller_: { kind: "address", labelKey: "seller" },
  owners_: { kind: "addressList", labelKey: "owners" },
  threshold_: { kind: "count", labelKey: "threshold" },
  duration_: { kind: "days", labelKey: "duration" },
  goal_: { kind: "tokenAmount", labelKey: "goal" },
  total_: { kind: "tokenAmount", labelKey: "total" },
  quorum_: { kind: "tokenAmount", labelKey: "quorum" },
  votingPeriod_: { kind: "days", labelKey: "votingPeriod" },
  timeout_: { kind: "days", labelKey: "timeout" },
  delay_: { kind: "hours", labelKey: "delay" },
};

/** Templates' tokens are standard ERC-20s with 18 decimals. */
export const TOKEN_DECIMALS = 18;

type AbiInput = { name?: string; type?: string };
type AbiItem = { type?: string; inputs?: AbiInput[] };

export function constructorFields(abi: unknown, templateId?: string): ConstructorField[] {
  if (!Array.isArray(abi)) return [];
  const ctor = (abi as AbiItem[]).find((item) => item?.type === "constructor");
  return (ctor?.inputs ?? []).map((input, index) => {
    const name = input.name || `arg${index}`;
    const abiType = input.type as ConstructorField["abiType"];
    if (abiType !== "address" && abiType !== "uint256" && abiType !== "address[]") {
      throw new Error(`Unsupported constructor input type: ${input.type}`);
    }
    // The crowdfund length is entered as days + hours (not a seconds count or fractional days).
    const known =
      templateId === "crowdfund" && name === "duration_"
        ? { kind: "duration" as FieldKind, labelKey: "campaignDuration" }
        : PARAMS[name];
    const kind: FieldKind =
      known?.kind ?? (abiType === "address" ? "address" : abiType === "address[]" ? "addressList" : "count");
    return { name, abiType, kind, labelKey: known?.labelKey ?? name };
  });
}

/** Sensible starting values; the user's own address where a wallet address is expected. */
export function defaultFieldValue(field: ConstructorField, ownAddress?: string): string {
  switch (field.name) {
    case "beneficiary_":
    case "seller_":
    case "owners_":
      return ownAddress ?? "";
    case "threshold_":
      return "1";
    case "duration_":
      return field.kind === "duration" ? "30:0" : "365";
    case "votingPeriod_":
      return "3";
    case "timeout_":
      return "14";
    case "delay_":
      return "24";
    case "quorum_":
      return "1000";
    default:
      return field.kind === "count" ? "1" : "";
  }
}

export type EncodeResult = { ok: true; hex: string } | { ok: false; field: string; reason: "address" | "number" };

const B0 = BigInt(0);
const B10 = BigInt(10);
const MAX_UINT = BigInt(2) ** BigInt(256);
const SEC_DAY = BigInt(86_400);
const SEC_HOUR = BigInt(3_600);
const MICRO = BigInt(1_000_000);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function word(value: bigint): string {
  if (value < B0 || value >= MAX_UINT) throw new RangeError("uint256 out of range");
  return value.toString(16).padStart(64, "0");
}

function addressWord(address: string): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function parseAddress(text: string): string | null {
  const a = text.trim();
  return ADDRESS_RE.test(a) && !/^0x0{40}$/.test(a) ? a : null;
}

/** "1.5" -> 1.5 * 10^decimals as a bigint; null for anything that is not a positive decimal. */
export function parseDecimalUnits(text: string, decimals: number): bigint | null {
  const t = text.trim().replace(/[\s_]/g, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > decimals) return null;
  const value = BigInt(m[1]!) * B10 ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  return value > B0 ? value : null;
}

/** "D:H" (or a bare day count) -> seconds; null unless it is a positive whole duration. */
export function parseDaysHours(text: string): bigint | null {
  const m = /^\s*(\d+)\s*(?::\s*(\d*)\s*)?$/.exec(text);
  if (!m) return null;
  const seconds = BigInt(m[1]!) * SEC_DAY + BigInt(m[2] || "0") * SEC_HOUR;
  return seconds > B0 ? seconds : null;
}

/** Splits a "D:H" value for the two inputs; anything unparsable becomes empty fields. */
export function splitDaysHours(text: string): { days: string; hours: string } {
  const m = /^\s*(\d*)\s*(?::\s*(\d*)\s*)?$/.exec(text);
  return { days: m?.[1] ?? "", hours: m?.[2] ?? "" };
}

function parseUintField(field: ConstructorField, text: string): bigint | null {
  switch (field.kind) {
    case "tokenAmount":
      return parseDecimalUnits(text, TOKEN_DECIMALS);
    case "duration":
      return parseDaysHours(text);
    case "days": {
      const v = parseDecimalUnits(text, 6);
      return v ? (v * SEC_DAY) / MICRO || null : null;
    }
    case "hours": {
      const v = parseDecimalUnits(text, 6);
      return v ? (v * SEC_HOUR) / MICRO || null : null;
    }
    default:
      return /^\s*\d+\s*$/.test(text) && BigInt(text.trim()) > B0 ? BigInt(text.trim()) : null;
  }
}

/** ABI-encodes constructor values (static head + dynamic tail), returned as hex without 0x. */
export function encodeConstructorArgs(fields: ConstructorField[], values: Record<string, string>): EncodeResult {
  const heads: string[] = [];
  const tails: string[] = [];
  const dynamic: Array<{ index: number; data: string }> = [];
  for (const [index, field] of fields.entries()) {
    const text = values[field.name] ?? "";
    if (field.abiType === "address") {
      const a = parseAddress(text);
      if (!a) return { ok: false, field: field.name, reason: "address" };
      heads.push(addressWord(a));
    } else if (field.abiType === "address[]") {
      const list = text.split(/[\s,;]+/).filter(Boolean);
      const parsed = list.map(parseAddress);
      if (list.length === 0 || parsed.some((a) => !a)) return { ok: false, field: field.name, reason: "address" };
      heads.push("");
      dynamic.push({ index, data: word(BigInt(parsed.length)) + parsed.map((a) => addressWord(a!)).join("") });
    } else {
      const v = parseUintField(field, text);
      if (!v) return { ok: false, field: field.name, reason: "number" };
      heads.push(word(v));
    }
  }
  let offset = BigInt(fields.length * 32);
  for (const d of dynamic) {
    heads[d.index] = word(offset);
    tails.push(d.data);
    offset += BigInt(d.data.length / 2);
  }
  return { ok: true, hex: heads.join("") + tails.join("") };
}

/** Full deploy bytecode: compiled creation code followed by the encoded constructor inputs. */
export function deployBytecode(bytecode: string, argsHex: string): string {
  const code = bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`;
  return code + argsHex.replace(/^0x/i, "");
}
