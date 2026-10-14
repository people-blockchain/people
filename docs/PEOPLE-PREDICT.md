---
# People Predict — testnet MVP

Status: **APPROVED MVP rules** (founder answers in this chat, 2026-10-14).
Implementation: local source and tests; **live on chainId 97401** at `0x77408f49f36520b722CbcCDBeD68aCc8c5Ca4eBf`, **NOT PRODUCTION-READY**.
Alex approved testnet deployment and public-repo merge on 2026-10-14; roles and rules below are binding for that release.

## Approved scope

Separate People Predict application surface at `/predict` (RU/EN), reusing the website's Next.js
build and external-wallet adapters. Own navigation, mobile layout and Russian/English
interface. Routes: markets, event/[id], portfolio, rules, administrator creation.
Question text/terms remain the exact on-chain original; translations never redefine outcomes.
A dedicated domain/standalone hosting is TBD and is not provisioned here.

Only existing **test PPL**, no monetary prizes, sale, Mainnet, real-money asset,
new PPL emission, validator/consensus/economic changes or network reset.

Founder approved:

- 1 test PPL backs one Yes + one No position; winning position pays 1 PPL, losing pays 0.
- Participant limit orders; no AMM, initial liquidity, subsidies or guaranteed fills.
- App fee **0**; existing network gas is separate.
- Approved administrator creates markets; a named resolver proposes outcomes;
  a separate arbiter decides disputed outcomes. Approved roles: administrator
  (immutable constructor admin) PeopleMultisig `0xbE38DD4bEA1406878FF40AE1D5cE7c7e6Dc7ddaB`;
  default resolver for first markets Alex `0x510B2e28e936d36eF1EDDA7C9ea592e359aB5D48`;
  default arbiter Kirill `0x685Ef7cE99a7C8bBC7BdE0B12594376163DDd4B2`.
- **48 hours** to dispute a proposal.
- Cancelled/undefined market pays **0.5 PPL per position**.

## Contract and conservation

`contracts/src/PeoplePredict.sol` is a purpose-built native-PPL contract, not an
already audited Polymarket deployment. Constructor accepts chain 97401 (testnet)
and 31337 (local Foundry). Non-upgradeable; immutable administrator (not Ownable2Step);
deploy sets admin to the PeopleMultisig `0xbE38DD4bEA1406878FF40AE1D5cE7c7e6Dc7ddaB`.
No administrator withdrawal or collateral seizure, no ERC20 mint, no emissions or transfer fees.
Approved role addresses are distinct; operational custody procedures remain subject to review.
Only the administrator can create markets; `createMarket` is admin-only, so creating
the first market is a multisig transaction.

Positions are contract ledger entries in 18-decimal atoms, not generic ERC1155 assets.
Trading step and price tick are **0.0001** (technical precision choice). Every fill
therefore has an exact integer cost `amountAtoms * priceAtoms / 10^18`; every void
payout is exact. Price is strictly between 0 and 1 PPL. No float is used for funds.
Only chart coordinates convert to floating point, after immutable amounts are read.

Split deposits native collateral and creates equal Yes/No balances. Merge burns equal
free positions and credits native collateral before finalization. A buy order escrows
exact PPL cost; a sell order escrows existing positions. On-chain monotonic order IDs
prevent replaying a filled/cancelled amount. Takers fill whole or partial quantities;
self fills, expired orders, late trading and incorrect payments fail. Makers can cancel
remaining escrow at any time, including after finalization. Payouts and sale proceeds
become withdrawable credits. Withdrawal uses checks-effects-interactions and
OpenZeppelin ReentrancyGuard; failed transfers roll back the credit debit.

With no forced donations:

`contract.balance == totalCollateral + totalBuyEscrow + totalCredits`

Forced native donations can make the balance larger; they do not grant a withdrawal
right. A sell order's locked position remains backed in market collateral. Cancel sell
orders before redeeming. Resolving one market never consumes another market's escrow.

## Terms and settlement

Creation stores title, exact Yes/No criteria, official outcome source, category, closing
time, resolver and arbiter immutably. No external metadata database overrides them.
Only the administrator can create markets; `createMarket` is admin-only, so creating the
first market is a multisig transaction. For first markets the default resolver is Alex
`0x510B2e28e936d36eF1EDDA7C9ea592e359aB5D48` and the default arbiter is Kirill
`0x685Ef7cE99a7C8bBC7BdE0B12594376163DDd4B2`. The source URL is rendered as a link only
for credential-free HTTPS URLs; all stored strings render as text, not injected HTML.

