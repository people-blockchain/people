import test from "node:test";
import assert from "node:assert/strict";

test("user disconnected flag helpers", async () => {
  const mod = await import("../src/lib/wallet-disconnect.ts");
  assert.equal(typeof mod.isUserDisconnected, "function");
  assert.equal(typeof mod.markUserDisconnected, "function");
  assert.equal(typeof mod.clearUserDisconnected, "function");
  assert.equal(mod.USER_DISCONNECTED_KEY, "people_user_disconnected");
});
