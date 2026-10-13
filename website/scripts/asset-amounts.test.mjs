import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAssetUnits } from '../src/lib/asset-amounts.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('EVM chain: value is already human units, must not be divided again', t => {
  const saved = process.env.NEXT_PUBLIC_CHAIN;
  t.after(() => { process.env.NEXT_PUBLIC_CHAIN = saved; });
  process.env.NEXT_PUBLIC_CHAIN = 'cosmos-evm';
  assert.equal(formatAssetUnits(1_000_000, 6), '1,000,000');
  assert.equal(formatAssetUnits(78.038183, 6), '78.038183');
  assert.equal(formatAssetUnits(null, 6), '—');
});

test('legacy chain: value is raw base units and must be divided by 10**decimals', t => {
  const saved = process.env.NEXT_PUBLIC_CHAIN;
  t.after(() => { process.env.NEXT_PUBLIC_CHAIN = saved; });
  process.env.NEXT_PUBLIC_CHAIN = 'ovn-node';
  assert.equal(formatAssetUnits(1_000_000_000_000, 6), '1,000,000');
  assert.equal(formatAssetUnits(78038183, 6), '78.038183');
  assert.equal(formatAssetUnits(null, 6), '—');
});

test('WalletApp displays token balances with the chain-aware formatter, not the raw-base-units one', () => {
  // formatTokenBalance assumes an integer base-unit amount (legacy chain); on the EVM chain
  // asset.balances[id] is already a human number (fractional, e.g. 78.038183), so
  // formatTokenBalance's Number.isSafeInteger guard renders it as "—" instead of the balance.
  const src = readFileSync(join(root, 'src/components/wallet/WalletApp.tsx'), 'utf8');
  const tokensTab = src.slice(src.indexOf('id="wallet-panel-tokens"'), src.indexOf('id="wallet-panel-nft"'));
  assert.match(tokensTab, /formatAssetUnits\(value, asset\?\.decimals/);
  assert.doesNotMatch(tokensTab, /formatTokenBalance\(value/);
});
