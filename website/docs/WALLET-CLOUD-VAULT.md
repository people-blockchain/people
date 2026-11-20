# PEOPLE Wallet — cloud vault (Auth.js)

**Status:** IMPLEMENTED (website testnet). Not a Mainnet security audit.

## Behavior

- After Google OAuth or email magic link (existing Auth.js / Neon `user` table), the site creates or restores one embedded secp256k1 wallet per user.
- No seed phrase is shown; no local password is required for this path.
- The same login on another browser restores the wallet from the server-stored ciphertext.
- Partner portal `partner.walletAddress` is set automatically when the vault is created (same address as swap/factory signing).

## Cryptography

1. Client generates a private key (`generateWalletKeyPair`).
2. Server derives a per-user wrapping key: `HKDF-SHA256(masterSecret, salt="people-wallet-vault-v1", info="ppl-user-wrap:{userId}")`.
3. Client encrypts the private key with **AES-256-GCM** using that wrap key; only the JSON ciphertext is stored in `user_wallet_vault.encryptedPrivateKey`.
4. Authenticated `GET /api/wallet/vault/wrap-key` returns the wrap key to the browser over HTTPS so the client can decrypt in memory for `signFactoryTx`. That route re-wraps a behind-version row when it can, then returns the wrap key for the **stored** `vaultVersion` (never `NEXT` for an unmigrated v1/v2 row).

`masterSecret` is `PEOPLE_WALLET_VAULT_SECRET` (or `PEOPLE_WALLET_VAULT_SECRET_NEXT` while a dual-key rotation is in progress). There is **no** runtime fallback to `AUTH_SECRET`. If the dedicated secret is unset, vault routes answer `503 {error:"not_configured"}`. `AUTH_SECRET` is read only to decrypt-and-migrate leftover `vaultVersion === 1` rows.

## Vault versions

| Version | Wrapping secret |
| --- | --- |
| 1 | `AUTH_SECRET` (legacy only) |
| 2 | `PEOPLE_WALLET_VAULT_SECRET` (current while rotation env is unset) |
| 3 | rotated dedicated secret (`PEOPLE_WALLET_VAULT_SECRET` when `…_PREVIOUS` is set, or `…_NEXT` when that is set) |

Server-side re-wrap (same AES-GCM helpers as the client) moves v1 and, during rotation, v2 onto the current version with a compare-and-swap on `vaultVersion`. See `docs/WALLET-VAULT-SECRET-ROTATION.md`.

## Threat model

| Threat | Mitigation / limit |
| --- | --- |
| Database leak | Attacker needs the current dedicated vault secret (`PEOPLE_WALLET_VAULT_SECRET`, or `…_NEXT` during rotation) to decrypt current-version rows. Plaintext keys are not stored. v1 rows additionally require `AUTH_SECRET`. |
| Server compromise | Attacker with env secrets can derive wrap keys for all users and decrypt vaults. Treat vault secret like a HSM-backed key in production. Keep an owner-held copy; Vercel Sensitive vars cannot be read back. |
| Session hijack | Bearer of a valid Auth.js session can fetch wrap key and decrypt that user's wallet for the session lifetime. Use secure cookies, `AUTH_SECRET`, HTTPS, short session TTL. |
| Operator honesty | This is a **convenience recovery** model, not hardware-wallet security. Users who need full self-custody should use create/import with a local password and backup phrase. |
| Export | Optional private-key export in `/wallet` settings; user responsibility after export. |

## Operations

- DDL: `website/drizzle/0003_user_wallet_vault.sql` (also in runtime bootstrap).
- Env: `PEOPLE_WALLET_VAULT_SECRET` (**required** in production), plus existing `AUTH_SECRET`, `DATABASE_URL`, Google/Resend auth vars.
- Rotation: `PEOPLE_WALLET_VAULT_SECRET_PREVIOUS` or `PEOPLE_WALLET_VAULT_SECRET_NEXT` (optional). Runbook: `docs/WALLET-VAULT-SECRET-ROTATION.md`.
- Bulk migrate: `GET/POST /api/cron/wallet-vault-rotate` (Bearer `CRON_SECRET` or discover admin).
