# People Founder NFT (C8)

**Status:** contracts + genesis tooling implemented, not deployed. The website flow is integrated and stays hidden until `NEXT_PUBLIC_FOUNDER_NFT_ADDRESS` is set; issuing a signature also needs `FOUNDER_NFT_SIGNER_PK`.

A free, non-transferable (soulbound) NFT for every person verified through **Human Passport**.
One token per person, one token per address, numbered sequentially from 1.

## Eligibility

| Verification | Level (`website/src/lib/founders/verification.ts`) | Founder NFT |
| --- | --- | --- |
| none | `0` | no |
| Telegram | `1` (`VERIFICATION_LEVEL_TELEGRAM_PHONE`) | **no** |
| Human Passport | `2` (`VERIFICATION_LEVEL_STRONG`) | **yes** |

Eligibility is hard-coded, not configurable. The contract cannot verify a human itself: the backend signs
a mint authorisation **only** for a Human Passport-verified person. Telegram-only users are never signed
for, so they cannot mint. The genesis generator applies the same rule independently (`ELIGIBLE_LEVEL = 2`).

### `personId` (backend: `website/src/lib/founders/founder-nft-person.ts`)

One human, one `personId`: an opaque random `bytes32` (0x + 64 hex) assigned on first sight and stored in
`founder_nft_person` (`website/drizzle/0021_founder_nft_person.sql`). The dedup key is **not** the wallet
address but the person's Human Passport stamp nullifiers, which are stable across wallets:

- Source: Stamps API v2 `GET https://api.passport.xyz/v2/stamps/{address}`; each `items[].credential`
  is the full verifiable credential. Its `credentialSubject.nullifiers` (array) are used; older
  credentials only carry `credentialSubject.hash`, which is treated as a nullifier.
- Stored: only `sha256("people-founder-nft:hp-nullifier:" + nullifier)` in `founder_nft_stamp_hash`
  (`stampHash` primary key -> `personId`). No raw nullifier, wallet address or other PII.
- Resolve: no stored match -> new `personId`; all matches point to one `personId` -> that person (new
  stamp hashes are attached to it); matches point to several `personId`s -> refused and logged
  (opaque ids and counts only), never merged.
- Rebind: a new wallet must present the same nullifiers (any already-stored one identifies the person).
  Human Passport's own LIFO dedup marks reused stamps on the new address as `dedup: true` with score 0;
  that is expected and the new address's score is not used for rebind.

## Contract: `contracts/src/nft/PeopleFounderNFT.sol`

ERC-721 (OpenZeppelin v5) + EIP-712 + ERC-5192 + `Ownable2Step`. No payment, no sale, no admin mint.
Constructor: `(address owner, address signer, uint256 mintDeadline)`; `mintDeadline` is immutable.

### Signer administration

`owner` (intended: a Safe multisig; ownership moves with the two-step `transferOwnership` /
`acceptOwnership`) can only manage the backend signer. It cannot mint, move or burn tokens.

- `setSigner(newSigner)` rotates the key (zero reverts with `ZeroSigner`). Emits
  `SignerUpdated(previousSigner, newSigner, epoch)`.
- `revokeSigner()` sets `signer = 0`: `mint`, `requestRebind` and `executeRebind` revert with
  `SignerDisabled` until a new signer is set. Emits `SignerRevoked(previousSigner, epoch)`.
- Both bump `signerEpoch`. Signatures are checked against the **current** signer only, so after a
  rotation every signature of the old key fails (`InvalidSignature`), including issued-but-unused ones,
  and pending rebinds requested under an older epoch can no longer be executed (`StaleRebind`).

### Mint

`mint(bytes32 personId, address to, uint256 nonce, uint256 deadline, bytes signature)`

Signed typed data (domain `PeopleFounderNFT` / `1`, with `chainId` and `verifyingContract`):

```
Mint(bytes32 personId,address to,uint256 nonce,uint256 deadline)
```

