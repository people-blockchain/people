import { describe, expect, it } from "vitest";
import { MAX_SUBMITTED_SOURCE_BYTES, getContract } from "./contracts.js";

const ADDR = "0x" + "11".repeat(20);
type HostState = Parameters<typeof getContract>[0];

function stateWith(source?: Record<string, unknown>): HostState {
  return {
    contracts: { [ADDR]: { code: "0x6000", storage: {}, nonce: 0, creator: ADDR } },
    contractMeta: { [ADDR]: { deployTxId: "tx-1", ...(source ? { source } : {}) } }
  } as unknown as HostState;
}

describe("getContract submitted source", () => {
  it("exposes author-supplied source as submittedSource, never as verified", () => {
    const contract = getContract(stateWith({ language: "solidity", text: "contract A {}" }), ADDR);
    expect(contract?.submittedSource).toEqual({ language: "solidity", text: "contract A {}" });
    expect(contract && "verifiedSource" in contract).toBe(false);
  });

  it("returns null when the deploy carried no source", () => {
    expect(getContract(stateWith(), ADDR)?.submittedSource).toBeNull();
  });

  it("truncates an oversized source instead of echoing it whole", () => {
    const contract = getContract(stateWith({ text: "x".repeat(MAX_SUBMITTED_SOURCE_BYTES + 1) }), ADDR);
    const source = contract?.submittedSource as { truncated: boolean; bytes: number; preview: string };
    expect(source.truncated).toBe(true);
    expect(source.bytes).toBeGreaterThan(MAX_SUBMITTED_SOURCE_BYTES);
    expect(source.preview.length).toBe(MAX_SUBMITTED_SOURCE_BYTES);
  });
});