At the close timestamp, splits, new orders and fills stop. Resolver can propose Yes,
No or Void once, after close, with a nonzero evidence hash. Anyone can dispute once
strictly before `proposedAt + 48 hours`, supplying a counter-evidence hash. No dispute
bond/fee is approved or introduced. From that boundary, if unchallenged anyone can
finalize **only** the proposed outcome. If challenged only the named arbiter can finalize
Yes, No or Void, with nonzero evidence hash. Final outcome is irreversible and payouts
cannot be redeemed twice. Cancellation is Void through this same process, not a
privileged early emergency refund.

Evidence contents must be published and retained independently: hashes do not recover
text/URLs. There is no built-in evidence hosting or AI oracle. AI explanations/source
collection are a later helper, never settlement authority; no AI service is wired now.

Trust/liveness limits: named humans are trusted; a resolver refusing to propose or
an arbiter refusing to decide can stall settlement. Automatic timeout, role rotation,
replacement and governance mechanisms remain **TBD**, not silently invented. A free
public dispute can force arbitration; this is a controlled-testnet limitation. Wash
trading by multiple wallets can distort prices and history; no probability/earnings
promise or anti-wash claim is made. Real-money use and production readiness require
separate decisions and review.

## Network identity and deployment gate

Read-only live verification 2026-10-14: `/rpc` returned `eth_chainId=0x17c79` and
moving heads (~329k); `/status` returned network `people_97401-1`, catching_up=false.
Default RPC `https://node.peopleblockchain.network/rpc`, WS endpoint in existing
configuration `wss://node.peopleblockchain.network/ws`, native PPL/appl **18 decimals**.
The app uses bounded HTTP polling, not WS subscriptions. Historical OVN 6-decimal RPC
notes do not apply to this Cosmos EVM application.

`website/src/lib/predict/deployment.json` pins the live address, runtime code hash, genesis hash, start block and release SHA. Roles are approved
(administrator PeopleMultisig `0xbE38DD4bEA1406878FF40AE1D5cE7c7e6Dc7ddaB`, default
resolver Alex `0x510B2e28e936d36eF1EDDA7C9ea592e359aB5D48`, default arbiter Kirill
`0x685Ef7cE99a7C8bBC7BdE0B12594376163DDd4B2`) and the contract is live on chainId 97401 at `0x77408f49f36520b722CbcCDBeD68aCc8c5Ca4eBf`. Therefore live RPC health/balances can be read, but no markets, odds, activity or
positions are fabricated, and writes remain disabled until the manifest records the
reviewed address and code pins. Existing factories/DEX addresses are not reused.

After a **separately approved concrete release** with the approved role addresses above,
record reviewed contract address, on-chain runtime code keccak256 (including immutable admin),
network genesis block hash, deployment start block and release SHA in that manifest. Both
reader and pre-sign check verify chain, fresh head, genesis and exact code. Partial/malformed
manifest, network reset, wrong version, wrong code, stale head or RPC error fail closed.
No deploy script is run or key fetched by this task. Do not reset/reconfigure live nodes.
Server deploys follow merged main or an explicitly approved SHA.