- `msg.sender` must equal `to` (nobody can land a signature onto someone else's address).
- `block.timestamp <= deadline` and `block.timestamp <= mintDeadline` (the mint window closes for good).
- `(personId, nonce)` is single-use. A failed call consumes nothing.
- Reverts if the person already has a token or `to` already holds one.
- Ids are `1, 2, 3, ...`; `totalMinted` is the last id issued.

### Soulbound (ERC-5192)

`locked(tokenId)` is always `true`; `Locked(tokenId)` is emitted on mint. `transferFrom`, both
`safeTransferFrom`, `approve` and `setApprovalForAll` revert with `Soulbound()`.
`supportsInterface(0xb45a3c0e)` is `true`.

### Rebind (two steps, 72h timelock)

Wallet recovery or migration: the person's token moves to a new address **keeping the same number**.
There is no on/off flag (only `revokeSigner` stops it).

1. `requestRebind(bytes32 personId, address oldHolder, address newHolder, uint256 nonce, uint256 deadline, bytes signature)`,
   called by `newHolder` with a backend signature over

   ```
   Rebind(bytes32 personId,address oldHolder,address newHolder,uint256 nonce,uint256 deadline)
   ```

   Records `pendingRebinds[personId] = {oldHolder, newHolder, executeAfter = now + 72h, signerEpoch}` and
   emits `RebindRequested(personId, tokenId, oldHolder, newHolder, executeAfter)`. Nothing moves yet.
   A new valid request for the same person replaces the pending one and restarts the delay.
2. During the delay (`block.timestamp < executeAfter`) the **current holder** of the token can
   `cancelRebind(personId)` (`RebindCancelled(personId, tokenId, holder)`). Nobody else can — not the
   requester, the owner or the signer (`NotHolder`). After the delay, cancel reverts
   (`RebindDelayElapsed`).
3. From `executeAfter` (inclusive: exactly `t + 72h` works, `t + 72h - 1` reverts with
   `RebindDelayActive`) `newHolder` calls `executeRebind(personId)`. Re-checks: signer not revoked,
   same `signerEpoch`, token still at `oldHolder`, `newHolder` still holds nothing. The token is burned
   at `oldHolder` and the **same id** is minted to `newHolder` through internal functions (the
   soulbound lock does not apply). Emits `Rebound(personId, tokenId, oldHolder, newHolder)` (plus
   `Transfer` burn/mint and `Locked`).

- The Rebind typehash is separate, so a Mint signature can never be presented as a Rebind.
- The next-id counter does not move; `totalMinted`, `totalSupply` and `tokenOfPerson` are unchanged.
- `requestRebind` reverts: expired, replayed nonce (nonces are shared with mint, per `personId`; a
  cancelled request's nonce stays used), bad or rotated-out signature, `oldHolder` holds no token, the
  token of `oldHolder` is not `personId`'s (`PersonMismatch`), `newHolder` already holds a Founder NFT
  (including `newHolder == oldHolder`), caller is not `newHolder`.
- **Rebind stays available after `mintDeadline`.** It is not new issuance (no new id, no supply
  growth), so closing the mint window must not strand people who lose a wallet.
- The token stays locked (non-transferable) while a rebind is pending.

### Metadata and views

`tokenURI(id)` is a fully on-chain base64 JSON data URI: name `People Founder #<id>`, an on-chain SVG
image. Views: `tokenOfPerson(personId)` (0 if none), `personOf(tokenId)`, `totalMinted()`,
`totalSupply()`, `owner`, `signer`, `signerEpoch`, `mintDeadline`, `REBIND_DELAY`, `pendingRebinds`,
`mintDigest(...)`, `rebindDigest(...)`, `usedNonces`.

### Trust model

The backend signer is the only path to mint and to request a rebind. If its key leaks, the owner Safe
calls `setSigner` (or `revokeSigner`) and every signature of the leaked key stops working at once,
including unused ones and rebinds still waiting out their delay. The 72h delay plus the holder's
`cancelRebind` gives a person time to stop a rebind they did not ask for. The short mint window still
caps issuance. The backend should keep the key in a KMS/HSM and sign short-lived (minutes) deadlines.

### Deploy (PEOPLE testnet only)

`contracts/script/DeployFounderNFT.s.sol` reads everything from the environment and refuses any chain
other than `97401`:

| Variable | Meaning |
| --- | --- |
| `FOUNDER_NFT_DEPLOYER_PK` | deployer key (never commit) |
| `FOUNDER_NFT_OWNER` | admin address (intended: Safe multisig); may only rotate/revoke the signer |
| `FOUNDER_NFT_SIGNER` | backend signer address |
| `FOUNDER_NFT_MINT_DEADLINE` | unix timestamp, must be in the future |

## Genesis: `chain/scripts/generate_founder_nft_genesis.py`

Turns a snapshot of verified humans into the Founder NFT genesis records
(`tokenId -> personId -> holder`) for mainnet. Deterministic, stdlib only.

```bash
python3 chain/scripts/generate_founder_nft_genesis.py --input snapshot.json --output founder-nft-genesis.json
```

Input (`holder` is the **current** holder, i.e. after any rebinds; `tokenId` is the number minted on
testnet, or `null`):

```json
{"humans": [{"personId": "0x<64 hex>", "holder": "0x<40 hex>", "verificationLevel": 2, "tokenId": 1}]}
```

Output: `{"collection", "count", "records": [{"tokenId", "personId", "holder"}], "version"}`, sorted by
`tokenId`, sorted keys, lowercase hex, trailing newline. Same input gives byte-identical output; input
row order does not matter.

Rules:

- Only `verificationLevel == 2` (Human Passport) is emitted. Telegram-only (1) and unverified (0) are
  excluded, even if they hold a testnet `tokenId`.
- Duplicate `personId` (across all rows), duplicate `tokenId` (across all rows) and duplicate `holder`
  (among eligible rows) are errors; malformed ids/addresses/levels are errors.
- Numbers are stable: an existing `tokenId` is kept. Newcomers are numbered after the highest `tokenId`
  seen in the input (excluded rows included, so a withdrawn number is never reused), in ascending
  `personId` order.

Tests: `cd chain/scripts && python3 -m unittest test_generate_founder_nft_genesis` (also
`npm run test:founder-nft-genesis`, and a step in `.github/workflows/chain-ci.yml`). The fixture
`chain/scripts/fixtures/founder-nft-snapshot.sample.json` uses synthetic addresses only.

## Website

The founders block shows a Founder NFT card when the public contract address is set and, if static `evm-deployments` also lists `founderNft` or `peopleFounderNft`, that entry is the same address. `/founders` redirects to `/bounty`, so the card is rendered in both `FoundersApp` variants (the bounty earn block and the standalone landing). `/wallet` and `/explorer/nfts` list the tokens through the existing `nfts` compat read. Founder's Seal copy is unchanged.

Before a Mint or Rebind signature is issued, the connected wallet must sign a server nonce (`GET /api/founders/nft/auth-nonce`). The message is rebuilt on the server from the stored row (`Address`, `Nonce`, `Chain ID`, `Expiration Time`) and checked with `verifyMessage`: the recovered address must be the wallet that will send the transaction, the chain id must be the one stored with the nonce, and the nonce is single-use. Expired and replayed nonces are rejected. The nonce lives in `founder_nft_auth_nonce` (same shape as `founder_passport_nonce`: random code, user, expiry, `usedAt`). No extra secret is required. `cancelRebind` and `executeRebind` are still sent by the wallet with no backend signature.

### Environment

| Variable | Where | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_FOUNDER_NFT_ADDRESS` | client and server | contract address. Unset, malformed, or different from a `founderNft` / `peopleFounderNft` entry in static evm-deployments: the card is hidden and no Founder NFT rows are added |
| `NEXT_PUBLIC_FOUNDER_NFT_CHAIN_ID` | client and server | optional chain id. Defaults to `97401` (PEOPLE testnet) |
| `FOUNDER_NFT_SIGNER_PK` | server only | EIP-712 signer key. Never sent to the browser. If it is missing, `POST /api/founders/nft/signature` returns 503 `not_configured` with `reason: "signer"` and the card shows a disabled state |
| `FOUNDER_NFT_TEST_ALLOWLIST` | server only | Comma-separated wallets. Passes the whole Human Passport check (level and stamps), and only when `VERCEL_ENV` is not `production` and the contract chain id is `97401`. Production ignores it. A missing list or an unknown entry fails closed. Login and the verified-human gate still apply |

`FOUNDER_NFT_TEST_ALLOWLIST` is a commented line in `.env.example` with no value. The contract address and the signer key stay out of that file.

### Routes

Both routes use the existing founders session guard.

- `GET /api/founders/nft/status?address=` — what the card may offer for the connected wallet. Body `{ status, signerReady }`. `401` and `403` hide the card. `503` is the disabled state.
- `GET /api/founders/nft/auth-nonce` — `{ nonce, expiresAt, chainId }` for the wallet to sign. `503` when the contract address is unset. The nonce is stored server-side and can be consumed once.
- `POST /api/founders/nft/signature` — body `{ action: "mint" | "rebind", address, nonce, chainId, walletSignature }`. Returns an EIP-712 `Mint` or `Rebind` signature whose typed data matches the contract (`personId`, `to` / `oldHolder`+`newHolder`, `nonce`, `deadline`; domain name `PeopleFounderNFT`, version `1`, `chainId`, `verifyingContract`) only after the wallet signature checks out. Missing signature, a different signer, an expired nonce, a replayed nonce, and a different chain id are rejected and no EIP-712 signature is returned. The signer key stays in the server environment.

`cancelRebind` and `executeRebind` are sent by the wallet with no backend signature. The card shows a pending move with a countdown, a Cancel button for the current holder while `now < executeAfter`, and Execute for the new holder once the 72 hours have elapsed.

### States

| State | Card |
| --- | --- |
| `can_mint` | "Get Founder NFT" (level 2 only) |
| `holder` | "Your Founder NFT #N", plus Cancel while a move is still inside the delay |
| `rebind_available` | request the same number onto this wallet. When `dedup` is true the card explains that these Human Passport stamps were already used by another wallet, so this account cannot be verified again, and the only action is the rebind button |
| `rebind_pending` | countdown, then Execute |
| `minted_elsewhere`, `mint_closed`, `not_eligible` | text only, no button |

A Telegram-only founder (level 1) is `not_eligible`. Asking for a signature returns `403` `hp_required` and no signature. `FOUNDER_NFT_TEST_ALLOWLIST` is the only exception: on chain `97401` outside production it passes the whole Human Passport check, including a wallet with no stamps (see Environment). A pending rebind recorded under an older `signerEpoch` is ignored (the contract would revert with `StaleRebind`).

### personId

The website does not derive a new id scheme. `personId` is the opaque `bytes32` stored in `founder_nft_person`, keyed by Human Passport stamp-nullifier hashes in `founder_nft_stamp_hash` (`website/src/lib/founders/founder-nft-person.ts`). Stamps are read for the connected wallet (the address that will send the transaction). The one exception is an allowlisted wallet on chain `97401` outside production that has no stamps: its mint signature uses `keccak256` of a fixed domain string plus that address, so the id is stable and non-zero, and the stamp table is not written. Production and any other chain never take this path.

A new account that cannot reach verification level 2 because those stamps were already used is handled only by rebind: if the nullifiers already map to a person who holds a token, the card shows the dedup message and a rebind button, and mint is refused. That includes stamps Human Passport marks `dedup: true` (score 0) and any below-level-2 founder whose stamps already match a minted person. The new address's score is not consulted. A level-2 founder whose stamps match a token, without `dedup` and without a signature-proven `passportWallet`, still sees the "link your Human Passport wallet" text and no rebind button.

### Wallet and explorer rows

`website/src/lib/evm/founder-nft-rows.ts` is appended in the `nfts` branch of `people-compat.ts`. With an `owner` query it reads that address's token. Without one it lists token ids `1..min(totalSupply, 50)`. Each row is `{ nftId: "founder-nft-<id>", name, imageUri, owner, creator: owner, collection: <contract>, onChainTokenId }`, with name and image taken from `tokenURI`. A failed read returns no Founder NFT rows and leaves the rest of the list intact. The address comes from `NEXT_PUBLIC_FOUNDER_NFT_ADDRESS`. If static evm-deployments also has `founderNft` or `peopleFounderNft`, that value must be the same address; a mismatch, an empty value, or an invalid value yields no rows and does not fail the request. `tokenOfOwner` reads `Transfer` logs in windows of at most 9,000 blocks (newest window first). It never asks for one open-ended range. If a window is refused, it falls back to walking at most 500 ids.

## Open questions

- **OPEN QUESTION:** mint now reads Human Passport stamps for the connected wallet, not for `walletAddress` when that differs. A level-2 founder who connects a different address with no stamps is not offered a mint.
- **OPEN QUESTION:** if reused stamps were never stored in `founder_nft_stamp_hash` (the original mint did not go through this table), a new deduped account cannot be matched to a `personId`, so rebind is not offered.
- **OPEN QUESTION:** the id-walk fallback still stops at 500 tokens. A node that rejects a 9,000-block window and a supply above that cap can miss a holder.
- **OPEN QUESTION:** static `evm-deployments` does not list this collection yet. Rows appear when `NEXT_PUBLIC_FOUNDER_NFT_ADDRESS` is set and does not conflict with a future `founderNft` / `peopleFounderNft` entry.
- **OPEN QUESTION:** `.env.example` was left unchanged so this work does not touch env files. The variable names above have to be set by the operator outside the repo.

## Tests

`contracts/test/PeopleFounderNFT.t.sol` (unit + fuzz, incl. signer rotation/revocation, owner checks,
rebind timelock and holder cancel), `PeopleFounderNFT.invariant.t.sol` (exactly one
token per `personId`, at most one per address, supply equals successful mints, ids dense),
`DeployFounderNFT.t.sol` (script env handling and chain guard). Website: `website/scripts/founder-nft-service.test.mjs` (level-1 refusal, mint and rebind recovery, wallet-signature rejection, dedup rebind, stale pending, 503, bad input), `founder-nft-typed-data.test.mjs` (type strings against the contract, recovery of a key generated in the test), `founder-nft-ui.test.mjs` (countdown, error keys, `decodeFunctionData` of the four writes, locales, empty or mismatched collection address, bounded log windows), `founder-nft-person.integration.test.mjs` (person table, stamp dedup flag, auth-nonce single use). Run from `website/` with `npm run lint`, `npm run typecheck`, and `npm test`.
