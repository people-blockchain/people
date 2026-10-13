import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTransferAmount, formatTokenBalance, validateTransfer } from '../src/lib/token-transfer.ts';

test('token amounts round-trip exactly without floating point multiplication', () => {
  assert.equal(parseTransferAmount('1.000001', 'token', 6), 1000001);
  assert.equal(parseTransferAmount('0,000001', 'token', 6), 1);
  assert.equal(formatTokenBalance(1000001, 6), '1.000001');
  assert.equal(formatTokenBalance(100000000, 6), '100');
  assert.equal(formatTokenBalance(0, 6), '0');
  assert.equal(parseTransferAmount('0.000000000000000001', 'token', 18), 1);
});
test('reject precision loss, overflow and invalid amounts', () => {
  for (const value of ['0', '-1', 'NaN', 'Infinity', '1e3', '1.0000001', '9007199254740992']) {
    assert.throws(() => parseTransferAmount(value, 'token', 6));
  }
  assert.throws(() => parseTransferAmount('1', 'token', -1));
  assert.equal(parseTransferAmount('0.1', 'ppl', -1), 0.1);
});
test('token balance and native fee balance are checked independently', () => {
  const input = { to: `0x${'a'.repeat(40)}`, amount: '2', assetId: 'token', decimals: 6, balance: 2000000, nativeBalance: 0.004875, fee: 0.004875 };
  assert.equal(validateTransfer(input), 2000000);
  assert.throws(() => validateTransfer({ ...input, nativeBalance: 0 }), /fee/);
  assert.throws(() => validateTransfer({ ...input, balance: 1999999 }), /balance/);
  assert.throws(() => validateTransfer({ ...input, to: 'invalid' }), /address/);
  assert.throws(() => validateTransfer({ ...input, assetId: 'ppl', balance: 2, nativeBalance: 2 }), /fee/);
});
