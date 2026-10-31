import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectEvmExplorer } from '../src/lib/evm/explorer-live.ts';
const flush = async () => { for (let i = 0; i < 150; i++) await Promise.resolve(); };
const hex = n => `0x${n.toString(16)}`;
function setup(t, { head = 100, holdBlocks = false, chain = '0x17c79', txs = {} } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const sockets = [], phases = [], feeds = [];
  const stop = connectEvmExplorer({ url: 'wss://node.test/ws', chainId: '97401',
    onPhase: p => phases.push(p), onFeed: f => feeds.push(f), createSocket: () => {
      const s = { sent: [], readyState: 1, closed: false,
        close() { this.closed = true; this.onclose?.(); },
        receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); },
        reply(id, result) { this.receive({ jsonrpc: '2.0', id, result }); },
        blockReply(r) {
          const h = Number(BigInt(r.params[0]));
          this.reply(r.id, { hash: `hash-${h}`, number: hex(h), timestamp: hex(h), transactions: txs[h] ?? [] });
        },
        send(data) {
          const r = JSON.parse(data); this.sent.push(r);
          if (r.method === 'eth_chainId') this.reply(r.id, chain);
          else if (r.method === 'eth_subscribe') this.reply(r.id, 'subscription');
          else if (r.method === 'eth_blockNumber') this.reply(r.id, hex(head));
          else if (!holdBlocks) this.blockReply(r);
        },
        notify(height, subscription = 'subscription') {
          this.receive({ method: 'eth_subscription', params: { subscription, result: { number: hex(height) } } });
        },
      }; sockets.push(s); return s;
    } });
  t.after(stop);
  return { sockets, phases, feeds, stop };
}

test('EVM initial snapshot is bounded and newHeads update blocks and confirmed transactions over the same socket', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('HTTP must not be used'); });
  const { sockets: [s], phases, feeds } = setup(t, { txs: { 101: [{ hash: 'tx', from: 'alice', value: '0xde0b6b3a7640000' }] } });
  s.onopen(); await flush();
  assert.deepEqual(phases, ['checking', 'online']);
  assert.equal(s.sent.filter(r => r.method === 'eth_getBlockByNumber').length, 40);
  assert.equal(feeds.at(-1).blocks[0].header.height, 100);
  s.notify(101); await flush();
  assert.equal(feeds.at(-1).blocks[0].header.height, 101);
  assert.equal(feeds.at(-1).transactions[0].amountWei, "1000000000000000000");
  assert.equal(s.sent.filter(r => r.method === 'eth_getBlockByNumber').length, 41);
  assert.deepEqual(phases, ['checking', 'online', 'online']);
  s.notify(101); s.notify(999, 'unrelated'); await flush();
  assert.equal(s.sent.filter(r => r.method === 'eth_getBlockByNumber').length, 41);
});

test('burst heads do not overlap block reads and missed blocks are recovered', async t => {
  const { sockets: [s], feeds } = setup(t, { head: 1, holdBlocks: true });
  s.onopen(); await flush();
  s.notify(3); s.notify(4); await flush();
  assert.equal(s.sent.filter(r => r.method === 'eth_getBlockByNumber').length, 1);
  s.blockReply(s.sent.at(-1)); await flush();
  const recovery = s.sent.filter(r => r.method === 'eth_getBlockByNumber').slice(1);
  assert.equal(recovery.length, 3);
  for (const request of recovery.toReversed()) s.blockReply(request);
  await flush();
  assert.deepEqual(feeds.at(-1).blocks.map(b => b.header.height), [4, 3, 2, 1]);
});

test('initial feed appears before the full window is read; requests stay bounded and ordered', async t => {
  const { sockets: [s], feeds, phases } = setup(t, { holdBlocks: true });
  s.onopen(); await flush();
  const requests = () => s.sent.filter(r => r.method === 'eth_getBlockByNumber');
  assert.equal(requests().length, 4);
  assert.equal(feeds.length, 0);
  for (const request of requests().toReversed()) s.blockReply(request);
  await flush();
  assert.deepEqual(feeds[0].blocks.map(b => b.header.height), [100, 99, 98, 97]);
  assert.equal(phases.at(-1), 'online');
  assert.equal(requests().length, 8);
  for (let offset = 4; offset < 40; offset += 4) {
    const batch = requests().slice(offset, offset + 4);
    assert.equal(batch.length, 4);
    for (const request of batch.toReversed()) s.blockReply(request);
    await flush();
    assert.equal(requests().length, Math.min(40, offset + 8));
  }
  assert.equal(feeds.at(-1).blocks.length, 12);
  assert.deepEqual(feeds.at(-1).blocks.map(b => b.header.height), Array.from({ length: 12 }, (_, i) => 100-i));
  assert.equal(requests().length, 40);
});

