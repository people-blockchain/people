# Cosmos EVM testnet faucet

Status: implemented and covered by unit tests; deployment is an operator action.
This faucet is only for the empty Cosmos EVM testnet (EVM chain ID 97401), not Mainnet.

The user supplies a `0x` recipient and a positive decimal PPL amount. Amounts
are parsed as integers with 18 decimal places; exponent notation, negative
amounts and excess precision are rejected. There is no fixed grant size.
The requested amount plus an estimated gas reserve must fit the faucet wallet's
existing balance. The faucet does not mint, use validator stake, or promise
coins with financial value.

`GET /faucet` serves an independent Russian/English form.
`POST /faucet/fund` accepts `{ "address": "0x…", "amount": "12.5" }`.
Success (HTTP 202) means the transaction was submitted, not confirmed; the reply
contains `txId`, `amount`, `chainId: 97401`, and `pending: true`.
`GET /faucet/status` checks the chain and exposes the public faucet address and
its actual balance in `appl`.

At most one request per recipient per day (24 h cooldown) and at most 100 PPL
per request are allowed. On top of that, the faucet pays out at most
`FAUCET_DAILY_CAP_PPL` (default **10000 PPL**) over all recipients in a UTC
day; once the budget is spent, further requests fail with
`daily_budget_exhausted` (HTTP 503) and the message
"Faucet is empty for today, try again tomorrow", until the next UTC day. The
budget resets at UTC midnight and does not depend on a service restart. Sends
are serialized and nonces managed by ethers. The queue and in-memory recipient
table are bounded.
An uncertain broadcast error keeps the cooldown, avoiding an immediate retry.
Restarting the service clears the cooldown table; this is a testnet abuse
control, not proof of humanity or a production entitlement system.

Before each send, both chain ID and block 1 hash must match. Because a testnet
reset can retain chain ID 97401, the hash prevents sending on an unintended
replacement chain. A reset requires an explicit new faucet configuration.

## Operator setup

Use Node 22 and run `npm ci` in `chain/scripts`.
The service binds only `127.0.0.1:4050`; publish the `/faucet` routes through
HTTPS nginx. Use an ingress rate limit and a small request body limit.
Do not expose RPC `personal` or permit HTTP keyring unlock.

The per-source queue cap (M06-3) keys on the client IP the site proxy forwards
in `x-people-client-ip` (deployed nginx may still send the legacy
`x-ovn-client-ip` name; the faucet accepts either when proxy trust is enabled). The service ignores that header unless
`TRUST_PROXY_HEADERS=1` **and** the immediate peer is the trusted proxy, so a
local process cannot rotate source keys. The trusted peer defaults to loopback;
override with `FAUCET_TRUSTED_PROXY` (comma-separated addresses) if the proxy
connects from a fixed non-loopback address. On the website side the real client
IP comes from Vercel's `x-vercel-forwarded-for`; set `TRUST_PROXY_HEADERS=1`
there only behind an ingress that overwrites `X-Real-IP`/`X-Forwarded-For`.

Configure a dedicated unprivileged service with a root-owned, mode-0600
environment file:

- `FAUCET_PRIVATE_KEY`: a separate test-only funded account, never a validator key;
- `FAUCET_RPC_URL`: local EVM RPC, normally `http://127.0.0.1:8545`;
- `FAUCET_FIRST_BLOCK_HASH`: the verified EVM block 1 hash of this genesis;
- `FAUCET_PORT`: defaults to 4050;
- `FAUCET_DAILY_CAP_PPL`: global per-UTC-day payout budget, defaults to 10000 (`off` disables it);
- `FAUCET_MIN_AMOUNT_PPL`: minimum request, decimal PPL, defaults to 1. Smaller requests
  (including 1 wei) are refused with `amount_too_small` before they can use the 24 h slot;
- `FAUCET_SOURCE_DAILY_CAP_PPL`: value one client source may receive per UTC day across all
  its addresses, defaults to 200 (`off` disables it); error `source_daily_limit`;
- `TRUST_PROXY_HEADERS=1` (alias `TRUST_PROXY=1`): opt in to the forwarded client-IP header.
  Unset, the socket address is the source key. The ingress must overwrite the header
  (never append) and apply `limit_req` to `/faucet/fund`.

Start `node faucet-server.mjs`. Never print the environment file or key.
Fund this account from existing authorized test balances. The initial funding
amount is operational configuration, not an emission or reward rule.

## Checks

`npm run test:faucet` covers precise amounts, validation, gas funding,
network identity, concurrent duplicates and failure modes.
Verify a real requested-amount transfer by receipt and recipient balance after
deployment. HTTP acceptance alone is not evidence of confirmation.

The website wallet has an editable amount and a link to the independent
Cosmos faucet. This does not migrate the legacy wallet/explorer REST API;
full website EVM cutover remains a separate implementation.
