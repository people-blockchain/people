import test from 'node:test';
import assert from 'node:assert/strict';
import { stringToHex } from 'viem';
import { fetchTransaction, fetchRecentTransactions } from '../src/lib/evm/explorer-blocks.ts';

const hash = `0x${'ab'.repeat(32)}`;
const from = `0x${'11'.repeat(20)}`;
const to = `0x${'22'.repeat(20)}`;
const memo = 'Оплата №42 👋\nThank you <script>alert(1)</script>';
const contractInput = `0xa9059cbb${'00'.repeat(32)}`;

function mockNode(t, tx) {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    if (Array.isArray(body)) {
      return Response.json(body.map((call) => ({
        jsonrpc: '2.0',
        id: call.id,
        result: call.method === 'eth_getBlockByNumber' ? { transactions: [tx] } : null,
      })));
    }
    const result = body.method === 'eth_getTransactionByHash'
      ? tx
      : body.method === 'eth_getTransactionReceipt'
        ? { gasUsed: '0x5208', effectiveGasPrice: '0x1' }
        : body.method === 'eth_blockNumber'
          ? '0x1'
          : { transactions: [tx] };
    return Response.json({ jsonrpc: '2.0', id: body.id, result });
  });
}

const tx = (input) => ({
  hash, from, to, value: '0xde0b6b3a7640000', input, blockNumber: '0x1',
});

test('a memo transaction detail is a transfer carrying payload.memo', async (t) => {
  mockNode(t, tx(stringToHex(memo)));
  const detail = await fetchTransaction(hash);
  assert.equal(detail.type, 'transfer');
  assert.deepEqual(detail.payload, { memo });
});

test('a memo transaction in the recent feed is not classified as a contract call', async (t) => {
  mockNode(t, tx(stringToHex(memo)));
  const [recent] = await fetchRecentTransactions(1);
  assert.equal(recent.type, 'transfer');
  assert.deepEqual(recent.payload, { memo });
});

test('an ERC-20 transfer calldata stays a contract call without a memo', async (t) => {
  mockNode(t, tx(contractInput));
  const detail = await fetchTransaction(hash);
  assert.equal(detail.type, 'contract');
  assert.equal(detail.payload, undefined);
});
