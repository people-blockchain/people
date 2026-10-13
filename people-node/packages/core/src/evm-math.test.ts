import { describe, expect, test } from "vitest";
import { pplToWei, weiToPpl } from "./evm.js";

describe("PPL wei conversion", () => {
  test("pplToWei uses micro-PPL bigint without float drift", () => {
    expect(pplToWei(1)).toBe(1_000_000n);
    expect(pplToWei(0.000001)).toBe(1n);
    expect(pplToWei(123.456789)).toBe(123_456_789n);
    expect(pplToWei(1.044)).toBe(1_044_000n);
  });

  test("weiToPpl round-trips small and typical values", () => {
    const samples = [0n, 1n, 1_000_000n, 1_044_000n, 99_999_999n];
    for (const wei of samples) {
      expect(pplToWei(weiToPpl(wei))).toBe(wei);
    }
  });
});
