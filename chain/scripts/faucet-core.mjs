import { isIP } from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Loopback peers the site proxy connects from by default. */
export const DEFAULT_TRUSTED_PROXY_PEERS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

function safeSecretEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false;
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

/**
 * The service listens on loopback behind the site proxy, so the caller IP arrives in the
 * `x-people-client-ip` header (legacy `x-ovn-client-ip` still accepted). Honour forwarded
 * headers only when TRUST_PROXY_HEADERS=1 AND the immediate peer is a configured trusted
 * proxy. When FAUCET_PROXY_SECRET is set, the matching `x-faucet-proxy-secret` header is
 * also required; unset keeps the previous trusted-peer behaviour so production stays up.
 */
export function clientSource(peer, headers, { trustProxyHeaders = false, trustedPeers = [], proxySecret = '' } = {}) {
  const address = typeof peer === 'string' ? peer : '';
  if (trustProxyHeaders && trustedPeers.includes(address)) {
    const hasSecret = typeof proxySecret === 'string' && proxySecret.length > 0;
    const providedSecret = String(headers?.['x-faucet-proxy-secret'] ?? '');
    if (!hasSecret || safeSecretEqual(providedSecret, proxySecret)) {
      const forwarded = String(headers?.['x-people-client-ip'] ?? headers?.['x-ovn-client-ip'] ?? '').trim();
      if (isIP(forwarded) !== 0) return forwarded;
    }
    const realIp = String(headers?.['x-real-ip'] ?? '').trim();
    if (isIP(realIp) !== 0) return realIp;
  }
  return address || 'unknown';
}

/** Testnet distributions spend existing coins; this module cannot mint. */
export function parseRequest(body) {
  if (!body || typeof body !== 'object' || !/^0x[0-9a-fA-F]{40}$/.test(body.address ?? '') || /^0x0{40}$/i.test(body.address)) throw new Error('invalid_address');
  const amount = String(body.amount ?? '');
  if (!/^(?:0|[1-9]\d{0,30})(?:\.\d{1,18})?$/.test(amount)) throw new Error('invalid_amount');
  const [whole, fraction = ''] = amount.split('.');
  const value = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  if (value <= 0n) throw new Error('invalid_amount');
  return { address: body.address.toLowerCase(), amount, value };
}

/**
 * Owner-set caps (M06-1): at most 100 PPL per request, and at most one request per address per day.
 * LAV-H1: on top of the per-address cooldown there is a global budget of `dailyCapPpl` per UTC day,
 * so an attacker generating fresh addresses cannot drain the whole faucet in one day. `null`
 * disables the budget (tests and non-production use only).
 */
