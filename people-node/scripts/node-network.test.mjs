import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { validateNetwork, networkEnvironment, loadNetwork } from './node-network.mjs';
const network = { schemaVersion:1, protocolVersion:2, chainId:'people-testnet-v2', genesisHash:'a'.repeat(64), genesisFaucetAddress:'0x'+'1'.repeat(40), bootstrapAddress:'0x'+'2'.repeat(40), bootstrapPeers:['ws://127.0.0.1:4002'], archive:true, tokenCreateMinFee:1.045005, nftMintMinFee:2.925 };
test('remote fields cannot inject environment, signing keys or commands', () => {
  const clean = validateNetwork({...network, DEV_FAUCET_PRIVATE_KEY:'bad', NODE_OPTIONS:'--evil'});
  assert.equal(clean.DEV_FAUCET_PRIVATE_KEY, undefined);
  const env = networkEnvironment(clean, {});
  assert.equal(env.ALLOW_FAUCET,'0'); assert.equal(env.NODE_ENV,'production');
  assert.throws(() => networkEnvironment(clean, { CHAIN_ID:'other' }), /conflicts/);
  assert.throws(() => networkEnvironment(clean, { VALIDATOR_PRIVATE_KEY:'bad' }), /signing keys/);
});
test('malformed, incompatible or non-archive network is rejected', () => {
  for (const patch of [{schemaVersion:2},{protocolVersion:1},{chainId:'people-mainnet'},{genesisHash:'bad'},{bootstrapPeers:[]},{bootstrapPeers:['file:///tmp/a']},{bootstrapPeers:['ws://user:pass@example.com']},{archive:false},{tokenCreateMinFee:-1}]) assert.throws(() => validateNetwork({...network,...patch}));
});
test('first connection pins configuration; offline restart reuses it and endpoint changes fail', async () => {
  const dir = await mkdtemp(join(tmpdir(),'people-network-test-'));
  const server = createServer((req,res) => {res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(network));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint=`http://127.0.0.1:${server.address().port}/network`;
  try {
    await assert.rejects(loadNetwork(endpoint,dir), /HTTPS/);
    assert.deepEqual(await loadNetwork(endpoint,dir,true),network);
    await new Promise(resolve=>server.close(resolve));
    assert.deepEqual(await loadNetwork(endpoint,dir,true),network);
    await assert.rejects(loadNetwork(endpoint+'-different',dir,true), /endpoint changed/);
  } finally {server.close(); await rm(dir,{recursive:true,force:true});}
});
test('security activation and validator admission are pinned public configuration', () => {
  const upgrade = {height: 12345, validatorAllowlist: ['0x'+'3'.repeat(40)]};
  const clean = validateNetwork({...network, securityUpgrade: upgrade});
  assert.deepEqual(clean.securityUpgrade, upgrade);
  const env = networkEnvironment(clean, {});
  assert.equal(env.SECURITY_UPGRADE_HEIGHT, '12345');
  assert.equal(env.VALIDATOR_ALLOWLIST, upgrade.validatorAllowlist.join(','));
  for (const bad of [{height:-1,validatorAllowlist:[]}, {height:1.5,validatorAllowlist:[]}, {height:1,validatorAllowlist:['bad']}]) {
    assert.throws(() => validateNetwork({...network,securityUpgrade:bad}));
  }
});
// CHAIN-H2: Consensus Upgrade #1 is a coordinated fork, so the seed must publish its height and
// a joining node must inherit it — otherwise the joiner stays on the legacy rules and forks away.
test('consensus upgrade 1 activation is pinned public configuration', () => {
  const clean = validateNetwork({...network, consensusUpgrade1: {height: 777, injected: 'ignored'}});
  assert.deepEqual(clean.consensusUpgrade1, {height: 777});
  const env = networkEnvironment(clean, {});
  assert.equal(env.CONSENSUS_UPGRADE_1_HEIGHT, '777');
  assert.throws(() => networkEnvironment(clean, {CONSENSUS_UPGRADE_1_HEIGHT: '778'}), /conflicts/);
  for (const bad of [{height: -1}, {height: 1.5}, {}, null]) {
    assert.throws(() => validateNetwork({...network, consensusUpgrade1: bad}), /consensus upgrade 1/i);
  }
  // Absent means "not scheduled": the joining node must not invent a height.
  assert.equal(validateNetwork(network).consensusUpgrade1, undefined);
  assert.equal(networkEnvironment(validateNetwork(network), {}).CONSENSUS_UPGRADE_1_HEIGHT, undefined);
});
// The optional creator promo share is a coordinated fork for exactly the same reason: a joining
// node that never learns its height keeps the fixed 60/15/10/10/5 split past activation.
test('promo share activation is pinned public configuration', () => {
  const clean = validateNetwork({...network, promoShareUpgrade: {height: 25492, injected: 'ignored'}});
  assert.deepEqual(clean.promoShareUpgrade, {height: 25492});
  const env = networkEnvironment(clean, {});
  assert.equal(env.PROMO_SHARE_UPGRADE_HEIGHT, '25492');
  assert.throws(() => networkEnvironment(clean, {PROMO_SHARE_UPGRADE_HEIGHT: '25493'}), /conflicts/);
  for (const bad of [{height: -1}, {height: 1.5}, {}, null]) {
    assert.throws(() => validateNetwork({...network, promoShareUpgrade: bad}), /promo share upgrade/i);
  }
  // Absent means "not scheduled": the joining node must not invent a height.
  assert.equal(validateNetwork(network).promoShareUpgrade, undefined);
  assert.equal(networkEnvironment(validateNetwork(network), {}).PROMO_SHARE_UPGRADE_HEIGHT, undefined);
});
