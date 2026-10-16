import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function validateNetwork(info) {
  if (!info || info.schemaVersion !== 1 || info.protocolVersion !== 2) throw new Error('Unsupported network version');
  if (typeof info.chainId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(info.chainId) || /main.?net/i.test(info.chainId)) throw new Error('Expected a testnet chain ID');
  if (!/^[a-f0-9]{64}$/.test(info.genesisHash)) throw new Error('Invalid genesis hash');
  for (const key of ['genesisFaucetAddress', 'bootstrapAddress']) if (!/^0x[a-f0-9]{40}$/.test(info[key])) throw new Error(`Invalid ${key}`);
  if (info.archive !== true) throw new Error('Joining requires an archive seed');
  if (!Array.isArray(info.bootstrapPeers) || info.bootstrapPeers.length < 1 || info.bootstrapPeers.length > 8) throw new Error('Missing gossip seeds');
  for (const peer of info.bootstrapPeers) {
    const url = new URL(peer);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || /[\s,]/.test(peer)) throw new Error('Invalid gossip seed');
  }
  for (const key of ['tokenCreateMinFee', 'nftMintMinFee']) if (!Number.isFinite(info[key]) || info[key] < 0) throw new Error(`Invalid ${key}`);
  let securityUpgrade;
  if (info.securityUpgrade !== undefined) {
    const upgrade = info.securityUpgrade;
    if (!upgrade || !Number.isSafeInteger(upgrade.height) || upgrade.height < 0 || !Array.isArray(upgrade.validatorAllowlist)
      || upgrade.validatorAllowlist.length > 1000 || upgrade.validatorAllowlist.some(address => !/^0x[a-f0-9]{40}$/.test(address))) throw new Error('Invalid security upgrade');
    securityUpgrade = { height: upgrade.height, validatorAllowlist: [...new Set(upgrade.validatorAllowlist)].sort() };
  }
  // CHAIN-H2: Consensus Upgrade #1 is a coordinated fork exactly like securityUpgrade, so the
  // seed has to publish its activation height too — a joining node that learns only
  // securityUpgrade runs the legacy rules past the agreed height and splits off.
  let consensusUpgrade1;
  if (info.consensusUpgrade1 !== undefined) {
    const upgrade = info.consensusUpgrade1;
    if (!upgrade || !Number.isSafeInteger(upgrade.height) || upgrade.height < 0) throw new Error('Invalid consensus upgrade 1');
    consensusUpgrade1 = { height: upgrade.height };
  }
  // The creator promo share is a coordinated fork too, for the same reason as CHAIN-H2: a
  // joining node that does not learn its height runs the legacy split past the agreed height.
  let promoShareUpgrade;
  if (info.promoShareUpgrade !== undefined) {
    const upgrade = info.promoShareUpgrade;
    if (!upgrade || !Number.isSafeInteger(upgrade.height) || upgrade.height < 0) throw new Error('Invalid promo share upgrade');
    promoShareUpgrade = { height: upgrade.height };
  }
  // Construct an allowlist: never persist arbitrary fields supplied by a remote endpoint.
  return { ...(securityUpgrade ? { securityUpgrade } : {}), ...(consensusUpgrade1 ? { consensusUpgrade1 } : {}), ...(promoShareUpgrade ? { promoShareUpgrade } : {}), schemaVersion: 1, protocolVersion: 2, chainId: info.chainId, genesisHash: info.genesisHash,
    genesisFaucetAddress: info.genesisFaucetAddress, bootstrapAddress: info.bootstrapAddress,
    bootstrapPeers: info.bootstrapPeers, archive: true,
    tokenCreateMinFee: info.tokenCreateMinFee, nftMintMinFee: info.nftMintMinFee };
}

export async function loadNetwork(endpoint, dataDir, allowHttp = false) {
  const url = new URL(endpoint);
  if (url.username || url.password || !(url.protocol === 'https:' || (allowHttp && url.protocol === 'http:'))) throw new Error('Use HTTPS for network configuration');
  const file = join(dataDir, 'network.json');
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved.endpoint !== endpoint) throw new Error('Network endpoint changed; use a separate data volume');
    return validateNetwork(saved.network);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) throw new Error(`Network configuration unavailable (${response.status})`);
  if (!response.body) throw new Error('Empty network configuration');
  const reader = response.body.getReader();
  let bytes = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > 65536) { await reader.cancel(); throw new Error('Network configuration too large'); }
    chunks.push(Buffer.from(value));
  }
  const network = validateNetwork(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  await mkdir(dataDir, { recursive: true });
  await writeFile(file, JSON.stringify({ endpoint, network }, null, 2), { flag: 'wx', mode: 0o600 });
  return network;
}

export function networkEnvironment(network, env) {
  const values = {
    ...(network.securityUpgrade ? { SECURITY_UPGRADE_HEIGHT: String(network.securityUpgrade.height), VALIDATOR_ALLOWLIST: network.securityUpgrade.validatorAllowlist.join(',') } : {}),
    ...(network.consensusUpgrade1 ? { CONSENSUS_UPGRADE_1_HEIGHT: String(network.consensusUpgrade1.height) } : {}),
    ...(network.promoShareUpgrade ? { PROMO_SHARE_UPGRADE_HEIGHT: String(network.promoShareUpgrade.height) } : {}),
    CHAIN_ID: network.chainId, GENESIS_FAUCET_ADDRESS: network.genesisFaucetAddress,
    BOOTSTRAP_ADDRESS: network.bootstrapAddress, BOOTSTRAP_PEERS: network.bootstrapPeers.join(','),
    EXPECTED_GENESIS_HASH: network.genesisHash,
    TOKEN_CREATE_MIN_FEE: String(network.tokenCreateMinFee), NFT_MINT_MIN_FEE: String(network.nftMintMinFee)
  };
  for (const key of ['DEV_FAUCET_PRIVATE_KEY', 'BOOTSTRAP_PRIVATE_KEY', 'VALIDATOR_PRIVATE_KEY']) if (env[key]) throw new Error('Public join mode does not accept signing keys');
  for (const [key, value] of Object.entries(values)) if (env[key] && env[key] !== value) throw new Error(`Network configuration conflicts with ${key}`);
  return { ...env, ...values, ALLOW_FAUCET: '0', ALLOW_DEV_ENDPOINTS: '0', NODE_ENV: 'production' };
}