export function createFaucet({
  provider,
  wallet,
  firstBlockHash,
  now = Date.now,
  cooldownMs = 24 * 60 * 60_000,
  maxTracked = 10_000,
  maxQueue = 10,
  maxInFlightPerSource = 2,
  maxGasLimit = 200_000n,
  minAmountWei = 10n ** 16n, // 0.01 PPL floor prevents 1-wei dust flood of claims
  maxAmountPpl = 100n,
  dailyCapPpl = 10_000n,
  dailyGasCapWei = 50n * 10n ** 18n,
  perSourceDailyCapPpl = null,
}) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(firstBlockHash ?? '')) throw new Error('first_block_hash_required');
  const maxAmountValue = maxAmountPpl * 10n ** 18n;
  const dailyCapValue = dailyCapPpl === null ? null : dailyCapPpl * 10n ** 18n;
  const perSourceDailyCapValue = perSourceDailyCapPpl === null ? null : perSourceDailyCapPpl * 10n ** 18n;
  const claims = new Map();
  const inFlightBySource = new Map();
  const sourceDailyUsage = new Map();
  // Paid-out value and the UTC day (ms since epoch / 86_400_000) it belongs to.
  let payoutDay = -1;
  let payoutValue = 0n;
  let dailyGasUsed = 0n;
  let tail = Promise.resolve();
  let queued = 0;
  const sourceKeyOf = (source) => (typeof source === 'string' && source.length > 0 ? source : 'unknown');
  async function verifyNetwork() {
    const [network, block] = await Promise.all([provider.getNetwork(), provider.getBlock(1)]);
    if (network.chainId !== 97401n || block?.hash?.toLowerCase() !== firstBlockHash.toLowerCase()) throw new Error('wrong_network');
  }
  async function fund(body, source) {
    const request = parseRequest(body);
    const sourceKey = sourceKeyOf(source);
    if (request.address === wallet.address.toLowerCase()) throw new Error('invalid_address');
    if (request.value < minAmountWei) throw new Error('amount_too_small');
    if (request.value > maxAmountValue) throw new Error('amount_too_large');
    // One caller must not be able to hold the whole queue: a single source may only occupy
    // `maxInFlightPerSource` of the `maxQueue` slots, so a burst of its own addresses cannot
    // push legitimate requests out for the duration of its RPC round-trips.
    if (queued >= maxQueue) throw new Error('faucet_busy');
    if ((inFlightBySource.get(sourceKey) ?? 0) >= maxInFlightPerSource) throw new Error('faucet_busy');
    queued++;
    inFlightBySource.set(sourceKey, (inFlightBySource.get(sourceKey) ?? 0) + 1);
    const job = tail.then(async () => {
      const time = now();
      for (const [address, expires] of claims) if (expires <= time) claims.delete(address);
      if (claims.has(request.address)) throw new Error('rate_limited');
      if (claims.size >= maxTracked) throw new Error('faucet_busy');
      // Global budget resets at UTC midnight; epoch milliseconds are aligned to it.
      const day = Math.floor(time / 86_400_000);
      if (day !== payoutDay) {
        payoutDay = day;
        payoutValue = 0n;
        dailyGasUsed = 0n;
        sourceDailyUsage.clear();
      }
      if (dailyCapValue !== null && payoutValue + request.value > dailyCapValue) throw new Error('daily_budget_exhausted');
      if (perSourceDailyCapValue !== null) {
        const usedBySource = sourceDailyUsage.get(sourceKey) ?? 0n;
        if (usedBySource + request.value > perSourceDailyCapValue) throw new Error('rate_limited');
      }
      await verifyNetwork();
      const gas = await provider.estimateGas({ from: wallet.address, to: request.address, value: request.value });
      // A hostile contract recipient can quote an arbitrarily expensive `receive()`; cap what
      // the faucet is willing to pay for so it cannot drain the wallet through gas.
      if (gas > maxGasLimit) throw new Error('recipient_gas_too_high');
      const fees = await provider.getFeeData();
      const gasPrice = fees.maxFeePerGas ?? fees.gasPrice;
      if (gasPrice === null || gasPrice === undefined || gasPrice < 0n) throw new Error('fee_unavailable');
      const gasLimit = (gas * 12n + 9n) / 10n;
      const gasCost = gasLimit * gasPrice;
      if (dailyGasCapWei !== null && dailyGasUsed + gasCost > dailyGasCapWei) throw new Error('daily_budget_exhausted');
      const balance = await provider.getBalance(wallet.address);
      if (request.value + gasCost > balance) throw new Error('faucet_insufficient_funds');
      // Lock before broadcast. Ambiguous RPC failures must not permit a duplicate send.
      claims.set(request.address, time + cooldownMs);
      payoutValue += request.value;
      dailyGasUsed += gasCost;
      if (perSourceDailyCapValue !== null) {
        if (!sourceDailyUsage.has(sourceKey) && sourceDailyUsage.size >= maxTracked) {
          const oldest = sourceDailyUsage.keys().next().value;
          if (oldest !== undefined) sourceDailyUsage.delete(oldest);
        }
        sourceDailyUsage.set(sourceKey, (sourceDailyUsage.get(sourceKey) ?? 0n) + request.value);
      }
      const feeFields = fees.maxFeePerGas != null ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n } : { gasPrice };
      const tx = await wallet.sendTransaction({ to: request.address, value: request.value, gasLimit, ...feeFields });
      return { ok: true, chainId: 97401, amount: request.amount, txId: tx.hash, pending: true };
    });
    tail = job.catch(() => {});
    try { return await job; } finally {
      queued--;
      const left = (inFlightBySource.get(sourceKey) ?? 1) - 1;
      if (left <= 0) inFlightBySource.delete(sourceKey);
      else inFlightBySource.set(sourceKey, left);
    }
  }
  return { fund, verifyNetwork };
}
