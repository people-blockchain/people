import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadNetwork, networkEnvironment } from './node-network.mjs';

try {
  const dataDir = process.env.DATA_DIR || '/data';
  let env = { ...process.env, DATA_DIR: dataDir, PEER_ID: process.env.PEER_ID || `people-${randomUUID()}` };
  if (env.NODE_NETWORK_URL) {
    const network = await loadNetwork(env.NODE_NETWORK_URL, dataDir, env.NODE_ALLOW_HTTP === '1');
    env = networkEnvironment(network, env);
    console.log(`Joining ${network.chainId}; genesis ${network.genesisHash}. Public configuration only.`);
  }
  const child = spawn(process.execPath, [fileURLToPath(new URL('../apps/node/dist/index.js', import.meta.url))], { env, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) { console.error(`Node startup stopped: ${error.message}`); process.exitCode = 1; }
