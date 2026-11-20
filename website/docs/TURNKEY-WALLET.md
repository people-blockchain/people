# Turnkey embedded wallets

Draft replacement for the current PEOPLE website wallet stack (Web3Auth + server
AES-GCM vault `user_wallet_vault`). Private keys never land on this server when
`WALLET_PROVIDER=turnkey`. This document is operator-facing; public UI copy is
English-only.

**This PR does not run the migration, does not write production data, and must
not be merged until the rollout checklist below is complete.**

## What changes

- One Turnkey **sub-organization per Auth.js user**.
- PEOPLE login (Web3Auth / email) happens first. The browser then creates a
  P-256 API key and the server creates the sub-org with that key as the only
  root user (non-custodial: the parent org is not added as a root).
- New users get an Ethereum-path secp256k1 account (`m/44'/60'/0'/0/0`) used on
  PEOPLE and Base.
- Returning vault users (the ~17 `user_wallet_vault` rows) are prompted to
  **import** the decrypted key into the Turnkey enclave. The address stays the
  same. Import is user-initiated on first wallet open.
- The database stores only `subOrganizationId`, Turnkey user/wallet ids, the
  EVM address, and import flags. No ciphertext, no private keys.

## Chains

| Chain ID | Public name | Notes |
| --- | --- | --- |
| 97400 | PEOPLE Mainnet Beta | Public mainnet-beta label only. |
| 97401 | PEOPLE | Public development network. |
| 8453 | Base | |
| 84532 | Base Sepolia | |

Signing:

- PEOPLE factory/JSON txs: client `signRawPayload` with `HASH_FUNCTION_SHA256`
  over the canonical JSON bytes (same digest as `signFactoryTx`).
- EVM txs / EIP-191 messages: `@turnkey/viem` account through the user’s
  Turnkey session. No private key in the browser except during the one-time
  vault import.

## Environment

Never commit real API keys. Placeholders live in `website/.env.example`.

| Variable | Where | Required when `WALLET_PROVIDER=turnkey` | Purpose |
| --- | --- | --- | --- |
| `WALLET_PROVIDER` | Server | No (default `legacy`) | `legacy` \| `turnkey` |
| `NEXT_PUBLIC_WALLET_PROVIDER` | Client bundle | Yes, to match the server flag at build time | Same values. Rebuild after changing. |
| `TURNKEY_ORGANIZATION_ID` | Server | Yes | Parent org. Default in code: `6ffc9541-4400-4c4b-8839-19fbc332a91b`. |
| `NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID` | Client | Yes | Same parent org id for the React kit. |
| `TURNKEY_API_PUBLIC_KEY` | Server only | Yes | Parent org API public key. |
| `TURNKEY_API_PRIVATE_KEY` | Server only | Yes | Parent org API private key. **Never** prefix `NEXT_PUBLIC_`. |
| `TURNKEY_API_BASE_URL` | Server | No | Default `https://api.turnkey.com`. |
| `DATABASE_URL` | Server | Yes | Needed to store sub-org id + address. |
| `PEOPLE_WALLET_VAULT_SECRET` | Server | For import / rollback | Version-aware wrap-key decrypt from PR #125. |
| `AUTH_SECRET` | Server | For import of vaultVersion 1 | Decrypt-only for legacy v1 rows. |

Also still required for PEOPLE login: Auth.js (`AUTH_SECRET`, `AUTH_URL`,
Google / Resend) and, until social login is retired, Web3Auth public client id.

## Feature flag

`readWalletProvider()` returns `legacy` unless the env value is exactly
`turnkey`. Production stays on Web3Auth + vault until both
`WALLET_PROVIDER` and `NEXT_PUBLIC_WALLET_PROVIDER` are set to `turnkey` and
the site is rebuilt.

`GET /api/auth/features` reports `{ walletProvider, turnkey: { configured, ready, organizationId } }`.
`organizationId` is only included when the flag is `turnkey`.

## Database

Migration file: `website/drizzle/0026_user_turnkey_wallet.sql`.

- **Do not run it from this PR.** Apply it in a dedicated ops step before
  flipping the flag.
- Runtime `ensurePartnerSchema()` also has idempotent `CREATE TABLE IF NOT
  EXISTS` for the same table (matches other partner tables). That still
  executes on boot when `DATABASE_URL` is set — review before deploying a
  preview that points at a shared database.

Columns: `userId` (PK), `subOrganizationId` (unique), `turnkeyUserId`,
`walletId`, `address` (unique when not null), `publicKey`,
`importedFromVault`, `legacyImportError`, timestamps.

## New-user flow

1. User signs in with the existing PEOPLE login.
2. Client creates a P-256 API key (`createApiKeyPair`) and POSTs it to
   `/api/wallet/turnkey/bootstrap` with `createWallet: true`.
3. Server `createSubOrganization` with that API key as root and an Ethereum
   account. Stores sub-org id + address.
4. First device can stamp requests with that API key. A new browser gets an
   email OTP (`/otp/init` + `/otp/verify`) bound to the PEOPLE account email,
   then `storeSession`.