External wallets: MetaMask/Trust (injected or their mobile browser) and existing optional
WalletConnect adapter. WalletConnect requires `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
People Predict does not read/export private keys or sign server-side. Before writes,
verify current wallet chain and account, recheck deployment, simulate the call, recheck
account, then ask the wallet to sign. Track submitted hash separately from confirmed
receipt (2 blocks); receipt timeout means **unknown**, never unsent. Do not resend blindly.

## Reader / indexing

`GET /api/predict` is read-only, rate-limited, no-store. RPC URL comes from existing server
configuration. Queries cannot supply a deployment, private key or upstream URL. Reads
pin one block number, validate its hash before returning, and discard reorg snapshots.
Market state/positions/credits are direct contract reads, never database balances.

Markets page is **20 IDs per page**; order window **50 IDs per page**, newest first.
Filters/search apply to the current page, not a claimed global search. Free positions
and order escrow are distinct. Portfolio pages cover those 20 market IDs; recover orders
via event pages. No valuation or total portfolio performance is guessed.
Trade history/charts cover the latest **2000 blocks**, starting no earlier than deploy.
Logs are contract-address/event-filtered, ordered by block/log index and deduplicated by
block hash/log index. Yes/No price series use actual trade events, not complementary
synthetic prices or liquidity estimates. This is a bounded live adapter, **not a durable
full-history indexer**. Persistent indexing/checkpoints, all operation history, global
search/depth, evidence storage and production performance work remain TBD/follow-up.
No DB migration or off-chain market settlement is introduced.

## Reproducible checks and local preview

From `website/`, Node 22:

```sh
npm ci
npm run test:predict
npm run typecheck
npm run lint
npm run build
npm run preview:predict
```

Open `http://127.0.0.1:3101/predict`. The local launcher binds loopback and generates
an ephemeral auth secret in memory if absent; it does not change production auth or
write a secret to disk. Install the matching browser for test execution with
`npx playwright install chromium`, then `npm run test:predict:browser`. Never enable arbitrary-branch Vercel deployment.
Native npm optional packages must match the host architecture; if an Intel macOS clean
install omitted them, restore exactly the versions selected in package-lock/node_modules,
without changing tracked dependencies. Turbopack on this host additionally required
the same native binary at Lightning CSS's supported fallback path inside node_modules.
Build failure blocks push per AGENTS.md.

From `contracts/`, Foundry + solc 0.8.24:

```sh
forge build
forge test --match-contract PeoplePredictTest -vv
forge test
bash scripts/check-eip170.sh
```

Foundry tests cover native conservation, partial bid/ask fills, cancellations, exact
smallest-lot void, authorization, closing/expiry/dispute boundaries, false payments,
replay/double payout, reentrancy and randomized conservation. Website Node tests use
an **isolated test-only RPC fixture**, covering exact sums, source sanitization,
wallet network/rejection, deployment pins, reorg detection, bounded paging and logs.
Browser fixtures must stay in test files; the shipped app contains no market fixtures.
The CI website test command includes `test:predict`; contracts CI already runs all tests.

## Primary-source research

The split / merge / redeem lifecycle is also documented by
[Polymarket](https://docs.polymarket.com/trading/positions/how-positions-work) and
[Gnosis Conditional Tokens](https://github.com/gnosis/conditional-tokens-contracts).
These are architectural references, not a claim of identical contracts, audits, shared
oracle or compatible token IDs. The approved MVP uses native PPL and its own restricted
ledger; integrating an external ERC1155 framework/optimistic oracle is a separate choice.

## Validation record — 2026-10-14

- `forge test`: **260 passed**, including 14 People Predict tests and 256 randomized
  conservation cases. Full existing contract suite preserved.
- `forge build`: passed. `forge build --sizes` and inspection of 31 compiled src
  artifacts satisfy EIP-170; PeoplePredict runtime **8815 bytes**.
- Website build, lint, typecheck: passed; `test:predict`: **16 passed**.
- Existing roadmap / locale checks: **6 passed**. Browser tests: **5 passed**, including
  390px/1280px layouts, RU/EN, RPC failure, wrong wallet chain and undeployed write gate.
- Existing `test:wallet`: 90/91 without DATABASE_URL; the unchanged cloud-vault migration
  test requires that configuration guard even though its DB loader redirects to PGlite.
  With `DATABASE_URL=postgres://test.invalid/isolated-pglite-fixture`: **91/91 passed**;
  no real database was contacted. No wallet implementation/test was weakened or modified.
- Read-only HTTP and WS probes both returned chain 97401; Cosmos status matched
  `people_97401-1`. Local `/predict` and `/api/predict` returned HTTP 200 and a real
  moving head with `status=undeployed`.

Resolved local tooling issues: npm's missing Intel macOS optional CSS binaries,
missing Forge libusb, matching Playwright browser installation, and the deprecated
Foundry `testFail*` name prefix (renamed; the withdrawal-revert assertion retained).
The repository size-check shell wrapper dropped DYLD_LIBRARY_PATH on this Mac;
its equivalent cached artifact size check passed without changing the repository script.
Compiler warnings remain in existing contracts, plus standard timestamp lint warnings
for deadline checks; these are not an independent security audit.

No deployed-market browser test or public testnet transaction was performed. A reviewed
release must still be exercised on 97401 as part of the in-progress deployment on chainId 97401.
