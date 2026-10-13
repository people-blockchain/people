import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src", "scripts", "public"].map((d) => join(root, d));
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".html"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.has(extname(p))) yield p;
  }
}

test("no keyless rpc.ankr.com URL remains in the website sources", () => {
  const offenders = [];
  const self = fileURLToPath(import.meta.url);
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      if (file === self) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/https?:\/\/rpc\.ankr\.com(\/[^\s"'`)<>]*)?/gi)) {
        const segments = (m[1] ?? "").split("/").filter(Boolean);
        // https://rpc.ankr.com/<chain> is anonymous and answers 401; a key would be a secret in code.
        if (segments.length < 2) offenders.push(`${file}: ${m[0]}`);
        else offenders.push(`${file}: ${m[0]} (API key embedded in source)`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("Web3Auth chain config targets the People EVM chain with a keyless https RPC", async () => {
  delete process.env.NEXT_PUBLIC_EVM_RPC_URL;
  delete process.env.EVM_RPC_URL;
  const { buildWeb3AuthChainConfig } = await import("../src/lib/web3auth-chain-config.ts");
  const cfg = buildWeb3AuthChainConfig();
  assert.equal(cfg.chainId, "0x17c79");
  assert.equal(parseInt(cfg.chainId, 16), 97401);
  const url = new URL(cfg.rpcTarget);
  assert.equal(url.protocol, "https:");
  assert.doesNotMatch(url.hostname, /ankr\.com$/i);
  assert.equal(url.search, "");
  assert.equal(url.username, "");
  assert.doesNotMatch(url.pathname, /[0-9a-f]{32}/i, "no API key in the path");
  assert.equal(cfg.ticker, "PPL");
});

test("Web3Auth chain config honours the NEXT_PUBLIC_EVM_RPC_URL override", async () => {
  const { buildWeb3AuthChainConfig } = await import("../src/lib/web3auth-chain-config.ts");
  assert.equal(buildWeb3AuthChainConfig("https://rpc.example.org/x").rpcTarget, "https://rpc.example.org/x");
});
