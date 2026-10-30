import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { getContractAddress } from "viem";

import artifacts from "../src/lib/generated/contract-template-artifacts.json" with { type: "json" };
import { findTemplateById } from "../src/lib/contract-templates.ts";
import { resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import {
  matchTemplateBytecode,
  resetContractInfoCacheForTests,
  runtimeBytecodeMatches,
  stripBytecodeMetadata,
} from "../src/lib/evm/contract-info.ts";
import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import { resetRpcBackoffForTests } from "../src/lib/evm/rpc-server.ts";

/**
 * The explorer contract page reads code, creator, events and the template source on the server.
 * Template contracts are recognised by their runtime bytecode (metadata hash and immutables
 * ignored); every best-effort part degrades to `partial` instead of an error. The RPC is a
 * throwaway localhost node.
 */

const hex = (v) => `0x${v.toString(16)}`;
const HEAD = 100_000;
const CREATED_AT = 73_210;
const DEPLOYER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const FACTORY = "0x3333333333333333333333333333333333333333";
const DEPLOY_TX = `0x${"d1".repeat(32)}`;
const CALL_TX = `0x${"c1".repeat(32)}`;
const NOISE_TX = `0x${"e1".repeat(32)}`;

const templates = artifacts.templates;
const PUSH32_ZERO = `7f${"00".repeat(32)}`;

/** Runtime code as a deployment would have it: immutables filled in, a different metadata hash. */
function deployedFrom(artifactHex, fill = "ab") {
  let code = artifactHex.split(PUSH32_ZERO).join(`7f${fill.repeat(32)}`);
  const metaLen = (Number.parseInt(code.slice(-4), 16) + 2) * 2;
  const meta = code.slice(-metaLen);
  // Same CBOR length, different hash bytes.
  const changed = meta.slice(0, 10) + meta.slice(10, -4).replace(/[0-9a-f]/g, (c) => (c === "f" ? "0" : "f")) + meta.slice(-4);
  code = code.slice(0, -metaLen) + changed;
  return `0x${code}`;
}

async function startRpcNode(t, answer) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "content-type": "application/json" });
      const one = (call) => {
        calls.push(call);
        const out = answer(call);
        if (out && typeof out === "object" && "rpcError" in out) {
          return { jsonrpc: "2.0", id: call.id, error: { code: -32000, message: out.rpcError } };
        }
        return { jsonrpc: "2.0", id: call.id, result: out ?? null };
      };
      res.end(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  resetContractInfoCacheForTests();
  resetRpcBackoffForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    await new Promise((resolve) => node.close(resolve));
  });
  return calls;
}

/** A chain where `address` got `code` at CREATED_AT through `creationTxs`, with one later call. */
function contractChain({ address, code, creationTxs, creationReceipts = {}, logs = "ok" }) {
  const lower = address.toLowerCase();
  return (call) => {
    const p = call.params ?? [];
    switch (call.method) {
      case "eth_blockNumber":
        return hex(HEAD);
      case "eth_getCode": {
        if (p[0].toLowerCase() !== lower) return "0x";
        if (p[1] === "latest") return code;
        return Number.parseInt(p[1], 16) >= CREATED_AT ? code : "0x";
      }
      case "eth_getBlockByNumber":
        return Number.parseInt(p[0], 16) === CREATED_AT ? { number: p[0], transactions: creationTxs } : { number: p[0], transactions: [] };
      case "eth_getLogs": {
        if (logs !== "ok") return { rpcError: "logs unavailable" };
        const from = Number.parseInt(p[0].fromBlock, 16);
        const to = Number.parseInt(p[0].toBlock, 16);
        const all = [
          { address: lower, topics: [`0x${"aa".repeat(32)}`], data: "0x01", transactionHash: CALL_TX, blockNumber: hex(HEAD - 10), logIndex: "0x0" },
          { address: lower, topics: [`0x${"bb".repeat(32)}`], data: "0x", transactionHash: DEPLOY_TX, blockNumber: hex(CREATED_AT), logIndex: "0x1" },
        ];
        return all.filter((l) => {
          const b = Number.parseInt(l.blockNumber, 16);
          return b >= from && b <= to;
        });
      }
      case "eth_getTransactionReceipt": {
        if (creationReceipts[p[0]]) return creationReceipts[p[0]];
        if (p[0] === CALL_TX) {
          return { transactionHash: CALL_TX, status: "0x1", gasUsed: "0xc350", blockNumber: hex(HEAD - 10), logs: [{ address: lower, topics: [`0x${"aa".repeat(32)}`], data: "0x01" }] };
        }
        if (p[0] === DEPLOY_TX) {
          return { transactionHash: DEPLOY_TX, status: "0x1", gasUsed: "0x30d40", blockNumber: hex(CREATED_AT), contractAddress: lower, logs: [] };
        }
        return null;
      }
      default:
        return null;
    }
  };
}

