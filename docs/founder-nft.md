# People Founder NFT (C8)

**Status:** contracts + genesis tooling implemented, not deployed. No website integration yet.

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

`personId` is the same `bytes32` identifier the sale contracts use (`derivePersonId` in
`website/src/lib/sale/eligibility.ts`): one human, one `personId`.

## Contract: `contracts/src/nft/PeopleFounderNFT.sol`

ERC-721 (OpenZeppelin v5) + EIP-712 + ERC-5192. No payment, no sale, no owner, no admin mint.
Constructor: `(address signer, uint256 mintDeadline)`, both immutable.

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

### Rebind

Wallet recovery or migration: the person's token moves to a new address **keeping the same number**.
There is no on/off flag.

`rebind(bytes32 personId, address oldHolder, address newHolder, uint256 nonce, uint256 deadline, bytes signature)`

```
Rebind(bytes32 personId,address oldHolder,address newHolder,uint256 nonce,uint256 deadline)
```

- The Rebind typehash is separate, so a Mint signature can never be presented as a Rebind.
- `msg.sender` must equal `newHolder`.
- The token is burned at `oldHolder` and the **same id** is minted to `newHolder` through internal
  functions (so the soulbound transfer lock does not apply). The next-id counter does not move;
  `totalMinted` and `totalSupply` are unchanged; `tokenOfPerson(personId)` is unchanged.
- Emits `Rebound(personId, tokenId, oldHolder, newHolder)` (plus `Transfer` burn/mint and `Locked`).
- Reverts: expired, replayed nonce (nonces are shared with mint, per `personId`), bad signature,
  `oldHolder` holds no token, the token of `oldHolder` is not `personId`'s (`PersonMismatch`),
  `newHolder` already holds a Founder NFT (including `newHolder == oldHolder`).
- **Rebind stays available after `mintDeadline`.** It is not new issuance (no new id, no supply
  growth), so closing the mint window must not strand people who lose a wallet.

### Metadata and views

`tokenURI(id)` is a fully on-chain base64 JSON data URI: name `People Founder #<id>`, an on-chain SVG
image. Views: `tokenOfPerson(personId)` (0 if none), `personOf(tokenId)`, `totalMinted()`,
`totalSupply()`, `signer`, `mintDeadline`, `mintDigest(...)`, `rebindDigest(...)`, `usedNonces`.

### Trust model

`signer` is immutable: no rotation. A compromised signing key could issue tokens to fresh `personId`s
(only until `mintDeadline`) and sign rebinds (also after it). Mitigation is the short mint window and
redeploying a fixed collection if the key is ever lost. The backend should keep the key in a KMS/HSM and
sign short-lived (minutes) deadlines.

### Deploy (PEOPLE testnet only)

`contracts/script/DeployFounderNFT.s.sol` reads everything from the environment and refuses any chain
other than `97401`:

| Variable | Meaning |
| --- | --- |
| `FOUNDER_NFT_DEPLOYER_PK` | deployer key (never commit) |
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

## Tests

`contracts/test/PeopleFounderNFT.t.sol` (unit + fuzz), `PeopleFounderNFT.invariant.t.sol` (exactly one
token per `personId`, at most one per address, supply equals successful mints, ids dense),
`DeployFounderNFT.t.sol` (script env handling and chain guard).