## Legacy import (the 17 vault wallets)

Triggered when a signed-in user opens the wallet, the flag is `turnkey`, and
`user_wallet_vault` exists but `user_turnkey_wallet.address` does not.

1. Bootstrap a sub-org **without** creating a new wallet (`createWallet: false`)
   so Turnkey does not mint a different address.
2. Client fetches wrap-key + vault (same routes as today). Decrypt uses the
   **stored `vaultVersion`** (PR #125): v1 = `AUTH_SECRET`, v2 = dedicated or
   `PEOPLE_WALLET_VAULT_SECRET_PREVIOUS`, v3 = `PEOPLE_WALLET_VAULT_SECRET_NEXT`.
3. If the recovered secp256k1 key does not match `user_wallet_vault.address`,
   the client records `legacy_address_mismatch` and **does not import**. The
   user is told they can restore from a backup they previously exported. The
   vault row is left untouched so a later `WALLET_PROVIDER=legacy` rollback
   still decrypts (when wrap-key still works).
4. On match: `initImportPrivateKey` (TEK from the enclave) →
   `encryptPrivateKeyToBundle` in the browser → `importPrivateKey`. The
   imported Ethereum address must equal the vault address or the server
   records `legacy_address_mismatch` and returns 409.
5. Success stores the address with `importedFromVault=true` and clears
   `legacyImportError`.

`legacy_address_mismatch` cases:

- Vault ciphertext decrypts, but the key’s address ≠ stored `address`.
- Turnkey import succeeded but the enclave address ≠ expected vault address
  (should not happen if the same key was encrypted; treated the same).
- Wrap-key decrypt can still fail separately (`decrypt_failed`): wrong
  `vaultVersion` secret, truncated ciphertext, or `vault_schema_unsupported`.
  That is **not** `legacy_address_mismatch`; the user retries after wrap-key
  secrets are restored. Legacy decrypt remains the rollback path.

Do **not** batch-import the 17 keys on the server. The private key must be
encrypted to Turnkey’s TEK in the user’s browser.

## Signing

All PEOPLE JSON txs and EVM writes from the embedded wallet go through the
Turnkey session (`signRawPayload` / `@turnkey/viem`). The server never sees
the secp256k1 private key.

Not yet on Turnkey (open):

- Cosmos `SIGN_MODE_DIRECT` governance votes still need a local key. The UI
  refuses those while `session.kind === "turnkey"`.
- New-device email OTP uses `initOtp` / `verifyOtp` / `otpLogin`. Turnkey SDK
  8.10 types a V2 encrypted OTP bundle + `clientSignature`. The live path may
  need that client encryption before new-browser OTP works; first-device
  signing uses the browser P-256 API key as sub-org root and does not need OTP.

## Rollout

1. Apply `0026_user_turnkey_wallet.sql` to the target database (preview first).
2. Set Turnkey API keys on the preview project. Keep `WALLET_PROVIDER=legacy`.
3. Smoke-test `/api/wallet/turnkey/status` → `503`/`legacy` while the flag is
   off; no sub-orgs should be created.
4. Set `WALLET_PROVIDER=turnkey` and `NEXT_PUBLIC_WALLET_PROVIDER=turnkey` on
   preview only. Rebuild (the public flag is compile-time).
5. New test account: PEOPLE login → open wallet → sub-org + address row, no
   `user_wallet_vault` write.
6. One volunteer vault user: open wallet → import → same address, Turnkey
   signs a tiny PEOPLE tx and a Base message.
7. Confirm wrap-key + vault GET still work (rollback). Confirm CSP allows
   `https://api.turnkey.com` and `https://*.turnkey.com`.
8. Only then consider production flag flip. Do not merge this draft as the
   production default.

## Rollback

1. Set `WALLET_PROVIDER=legacy` and `NEXT_PUBLIC_WALLET_PROVIDER=legacy`.
   Rebuild.
2. Vault users whose rows were never imported keep using wrap-key decrypt.
3. Users who **already imported** into Turnkey no longer have a server-side
   private key. They stay on Turnkey or must use a Turnkey export (not
   implemented here) / a backup they saved earlier. Do not delete
   `user_turnkey_wallet` rows on rollback.
4. Leave the Turnkey table in place. It is unused while the flag is `legacy`.

## API map

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/wallet/turnkey/status` | Sub-org, address, `needsImport` |
| POST | `/api/wallet/turnkey/bootstrap` | Create sub-org (fresh PEOPLE auth) |
| POST | `/api/wallet/turnkey/otp/init` | Email OTP for a new device |
| POST | `/api/wallet/turnkey/otp/verify` | OTP → session token |
| POST | `/api/wallet/turnkey/register` | Persist address / public key |
| POST | `/api/wallet/turnkey/import/init` | TEK import bundle |
| POST | `/api/wallet/turnkey/import/complete` | Enclave import, or `{ mismatch: true }` |

All routes no-store, rate-limited, require Auth.js. Bootstrap and import
require a fresh `authTime` (same 15-minute window as wrap-key).
