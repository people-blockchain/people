import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRecentTransactions } from '../src/lib/evm/explorer-blocks.ts';

/**
 * The feed now reads its window with one JSON-RPC batch, so a node answers an array body with an
 * array. These tests are about the scan's bounds — how far back it reaches and when it stops — so
 * they record both shapes and assert on the block reads, batched or not.
 */
async function mockRpc(t, result) {
  const calls = [];
  const batches = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (Array.isArray(body)) {
      batches.push(body);
      return Response.json(body.map(call => ({ jsonrpc: '2.0', id: call.id, result: result(call) })));
    }
    return Response.json({ jsonrpc: '2.0', id: body.id, result: result(body) });
  });
  return { calls, batches };
}

/** Block heights the node was asked for, in order, however they were transported. */
const blockHeights = ({ calls, batches }) => [
  ...batches.flat().filter(call => call.method === 'eth_getBlockByNumber').map(call => call.params[0]),
  ...calls.filter(call => !Array.isArray(call) && call.method === 'eth_getBlockByNumber').map(call => call.params[0]),
];

test('quiet high chain never scans to genesis for recent transactions', async t => {
  const rpc = await mockRpc(t, call => (call.method === 'eth_blockNumber' ? '0x10000' : { transactions: [] }));
  assert.deepEqual(await fetchRecentTransactions(12), []);
  // One head lookup, then the 40 recent blocks in a single batch: newest first, never genesis.
  assert.equal(rpc.calls.length, 2);
  assert.deepEqual(blockHeights(rpc), ['0x10000', ...Array.from({ length: 39 }, (_, i) => `0x${(0x10000 - 1 - i).toString(16)}`)]);
});

test('recent transaction scan stops at requested count and returns real values', async t => {
  const rpc = await mockRpc(t, call => (call.method === 'eth_blockNumber' ? '0x2' : { transactions: [
    { hash: 'tx', value: '0xde0b6b3a7640000', blockNumber: '0x2' },
  ] }));
  const txs = await fetchRecentTransactions(1);
  assert.equal(rpc.calls.length, 2); assert.equal(txs[0].amountWei, "1000000000000000000"); assert.equal(txs[0].blockHeight, 2);
});


test('early Cosmos chain does not duplicate block 1 via the zero-height alias', async t => {
  // A node that rejects batches: the feed falls back to reading blocks one at a time.
  const heights = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    const r = JSON.parse(options.body);
    if (Array.isArray(r)) return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'rpc_batch_rejected' } });
    if (r.method === 'eth_getBlockByNumber') heights.push(r.params[0]);
    return Response.json({ result: r.method === 'eth_blockNumber' ? '0x1' : { transactions: [] } });
  });
  await fetchRecentTransactions(12); assert.deepEqual(heights, ['0x1']);
});
