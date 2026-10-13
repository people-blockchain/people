import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { JsonRpcProvider, Wallet, NonceManager } from 'ethers';
import { createFaucet, clientSource, DEFAULT_TRUSTED_PROXY_PEERS } from './faucet-core.mjs';
const provider = new JsonRpcProvider(process.env.FAUCET_RPC_URL ?? 'http://127.0.0.1:8545', undefined, { cacheTimeout: -1 });
const signer = new Wallet(process.env.FAUCET_PRIVATE_KEY, provider);
const manager = new NonceManager(signer);
const wallet = { address: signer.address, sendTransaction: async (tx) => {
  try { return await manager.sendTransaction(tx); } catch (error) { manager.reset(); throw error; }
} };
// LAV-H1: global per-UTC-day payout budget. Empty/unset keeps the 10_000 PPL default;
// "off"/"none" disables it (the per-address cooldown and per-request cap still apply).
const dailyCapEnv = process.env.FAUCET_DAILY_CAP_PPL;
const dailyCapPpl = dailyCapEnv === undefined || dailyCapEnv.trim() === '' ? 10_000n : /^(off|none)$/i.test(dailyCapEnv.trim()) ? null : BigInt(dailyCapEnv.trim());
const faucet = createFaucet({ provider, wallet, firstBlockHash: process.env.FAUCET_FIRST_BLOCK_HASH, dailyCapPpl });
await faucet.verifyNetwork();
const publicErrors = new Set(['invalid_address','invalid_amount','amount_too_large','rate_limited','faucet_busy','wrong_network','fee_unavailable','faucet_insufficient_funds','recipient_gas_too_high','daily_budget_exhausted']);
// Errors whose public meaning needs a human sentence for the website/faucet UI.
const publicMessages = { daily_budget_exhausted: 'Faucet is empty for today, try again tomorrow' };
const html = await readFile(new URL('./faucet.html', import.meta.url));

/**
 * Only honour the forwarded client-ip header when forwarded headers are explicitly trusted and
 * the immediate peer is the configured trusted proxy (default: loopback). Fail-closed by
 * default so a local process cannot rotate source keys (LAV-M4).
 */
const TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS === '1';
const TRUSTED_PROXY_PEERS = (process.env.FAUCET_TRUSTED_PROXY ?? DEFAULT_TRUSTED_PROXY_PEERS.join(','))
  .split(',').map((entry) => entry.trim()).filter(Boolean);
const sourceOf = (req) => clientSource(req.socket.remoteAddress, req.headers, { trustProxyHeaders: TRUST_PROXY_HEADERS, trustedPeers: TRUSTED_PROXY_PEERS });

// `/faucet/status` is a read-only probe; memoize it so it cannot be used to hammer the RPC.
const STATUS_CACHE_MS = 5_000;
let statusCache = null;
async function readStatus() {
  if (statusCache && Date.now() - statusCache.at < STATUS_CACHE_MS) return statusCache.value;
  await faucet.verifyNetwork();
  const value = { ok: true, chainId: 97401, address: wallet.address, balanceAppl: String(await provider.getBalance(wallet.address)) };
  statusCache = { at: Date.now(), value };
  return value;
}
/** One journal line per fund attempt: caller source key (real client IP behind the proxy), recipient, outcome. */
function logFund(source, to, outcome) {
  console.log(JSON.stringify({ ev: 'faucet_fund', source, to, outcome }));
}
const server = http.createServer(async (req, res) => {
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && req.url === '/faucet') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    return res.end(html);
  }
  if (req.method === 'GET' && req.url === '/faucet/status') {
    try {
      return reply(200, await readStatus());
    } catch { return reply(503, { error: 'faucet_unavailable' }); }
  }
  if (req.method !== 'POST' || req.url !== '/faucet/fund') return reply(404, { error: 'not_found' });
  let size = 0; const chunks = []; let source = ''; let to = '';
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2048) { reply(413, { error: 'request_too_large' }); return; }
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400, { error: 'invalid_json' }); }
    source = sourceOf(req);
    to = typeof body?.address === 'string' ? body.address.slice(0, 42) : '';
    const result = await faucet.fund(body, source);
    logFund(source, to, 'ok');
    return reply(202, result);
  } catch (error) {
    const code = publicErrors.has(error?.message) ? error.message : 'faucet_unavailable';
    if (source) logFund(source, to, code);
    const status = ['invalid_address','invalid_amount','amount_too_large'].includes(code) ? 400 : code === 'rate_limited' ? 429 : 503;
    return reply(status, { error: code, ...(publicMessages[code] ? { message: publicMessages[code] } : {}) });
  }
});
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.listen(Number(process.env.FAUCET_PORT ?? 4050), '127.0.0.1', () => console.log('Testnet faucet listening on localhost'));
