# People Connect: handoff to the website owner

The website owner / their agent performs the production release. The mobile agents prepared and tested the implementation; they have not changed production, merged main, applied production SQL or enabled the gateway.

## Review and code

- PR: https://github.com/people-blockchain/people/pull/13. Use the latest reviewed head, not an earlier SHA from chat.
- Contract: [PEOPLE-CONNECT-V1.md](PEOPLE-CONNECT-V1.md). The gateway supports account proof, `personal_sign`, rejection and disconnect only. Existing external-wallet WalletConnect remains available. Gateway transactions are unsupported.
- Resolve review findings and run `npm run build`, `npm run lint`, `npm run typecheck` from `website/` before each push. CI uses conventional dependencies in the repository.
- New gateway/browser offline tests are part of standard `npm test`; the real PostgreSQL integration test is separately opted in against a disposable private cluster. Keep `scripts/no-live-rpc.mjs` enabled. Do not run `test:live` or use the public node/proxy from ordinary tests.
- The initial PR CI job did not start: GitHub reported failed account payments or an insufficient spending limit. This is not a passing check. The repository owner must resolve the account issue and rerun CI; do not disable required checks or force a merge.

## Production database preflight

Use the existing site's approved secret manager / database interface. Do not print or send `DATABASE_URL`, tokens or wallet secrets in chat, logs or command arguments.

1. Confirm the database belongs to the existing production Vercel project. Do not create or repoint a different application database.
2. Confirm the existing `api_rate_limit` table has the schema from `website/src/db/schema.ts`: `"bucketKey"`, `"count"`, `"expiresAt"`. The gateway rate limiter uses this existing table without invoking runtime schema bootstrap.
3. Review and apply **only** `website/drizzle/people-connect-review.sql` using the approved migration interface. It creates `mobile_wallet_session` (`id` text primary key, `data` JSONB, `expires_at` timestamptz) and an expiry index. Check an existing table's shape before proceeding; `IF NOT EXISTS` does not verify compatibility.
4. Do not run the application's general `db:migrate` / bootstrap as a shortcut: they may apply unrelated changes. Do not drop, rewrite or migrate other tables.

## Website release

1. Follow the repository flow: branch/PR → review → approved merge to `main` → production deployment of that exact main SHA. Preserve `website/vercel.json`: arbitrary branch previews stay disabled.
2. Use the existing Vercel project serving **https://www.peopleblockchain.network**, with root directory `website` and its existing production environment. Do not create a duplicate project or change DNS/hosting.
3. After the dedicated schema is ready, enable `PEOPLE_CONNECT_ENABLED=1` in the production server environment and deploy the approved main SHA. `DATABASE_URL` must already point to the verified database. `PEOPLE_CONNECT_DEVELOPMENT` is for localhost only and must not be used for production.
4. Production has no in-memory fallback. Missing storage/schema or a disabled feature fails closed. The gateway does not contact the blockchain RPC, hold wallet keys or relay transactions. Do not change validators, VPS configuration, consensus, pruning or economics for this feature.

## Public acceptance

- Verify `/connect/mobile` renders. An unsupported `GET /api/mobile-wallet` returns 405; a browser `POST create` uses the exact production Origin. Never print the returned capabilities or pairing link.
- Use only newly created dedicated, unfunded test wallets. Never unlock/import/sign with an owner's primary wallet for acceptance. Ordinary automated checks stay offline.
- The browser-role coordinator is the native-app acceptance coordinator (kept in the mobile app repo). It needs `PEOPLE_CONNECT_ACCEPTANCE=97401` **and** `PEOPLE_CONNECT_PUBLIC_ACCEPTANCE=97401` to select the exact production origin. Without the public flag it uses only `http://127.0.0.1:18080`; arbitrary origin environment variables are unsupported.
- Provide an absolute installed `PEOPLE_CONNECT_NODE_MODULES` directory and a fresh absolute `PEOPLE_CONNECT_STATE_DIR`. Keep the state directory 0700 and one-time URI 0600; copy/stage atomically without putting the URI or keys in arguments/logs. Create the pair after the native client is ready; pair/request TTL remain 120 seconds.
- Verify visible account/message consent and native authentication, independently recover the first signature against the exact message/account, reject the second request with 4001, then disconnect on the phone. Require both native success and coordinator `phase: passed`. Preserve only public address/message/signature/recovered address/call counts as evidence.
- Coordinate Android/iOS native runs on a constrained host; only one emulator/simulator at a time, with compilers stopped. Physical-device authentication, camera and signed App/Universal Link association remain separate checks; never invent Apple team or distribution certificate identities.

## Rollback

Disable `PEOPLE_CONNECT_ENABLED` and redeploy the approved site configuration if needed. Keep wallet data and the new table intact; do not roll back by dropping tables or changing the blockchain. Record the deployment SHA, flags (without secrets), result and any failed acceptance step accurately.
