# People Wallet — cloud vault (Auth.js)

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
4. Authenticated `GET /api/wallet/vault/wrap-key` returns the wrap key to the browser over HTTPS so the client can decrypt in memory for `signFactoryTx`.

`masterSecret` is `PEOPLE_WALLET_VAULT_SECRET` when set, otherwise `AUTH_SECRET` (testnet convenience — set a dedicated vault secret in production).

## Threat model

| Threat | Mitigation / limit |
| --- | --- |
| Database leak | Attacker needs `PEOPLE_WALLET_VAULT_SECRET` (or `AUTH_SECRET` if fallback) to decrypt vault rows. Plaintext keys are not stored. |
| Server compromise | Attacker with env secrets can derive wrap keys for all users and decrypt vaults. Treat vault secret like a HSM-backed key in production. |
| Session hijack | Bearer of a valid Auth.js session can fetch wrap key and decrypt that user's wallet for the session lifetime. Use secure cookies, `AUTH_SECRET`, HTTPS, short session TTL. |
| Operator honesty | This is a **convenience recovery** model, not hardware-wallet security. Users who need full self-custody should use create/import with a local password and backup phrase. |
| Export | Optional private-key export in `/wallet` settings; user responsibility after export. |

## Operations

- DDL: `website/drizzle/0003_user_wallet_vault.sql` (also in runtime bootstrap).
- Env: `PEOPLE_WALLET_VAULT_SECRET` (recommended), plus existing `AUTH_SECRET`, `DATABASE_URL`, Google/Resend auth vars.
