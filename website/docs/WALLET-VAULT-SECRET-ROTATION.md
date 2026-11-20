# Rotate `PEOPLE_WALLET_VAULT_SECRET` (dual-key, no wallet loss)

**Status:** implemented in code. Owner-only operations: Vercel env + one authenticated migrate call.
Do **not** merge this runbook's env steps into a deploy that has not yet shipped the dual-key code.

Production vaults:

| `vaultVersion` | Wrapped with | Typical count before this rotation |
| --- | --- | --- |
| 1 | `AUTH_SECRET` (legacy) | leftover rows |
| 2 | current `PEOPLE_WALLET_VAULT_SECRET` | current rows |
| 3 | new owner-held secret (after rotation env is set) | 0 until migrate |

## Why server-side re-wrap

The browser encrypts the private key with a wrap key from `GET /api/wallet/vault/wrap-key`.
That wrap key is `HKDF-SHA256(masterSecret, salt="people-wallet-vault-v1", info="ppl-user-wrap:{userId}")`.
The server already derives the same key and already re-wraps v1 rows (`migrateLegacyVaultIfNeeded` / `migrateVaultIfNeeded`).

Rotation reuses that path:

- v1 → current version: decrypt with `AUTH_SECRET`, AES-256-GCM re-encrypt with the current secret.
- v2 → 3: decrypt with the previous secret, re-encrypt with the current secret.
- Compare-and-swap `UPDATE … WHERE userId = ? AND vaultVersion = <old>`. A lost race does not overwrite a newer row.
- Decrypt / address mismatch: **no write**. The ciphertext stays.

The wrap-key route migrates the row **before** returning the current wrap key, so the client never needs both old and new keys.

Deploying this code with rotation env **unset** changes nothing: current version stays 2, only v1→v2 runs.

## Endpoint (dry-run then migrate)

Protected like other admin/cron routes: `Authorization: Bearer $CRON_SECRET`, or a discover-admin session.

- `GET /api/cron/wallet-vault-rotate` — always dry-run. JSON `counts` per version (`1`, `2`, `3`, `other`, `total`).
- `POST /api/cron/wallet-vault-rotate` with `{"dryRun": true}` — same, no writes.
- `POST /api/cron/wallet-vault-rotate` — live migrate every behind-version row (same CAS as lazy login).

Not on the Vercel cron schedule. One-shot, owner-triggered. Do not point this at a production database from a laptop script.

## Choose a rotation mode

`PEOPLE_WALLET_VAULT_SECRET` in Vercel is **Sensitive**: the dashboard/API will not show the value again. If you have no offline copy, you **cannot** paste it into `PEOPLE_WALLET_VAULT_SECRET_PREVIOUS`. Use mode B.

Do not set PREVIOUS and NEXT at the same time. PREVIOUS wins (current env var is treated as the new secret).

### Mode A — you still have the current secret

1. Generate the new secret and store it in a password manager (this is now the only owner copy):

   ```bash
   openssl rand -base64 32
   ```

2. In Vercel → Project → Settings → Environment Variables (Production):
   - Add `PEOPLE_WALLET_VAULT_SECRET_PREVIOUS` = **current** (old) secret.
   - Edit `PEOPLE_WALLET_VAULT_SECRET` = **new** secret.
3. Continue at **Deploy and migrate**.

### Mode B — Sensitive / no copy of the current secret (recommended here)

The running app already has the old secret as `PEOPLE_WALLET_VAULT_SECRET`. Leave that variable **unchanged** until every row is v3.

1. Generate the new secret and store it in a password manager:

   ```bash
   openssl rand -base64 32
   ```

2. In Vercel → Environment Variables (Production):
   - Add `PEOPLE_WALLET_VAULT_SECRET_NEXT` = **new** secret.
   - Do **not** change `PEOPLE_WALLET_VAULT_SECRET` yet.
3. Continue at **Deploy and migrate**.

## Deploy and migrate

4. Deploy the build that contains dual-key rotation to Production (Redeploy after the env vars from step 2).
5. Dry-run (expect v1 leftovers + v2 current, `currentVersion: 3`, `rotationActive: true`):

   ```bash
   curl -sS -H "Authorization: Bearer $CRON_SECRET" \
     https://www.peopleblockchain.network/api/cron/wallet-vault-rotate
   ```

   Or `POST` the same URL with header `Authorization: Bearer $CRON_SECRET` and body `{"dryRun":true}`.

6. Live migrate:

   ```bash
   curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     -H "Content-Type: application/json" \
     https://www.peopleblockchain.network/api/cron/wallet-vault-rotate
   ```

7. Dry-run again. `counts["3"]` must equal `counts.total`. `failed` must be 0. `counts["1"]` and `counts["2"]` must be 0.

   Users who sign in during this window are migrated lazily on wrap-key as well; bulk migrate is how the rest are finished without waiting for login.

8. If any row stays behind (`failed` > 0): **stop**. Do not remove rotation env. Wrong previous/next secret never overwrites ciphertext; fix the env value and re-run dry-run then migrate.

## After every row is v3

9. **Mode A:** delete `PEOPLE_WALLET_VAULT_SECRET_PREVIOUS`. Leave `PEOPLE_WALLET_VAULT_SECRET` as the new value.

   **Mode B:** edit `PEOPLE_WALLET_VAULT_SECRET` to the **new** secret you stored in step 1, then delete `PEOPLE_WALLET_VAULT_SECRET_NEXT`.

10. Redeploy so runtime env matches. Dry-run should still show all v3 (`currentVersion` goes back to 2 because rotation env is gone; v3 rows are left as-is and unwrap with the current secret).

11. Confirm a known cloud-wallet login still opens.

## Do not

- Do not overwrite `PEOPLE_WALLET_VAULT_SECRET` with a new value **without** PREVIOUS or NEXT already in place. That makes every v2 row undecryptable.
- Do not remove PREVIOUS/NEXT before counts are all v3.
- Do not set `PEOPLE_WALLET_VAULT_SECRET` from `AUTH_SECRET`. There is no runtime fallback; `AUTH_SECRET` only unwraps v1.
- Do not run migrate against the production database from a local `DATABASE_URL`.
