import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectExplorer } from '../src/lib/explorer-live.ts';
import { resolveNodeWebSocketUrl } from '../src/lib/node-rpc.ts';

function resolveNodeWebSocketUrlForTest() {
  const explicit = process.env.OVN_WS_URL?.trim();
  const rpc = process.env.OVN_RPC_URL?.trim() || 'https://node.example.test';
  const url = new URL(explicit || rpc);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Node WebSocket URL must not contain credentials, query or fragment');
  }
  if (!explicit) {
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
  }
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Invalid WebSocket protocol');
  return url.toString();
}

const chainId = 'test-chain';
const block = (height, transactions = []) => ({ hash: `hash-${height}`, header: { height, chainId }, transactions });
function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const sockets = [], phases = [], feeds = [];
  const stop = connectExplorer({ url: 'wss://example.test/ws', chainId,
    onPhase: phase => phases.push(phase), onFeed: feed => feeds.push(feed),
    createSocket: () => {
      const socket = { readyState: 1, closed: false, sent: [],
        close() { this.closed = true; this.onclose?.(); },
        send(data) { this.sent.push(JSON.parse(data)); },
        receive(type, payload) { this.onmessage?.({ data: JSON.stringify({ type, payload }) }); },
      };
      sockets.push(socket);
      return socket;
    },
  });
  t.after(stop);
  return { sockets, phases, feeds, stop };
}
function welcome(socket, blocks = [block(1)], transactions = []) {
  socket.receive('hello', { chainId });
  socket.receive('feed', { blocks, transactions });
}

test('initial feed, live blocks and confirmed transactions update without HTTP requests', t => {
  const { sockets: [socket], feeds, phases } = setup(t);
  welcome(socket);
  socket.receive('tx', { id: 'pending' });
  assert.equal(feeds.length, 1);
  socket.receive('block', block(2, [{ id: 'confirmed' }]));
  assert.deepEqual(feeds.at(-1).blocks.map(b => b.header.height), [2, 1]);
  assert.deepEqual(feeds.at(-1).transactions, [{ id: 'confirmed', blockHeight: 2 }]);
  assert.equal(phases.at(-1), 'online');
});

test('rejects a different chain and messages before hello', t => {
  const { sockets: [socket], feeds, phases } = setup(t);
  socket.receive('feed', { blocks: [block(1)], transactions: [] });
  assert.equal(feeds.length, 0);
  socket.receive('hello', { chainId: 'wrong-chain' });
  assert.equal(socket.closed, true);
  assert.equal(phases.at(-1), 'offline');
});

test('invalid JSON/feed/block cannot destroy the last valid rows', t => {
  const { sockets: [socket], feeds } = setup(t);
  welcome(socket);
  socket.onmessage({ data: '{broken' });
  socket.receive('feed', { blocks: [{}], transactions: [] });
  socket.receive('block', { ...block(2), header: { height: 2, chainId: 'wrong' } });
  assert.equal(feeds.length, 1);
});

test('repeated and replaced heights do not duplicate blocks or transactions', t => {
  const { sockets: [socket], feeds } = setup(t);
  welcome(socket);
  socket.receive('block', block(2, [{ id: 'old' }]));
  socket.receive('block', block(2, [{ id: 'old' }]));
  assert.equal(feeds.at(-1).transactions.length, 1);
  socket.receive('block', { ...block(2, [{ id: 'replacement' }]), hash: 'replacement' });
  assert.deepEqual(feeds.at(-1).transactions.map(tx => tx.id), ['replacement']);
});

test('reconnect uses a fresh feed to recover blocks missed during the outage', t => {
  const { sockets, feeds, phases } = setup(t);
  welcome(sockets[0]);
  sockets[0].close();
  assert.equal(phases.at(-1), 'offline');
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 2);
  welcome(sockets[1], [block(5), block(4)]);
  assert.deepEqual(feeds.at(-1).blocks.map(b => b.header.height), [5, 4]);
});

test('retry backs off and cleanup cancels further connections', t => {
  const { sockets, stop } = setup(t);
  sockets[0].close();
  t.mock.timers.tick(1000);
  sockets[1].close();
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 2);
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 3);
  stop();
  t.mock.timers.tick(120000);
  assert.equal(sockets.length, 3);
});

test('heartbeat detects a stale connection and reconnects', t => {
  const { sockets, phases } = setup(t);
  welcome(sockets[0]);
  t.mock.timers.tick(15000);
  assert.deepEqual(sockets[0].sent, [{ type: 'ping' }]);
  t.mock.timers.tick(45000);
  assert.equal(sockets[0].closed, true);
  assert.equal(phases.at(-1), 'offline');
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 2);
});

test('WebSocket URL follows RPC config and rejects credentials', t => {
  const saved = { ...process.env };
  t.after(() => { process.env = saved; });
  process.env.NEXT_PUBLIC_CHAIN = 'cosmos-evm';
  delete process.env.NEXT_PUBLIC_EVM_RPC_URL;
  delete process.env.EVM_WS_URL;
  process.env.EVM_RPC_URL = 'https://node.example.test/rpc';
  assert.equal(resolveNodeWebSocketUrl(), 'wss://node.example.test/ws');
  process.env.EVM_WS_URL = 'wss://socket.example.test/evm';
  assert.equal(resolveNodeWebSocketUrl(), 'wss://socket.example.test/evm');
  process.env.EVM_WS_URL = 'wss://user:secret@node.example.test/ws';
  assert.throws(resolveNodeWebSocketUrl, /credentials/);
  process.env.EVM_WS_URL = 'wss://node.example.test/ws?token=secret';
  assert.throws(resolveNodeWebSocketUrl, /credentials/);
  process.env.EVM_WS_URL = 'ftp://node.example.test/ws';
  assert.throws(resolveNodeWebSocketUrl, /protocol/);
  delete process.env.EVM_WS_URL;
  process.env.NEXT_PUBLIC_CHAIN = 'ovn-node';
  process.env.OVN_RPC_URL = 'https://node.example.test';
  delete process.env.OVN_WS_URL;
  assert.equal(resolveNodeWebSocketUrlForTest(), 'wss://node.example.test/ws');
  process.env.OVN_RPC_URL = 'http://127.0.0.1:4001';
  assert.equal(resolveNodeWebSocketUrlForTest(), 'ws://127.0.0.1:4001/ws');
  process.env.OVN_WS_URL = 'wss://node.example.test';
  assert.equal(resolveNodeWebSocketUrlForTest(), 'wss://node.example.test/');
  process.env.OVN_WS_URL = 'wss://user:secret@node.example.test/ws';
  assert.throws(resolveNodeWebSocketUrlForTest, /credentials/);
  process.env.OVN_WS_URL = 'https://node.example.test';
  assert.throws(resolveNodeWebSocketUrlForTest, /protocol/);
});
