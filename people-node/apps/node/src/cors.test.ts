import { describe, expect, test } from "vitest";
import { isAllowedCorsOrigin } from "./cors.js";
import { allowKeyedRate } from "./rate-limit.js";

describe("CORS allowlist", () => {
  test("allows the public site origins", () => {
    expect(isAllowedCorsOrigin("https://www.peopleblockchain.network", "")).toBe(true);
    expect(isAllowedCorsOrigin("https://peopleblockchain.network", "")).toBe(true);
  });

  test("Vercel previews are opt-in via the explicit allowlist, never a wildcard", () => {
    expect(isAllowedCorsOrigin("https://website-abc.vercel.app", "")).toBe(false);
    expect(
      isAllowedCorsOrigin("https://website-abc.vercel.app", "https://website-abc.vercel.app")
    ).toBe(true);
    expect(isAllowedCorsOrigin("https://someone-else.vercel.app", "https://website-abc.vercel.app")).toBe(false);
  });

  test("does not reflect arbitrary origins unless *", () => {
    expect(isAllowedCorsOrigin("https://evil.example", "")).toBe(false);
    expect(isAllowedCorsOrigin("https://evil.example", "*")).toBe(true);
    expect(isAllowedCorsOrigin("https://custom.test", "https://custom.test")).toBe(true);
  });
});

describe("rate limiter", () => {
  test("caps a key inside the window", () => {
    const map = new Map();
    expect(allowKeyedRate(map, "a", 2, 60_000, 1_000)).toBe(true);
    expect(allowKeyedRate(map, "a", 2, 60_000, 1_001)).toBe(true);
    expect(allowKeyedRate(map, "a", 2, 60_000, 1_002)).toBe(false);
    expect(allowKeyedRate(map, "a", 2, 60_000, 62_000)).toBe(true);
  });

  test("a full table evicts instead of locking out new keys", () => {
    const map = new Map<string, { count: number; windowStart: number }>();
    for (let i = 0; i < 10_000; i += 1) map.set(`k${i}`, { count: 1, windowStart: 1_000 });
    expect(allowKeyedRate(map, "brand-new-key", 2, 60_000, 1_000)).toBe(true);
    expect(map.size).toBeLessThan(10_000);
    expect(map.has("brand-new-key")).toBe(true);
  });
});