test("stripBytecodeMetadata drops the CBOR trailer only", () => {
  const artifact = templates.crowdfund.deployedBytecode;
  const stripped = stripBytecodeMetadata(artifact);
  assert.ok(stripped.length < artifact.length);
  assert.equal(artifact.startsWith(stripped), true);
  // Code without a CBOR trailer is returned unchanged.
  assert.equal(stripBytecodeMetadata("0x6080604052"), "6080604052");
});

test("runtime bytecode with immutables and another metadata hash matches its template", () => {
  for (const [id, artifact] of Object.entries(templates)) {
    const code = deployedFrom(artifact.deployedBytecode);
    assert.notEqual(code.slice(2), artifact.deployedBytecode, id);
    assert.equal(runtimeBytecodeMatches(code, artifact.deployedBytecode), true, id);
    const match = matchTemplateBytecode(code);
    assert.equal(match?.templateId, id);
    assert.equal(match?.source, findTemplateById(id).source);
  }
});

test("a changed opcode or another template does not match", () => {
  const artifact = templates.crowdfund.deployedBytecode;
  const code = deployedFrom(artifact);
  // Flip one byte of real code (offset 40, well before any immutable or metadata).
  const at = 2 + 40 * 2;
  const flipped = code.slice(0, at) + (code.slice(at, at + 2) === "ff" ? "fe" : "ff") + code.slice(at + 2);
  assert.equal(runtimeBytecodeMatches(flipped, artifact), false);
  assert.equal(matchTemplateBytecode(flipped), null);
  assert.equal(runtimeBytecodeMatches(code, templates.escrow.deployedBytecode), false);
  assert.equal(matchTemplateBytecode("0x6080604052348015600f57600080fd5b50"), null);
});

test("contracts/<addr>: direct deploy → creator, deploy tx, events and template source", async (t) => {
  const address = getContractAddress({ from: DEPLOYER, nonce: 5n });
  const code = deployedFrom(templates.crowdfund.deployedBytecode);
  await startRpcNode(
    t,
    contractChain({
      address,
      code,
      creationTxs: [
        { hash: NOISE_TX, from: OTHER, to: FACTORY, nonce: "0x1" },
        { hash: DEPLOY_TX, from: DEPLOYER, to: null, nonce: "0x5" },
      ],
    })
  );
  const { status, body } = await handleEvmCompatGet(`contracts/${address}`, new URLSearchParams());
  assert.equal(status, 200);
  assert.equal(body.address, address);
  assert.equal(body.code, code);
  assert.equal(body.creator.toLowerCase(), DEPLOYER);
  assert.equal(body.deployTxId, DEPLOY_TX);
  assert.equal(body.creationBlock, CREATED_AT);
  assert.equal(body.verified, true);
  assert.equal(body.verifiedSource.templateId, "crowdfund");
  assert.equal(body.verifiedSource.source, findTemplateById("crowdfund").source);
  assert.equal(body.partial, false);
  // Newest event first; the deploy tx (constructor event, creation window) is listed too.
  assert.deepEqual(body.receipts.map((r) => r.txId), [CALL_TX, DEPLOY_TX]);
  assert.deepEqual(
    { status: body.receipts[0].status, gasUsed: body.receipts[0].gasUsed, logs: body.receipts[0].logs.length },
    { status: 1, gasUsed: 50_000, logs: 1 }
  );
});

