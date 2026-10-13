import assert from "node:assert/strict";
import test from "node:test";

test("resolveFluxProvider prefers Cloudflare, then Pollinations, then Together", async () => {
  const { resolveFluxProvider } = await import("../src/lib/flux-generate.ts");
  const keys = [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "TOGETHER_API_KEY",
    "ICON_GEN_POLLINATIONS_FALLBACK",
  ];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.TOGETHER_API_KEY;
    process.env.ICON_GEN_POLLINATIONS_FALLBACK = "1";
    assert.equal(resolveFluxProvider(), "pollinations");

    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    assert.equal(resolveFluxProvider(), "cloudflare");

    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    process.env.TOGETHER_API_KEY = "tg";
    assert.equal(resolveFluxProvider(), "pollinations");

    process.env.ICON_GEN_POLLINATIONS_FALLBACK = "0";
    assert.equal(resolveFluxProvider(), "together");
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});
