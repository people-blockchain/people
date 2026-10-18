import { test } from "node:test";
import assert from "node:assert/strict";

test("legacy NEXT_PUBLIC_CHAIN env value maps to people-node backend", async (t) => {
  const saved = process.env.NEXT_PUBLIC_CHAIN;
  t.after(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_CHAIN;
    else process.env.NEXT_PUBLIC_CHAIN = saved;
  });
  process.env.NEXT_PUBLIC_CHAIN = "ovn-node";
  const { readPublicChainBackend } = await import("../src/lib/chain-mode.ts");
  assert.equal(readPublicChainBackend(), "people-node");
});