test('older confirmed transfers arrive during backfill without delaying the first blocks', async t => {
  const { sockets: [s], feeds } = setup(t, {
    holdBlocks: true, txs: { 96: [{ hash: 'older-tx', value: '0xde0b6b3a7640000' }] },
  });
  s.onopen(); await flush();
  const requests = () => s.sent.filter(r => r.method === 'eth_getBlockByNumber');
  for (const request of requests()) s.blockReply(request);
  await flush();
  assert.equal(feeds[0].transactions.length, 0);
  for (const request of requests().slice(4, 8)) s.blockReply(request);
  await flush();
  assert.equal(feeds.at(-1).transactions[0].id, 'older-tx');
  assert.equal(feeds.at(-1).transactions[0].amountWei, "1000000000000000000");
  assert.equal(feeds.at(-1).transactions[0].blockHeight, 96);
});

test('wrong chain fails before subscribing and retries with backoff', async t => {
  const { sockets, phases } = setup(t, { chain: '0x1' });
  sockets[0].onopen(); await flush();
  assert.equal(sockets[0].closed, true);
  assert.equal(sockets[0].sent.length, 1);
  assert.equal(phases.at(-1), 'offline');
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 2);
});

test('reconnect takes a fresh recent snapshot and recovers the current head', async t => {
  const { sockets, feeds } = setup(t);
  sockets[0].onopen(); await flush(); sockets[0].close();
  t.mock.timers.tick(1000); sockets[1].onopen(); await flush();
  assert.equal(feeds.at(-1).blocks[0].header.height, 100);
  assert.equal(sockets[1].sent[1].method, 'eth_subscribe');
});

test('stale subscriptions, connection openings and RPC requests time out', async t => {
  const { sockets, phases, stop } = setup(t);
  t.mock.timers.tick(20000); assert.equal(phases.at(-1), 'offline');
  t.mock.timers.tick(1000); sockets[1].onopen(); await flush();
  t.mock.timers.tick(60000); assert.equal(sockets[1].closed, true); stop();
});

test('cleanup rejects pending reads without updating UI or reconnecting', async t => {
  const { sockets: [s], phases, feeds, stop } = setup(t, { holdBlocks: true });
  s.onopen(); await flush(); stop();
  s.blockReply(s.sent.at(-1)); await flush(); t.mock.timers.tick(120000);
  assert.deepEqual(phases, ['checking']); assert.equal(feeds.length, 0); assert.equal(s.closed, true);
});

test('malformed block responses fail instead of marking fabricated empty data online', async t => {
  const { sockets: [s], phases, feeds } = setup(t, { holdBlocks: true });
  s.onopen(); await flush(); s.reply(s.sent.at(-1).id, null); await flush();
  assert.equal(phases.at(-1), 'offline'); assert.equal(feeds.length, 0);
});

test('pending block request times out and cannot leave a stuck connecting state', async t => {
  const { sockets: [s], phases, feeds } = setup(t, { holdBlocks: true });
  s.onopen(); await flush(); t.mock.timers.tick(20000); await flush();
  assert.equal(phases.at(-1), 'offline'); assert.equal(s.closed, true); assert.equal(feeds.length, 0);
});

test('RPC error responses mark the connection offline', async t => {
  const { sockets: [s], phases } = setup(t, { holdBlocks: true });
  s.onopen(); await flush();
  s.receive({ id: s.sent.at(-1).id, error: { code: -32000, message: 'unavailable' } }); await flush();
  assert.equal(phases.at(-1), 'offline');
});


test('Cosmos first block is 1; never requests the RPC zero-height alias', async t => {
  const { sockets: [s], feeds } = setup(t, { head: 1 });
  s.onopen(); await flush();
  assert.deepEqual(feeds.at(-1).blocks.map(b => b.header.height), [1]);
  assert.equal(s.sent.filter(r => r.method === 'eth_getBlockByNumber').length, 1);
});

test('a chain without a first block fails instead of repeatedly scanning an empty range', async t => {
  const { sockets: [s], phases, feeds } = setup(t, { head: 0 });
  s.onopen(); await flush();
  assert.equal(phases.at(-1), 'offline'); assert.equal(feeds.length, 0);
});
