/**
 * Builds the contract-creation calldata for a sample template from user-entered constructor
 * values. Uses viem's own ABI encoder (`encodeDeployData`) instead of hand-rolling encoding,
 * since the ERC20 sample template needs `string` constructor args that the ContractWizard's
 * address/uint-only encoder (contract-constructor.ts) doesn't support.
 */
import { encodeDeployData, parseEther, parseUnits, type Abi, type Address, type Hex } from "viem";
import type { SampleTemplate } from "./sample-contracts";

export type SampleArgEncodeResult =
  | { ok: true; data: Hex }
  | { ok: false; field: string; reason: "address" | "number" | "text" };

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SECONDS_PER_DAY = BigInt(86400);

export function encodeSampleArgs(
  template: SampleTemplate,
  values: Record<string, string>,
  decimalsOverride?: Record<string, number>
): SampleArgEncodeResult {
  const args: Array<string | bigint> = [];
  for (const field of template.fields) {
    const raw = (values[field.name] ?? "").trim();
    if (field.kind === "address") {
      if (!ADDRESS_RE.test(raw)) return { ok: false, field: field.name, reason: "address" };
      args.push(raw);
    } else if (field.kind === "uint256") {
      if (field.scale === "tokens") {
        if (!/^\d+(\.\d+)?$/.test(raw)) return { ok: false, field: field.name, reason: "number" };
        args.push(parseUnits(raw, decimalsOverride?.[field.name] ?? 18));
      } else if (field.scale === "days") {
        if (!/^\d+$/.test(raw)) return { ok: false, field: field.name, reason: "number" };
        args.push(BigInt(raw) * SECONDS_PER_DAY);
      } else {
        if (!/^\d+$/.test(raw)) return { ok: false, field: field.name, reason: "number" };
        args.push(BigInt(raw));
      }
    } else {
      if (!raw) return { ok: false, field: field.name, reason: "text" };
      args.push(raw);
    }
  }
  const data = encodeDeployData({ abi: template.abi as Abi, bytecode: template.bytecode, args });
  return { ok: true, data };
}

/** Prefills for the deploy form: the connected wallet address for address fields, "now" for timestamp fields. */
export function defaultSampleArgs(template: SampleTemplate, walletAddress?: Address): Record<string, string> {
  const args: Record<string, string> = {};
  for (const field of template.fields) {
    if (field.prefill === "wallet" && walletAddress) {
      args[field.name] = walletAddress;
    } else if (field.prefill === "now") {
      args[field.name] = String(Math.floor(Date.now() / 1000));
    }
  }
  return args;
}

/** "1.5" -> wei as a bigint; null for anything that isn't a positive decimal PPL amount. */
export function parseSampleValuePpl(text: string): bigint | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  try {
    const value = parseEther(trimmed);
    return value > BigInt(0) ? value : null;
  } catch {
    return null;
  }
}

/** "1.5" -> base units at `decimals`; null for anything that isn't a positive decimal amount. */
export function parseSampleAmount(text: string, decimals: number): bigint | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  try {
    const value = parseUnits(trimmed, decimals);
    return value > BigInt(0) ? value : null;
  } catch {
    return null;
  }
}
