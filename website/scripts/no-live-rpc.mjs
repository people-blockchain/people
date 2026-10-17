/**
 * Test guard: the public PEOPLE node must never be called from tests, builds-under-test or cloud
 * agents. It is the production validator's RPC; a test suite hammering it slowed the whole chain
 * down on 2026-10-17. Mock the node instead (see `startRpcNode` in
 * scripts/evm-log-start-blocks.test.mjs: an ephemeral localhost JSON-RPC server + EVM_RPC_URL).
 *
 * Loaded with `--import ./scripts/no-live-rpc.mjs` (node-test-paths.mjs imports it too). Every
 * `fetch`/`WebSocket` to a blocked host is rejected before it leaves the process.
 *
 * - default (strict): the process also exits non-zero, so the test run fails even if the code
 *   under test swallowed the network error.
 * - NO_LIVE_RPC_MODE=block: requests are still rejected but the exit code is left alone (used for
 *   `next build`/`next start` under test, whose pages degrade gracefully when the node is down).
 */

const BLOCKED_HOSTS = new Set(["node.peopleblockchain.network", "147.45.227.204"]);
const strict = process.env.NO_LIVE_RPC_MODE !== "block";
const violations = [];

function blockedHost(input) {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    if (!raw) return null;
    const host = new URL(String(raw)).hostname.toLowerCase();
    return BLOCKED_HOSTS.has(host) ? host : null;
  } catch {
    return null;
  }
}

function reject(target) {
  const message = `[no-live-rpc] blocked a call to the public PEOPLE RPC from tests: ${target}. Mock the node instead.`;
  violations.push(String(target));
  if (strict) {
    process.exitCode = 1;
    console.error(message);
  }
  return new TypeError(message);
}

if (typeof globalThis.fetch === "function") {
  const realFetch = globalThis.fetch;
  globalThis.fetch = function guardedFetch(input, init) {
    if (blockedHost(input)) return Promise.reject(reject(typeof input === "string" ? input : input?.url ?? input));
    return realFetch.call(this, input, init);
  };
}

if (typeof globalThis.WebSocket === "function") {
  const RealWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = new Proxy(RealWebSocket, {
    construct(target, args, newTarget) {
      if (blockedHost(args[0])) throw reject(args[0]);
      return Reflect.construct(target, args, newTarget);
    },
  });
}

if (strict) {
  process.on("exit", (code) => {
    if (!violations.length) return;
    console.error(`[no-live-rpc] ${violations.length} call(s) to the public PEOPLE RPC were blocked:\n  ${[...new Set(violations)].join("\n  ")}`);
    if (code === 0) process.exitCode = 1;
  });
}

export const NO_LIVE_RPC_BLOCKED_HOSTS = [...BLOCKED_HOSTS];