test("contracts/<addr>: factory-created contract → creator is the caller of the factory tx", async (t) => {
  const address = "0x4444444444444444444444444444444444444444";
  const code = deployedFrom(templates.escrow.deployedBytecode, "cd");
  await startRpcNode(
    t,
    contractChain({
      address,
      code,
      creationTxs: [
        { hash: NOISE_TX, from: OTHER, to: FACTORY, nonce: "0x1" },
        { hash: DEPLOY_TX, from: DEPLOYER, to: FACTORY, nonce: "0x9" },
      ],
      creationReceipts: {
        [NOISE_TX]: { transactionHash: NOISE_TX, status: "0x1", gasUsed: "0x1", logs: [] },
        [DEPLOY_TX]: {
          transactionHash: DEPLOY_TX,
          status: "0x1",
          gasUsed: "0x30d40",
          blockNumber: hex(CREATED_AT),
          logs: [{ address: FACTORY, topics: [`0x${"cc".repeat(32)}`, `0x${"0".repeat(24)}${address.slice(2)}`], data: "0x" }],
        },
      },
    })
  );
  const { status, body } = await handleEvmCompatGet(`contracts/${address}`, new URLSearchParams());
  assert.equal(status, 200);
  assert.equal(body.creator.toLowerCase(), DEPLOYER);
  assert.equal(body.deployTxId, DEPLOY_TX);
  assert.equal(body.verifiedSource.templateId, "escrow");
});

test("contracts/<addr>: failed event scan → 200 with partial data, not an error", async (t) => {
  const address = getContractAddress({ from: DEPLOYER, nonce: 5n });
  const code = deployedFrom(templates.crowdfund.deployedBytecode);
  await startRpcNode(
    t,
    contractChain({
      address,
      code,
      creationTxs: [{ hash: DEPLOY_TX, from: DEPLOYER, to: null, nonce: "0x5" }],
      logs: "fail",
    })
  );
  const { status, body } = await handleEvmCompatGet(`contracts/${address}`, new URLSearchParams());
  assert.equal(status, 200);
  assert.equal(body.partial, true);
  assert.deepEqual(body.receipts, []);
  assert.equal(body.creator.toLowerCase(), DEPLOYER);
  assert.equal(body.verifiedSource.templateId, "crowdfund");
});

test("contracts/<addr>: no code → 404; node error on the code read → 502 (not 'not found')", async (t) => {
  const address = "0x5555555555555555555555555555555555555555";
  let failCode = false;
  await startRpcNode(t, (call) => {
    if (call.method === "eth_getCode") return failCode ? { rpcError: "node busy" } : "0x";
    return null;
  });
  assert.equal((await handleEvmCompatGet(`contracts/${address}`, new URLSearchParams())).status, 404);
  failCode = true;
  const failed = await handleEvmCompatGet(`contracts/${address}`, new URLSearchParams());
  assert.equal(failed.status, 502);
  assert.deepEqual(failed.body, { error: "rpc_unavailable" });
});

test("address/<addr>: one failed read returns the other with partial:true; both failed → 502", async (t) => {
  const address = "0x6666666666666666666666666666666666666666";
  let mode = "balance-fails";
  await startRpcNode(t, (call) => {
    if (call.method === "eth_getBalance") return mode === "ok" ? hex(10n ** 18n) : { rpcError: "busy" };
    if (call.method === "eth_getTransactionCount") return mode === "all-fail" ? { rpcError: "busy" } : "0x7";
    return null;
  });
  const partial = await handleEvmCompatGet(`address/${address}`, new URLSearchParams());
  assert.equal(partial.status, 200);
  assert.equal(partial.body.partial, true);
  assert.equal(partial.body.nonce, 7);
  assert.equal(partial.body.balance, undefined);
  assert.equal(partial.body.balances.ppl, undefined);

  mode = "ok";
  const full = await handleEvmCompatGet(`address/${address}`, new URLSearchParams());
  assert.equal(full.status, 200);
  assert.equal(full.body.balance, 1);
  assert.equal(full.body.balances.ppl, 1);
  assert.equal(full.body.partial, undefined);

  mode = "all-fail";
  const failed = await handleEvmCompatGet(`address/${address}`, new URLSearchParams());
  assert.equal(failed.status, 502);
});
