import assert from "node:assert/strict";
import test from "node:test";
import { isExplorerNotFound, loadExplorerRead, showNetworkUnavailable } from "../src/lib/explorer-load.ts";

test("a failed read is retried once; not_found is an empty list, not an outage", async () => {
  let calls = 0;
  const recovered = await loadExplorerRead(async () => {
    calls += 1;
    if (calls < 2) throw new Error("rpc_backoff");
    return ["row"];
  }, { timeoutMs: 1000 });
  assert.equal(calls, 2);
  assert.deepEqual(recovered, { ok: true, value: ["row"] });

  let missingCalls = 0;
  const missing = await loadExplorerRead(async () => {
    missingCalls += 1;
    throw new Error("not_found");
  }, { attempts: 3, timeoutMs: 1000 });
  assert.equal(missingCalls, 1);
  assert.deepEqual(missing, { ok: false, missing: true });
  assert.equal(isExplorerNotFound(new Error("http_404")), true);

  let downCalls = 0;
  const down = await loadExplorerRead(async () => {
    downCalls += 1;
    throw new Error("http_502");
  }, { timeoutMs: 1000 });
  assert.equal(downCalls, 2);
  assert.deepEqual(down, { ok: false });
});

test("the unavailable notice shows only when the read failed and the view has no rows", () => {
  assert.equal(showNetworkUnavailable(true, 0), true);
  assert.equal(showNetworkUnavailable(true, 1), false);
  assert.equal(showNetworkUnavailable(false, 0), false);
});
