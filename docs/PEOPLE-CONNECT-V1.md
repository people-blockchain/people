# PEOPLE Connect v1 — first-party contract

Owner-approved scope (2026-10-18): connect only the PEOPLE website to native Android/iOS, explicit account approval, message signing and disconnect. No transactions, key transport, third-party dapps or protocol/economic changes. Website backend owns this shared wire contract. This is an implementation contract, not a deployed-service claim.

## Transport and roles

Production API: `POST https://www.peopleblockchain.network/api/mobile-wallet` with `Content-Type: application/json`, bounded JSON, no tokens in query/path/logs. Version field is integer `1`; chain is integer `97401`. Only exact HTTPS origin `https://www.peopleblockchain.network` is accepted. For separate explicit native acceptance builds only, the exact origin `http://127.0.0.1:18080` may be used. Ordinary app/release rejects loopback and every other origin.

QR/link: `https://www.peopleblockchain.network/connect/mobile#id=<32 lowercase hex>&token=<64 lowercase hex>`. Fragment is not sent to HTTP servers. Native clients accept only this exact scheme/host/path, no user info/custom port/query/extra fragment keys. An explicit paste-link path is required while verified App/Universal Links await distribution identities. Never put wallet keys or browser capabilities in the link. Never fetch an arbitrary URL from scanned input.

Browser and phone capabilities are independent random 32-byte hex values. Server persists hashes only. Browser capability remains browser-memory-only; phone capability remains app-memory-only. Losing app/browser state ends local use; server session expires within 15 minutes. Pending pairing and each request expire within 120 seconds. Native clients never poll while locked/backgrounded and never sign automatically. Initial connection and every message require visible approval and fresh wallet authentication. Background/lock cancels local review; a response must revalidate the same session/request/expiry after authentication.

All responses use `Cache-Control: no-store`; no permissive CORS. Browser actions require the exact first-party Origin header; native actions use their capability. Every error is `{ "error": "stable_code" }` with non-2xx HTTP status; no secrets, raw exceptions or bodies logged. Unknown fields/actions/versions are rejected. No network retries for writes; read status after uncertain writes. No auto reconnect/replay.

## API requests

Every body includes `version:1` and `action` below. Hex IDs/capabilities have the lengths above. ISO timestamps are UTC RFC3339; clients validate them, compare with local time and reject expired values. Addresses are nonzero EIP-55 validated, normalized checksum form. Signatures are 65-byte `0x` hex EIP-191 (no custom crypto).

1. Browser `create`: no other fields. Returns `{id,browserToken,link,expiresAt}`.
2. Phone `challenge`: `{id,pairToken,address}`. Returns `{id,origin,chainId:97401,address,message,nonce,issuedAt,expiresAt}`. `message` is canonical SIWE/ERC-4361: first-party domain, that address, fixed statement `Connect People Wallet to the PEOPLE website. No transactions are authorized.`, URI `<origin>/connect/mobile`, version 1, chain 97401, server nonce, issued-at and expiration-time. Client verifies every field/statement, then shows the message and domain before authenticating.
3. Phone `connect`: `{id,pairToken,address,message,signature,phoneToken}`. Phone generates a fresh independent random capability **before** submission. Server reconstructs the exact SIWE message, verifies signature/account, then atomically consumes the pairing and establishes one session. Returns `{session}`. After an uncertain response, phone may `poll` with its pre-generated token; never sign/connect again automatically.
4. Browser `status`: `{id,browserToken}`. Returns `{state,session?,request?}`. Session shape below. Pending pairing exposes no phone capability.
5. Browser `request`: `{id,browserToken,message}`. Message is nonempty UTF-8, at most 8192 bytes, no Unicode Cc/Cf characters except LF/TAB, no unpaired surrogates. One pending request per session; resolved/expired request can be replaced. Returns `{request}`.
6. Phone `poll`: `{id,phoneToken}`. Returns `{state,session?,request?}`. Foreground-only, at most one call per 5s, bounded by session expiry; no concurrent poll loops.
7. Phone `respond`: `{id,phoneToken,requestId,decision:"approve",signature}` or `{id,phoneToken,requestId,decision:"reject"}`. Server verifies the current exact request, expiry, account and signature, then consumes it atomically. Returns `{request}`. No approval without valid signature. Rejection becomes code 4001. An expired/replaced/consumed/disconnected request cannot be answered again.
8. Either party `disconnect`: `{id,role:"browser",token:<browserToken>}` or `{id,role:"phone",token:<phoneToken>}`. Atomically invalidates session/pending requests. Returns `{state:"disconnected"}`. No on-chain permissions are changed.

`state`: `pending | connected | disconnected | expired`.

`session`: `{id,origin,chainId:97401,address,expiresAt,methods:["personal_sign"]}`. Clients never expand methods or chain from data.

`request`: `{id,method:"personal_sign",message,expiresAt,status:"pending|approved|rejected|expired",signature?,code?}`. `id` here is the **request ID**, distinct from session ID. Approved requests contain signature, rejected contain 4001, expired contain 4080. Only an approved matching signature is success. Browser independently recovers the signer against the exact requested message/account.

## Storage and validation

Use durable shared storage and atomic compare-and-swap for pairing, response and disconnect. No module Map pretending to survive serverless/cold starts. No deployment or DB migration is authorized by this contract. A dedicated JSONB mobile_wallet_session table stores protocol state; compare-and-swap matches the complete old JSONB value. Auth.js verification tokens are not reused: their token column is part of a B-tree primary key and cannot safely store arbitrary 8192-byte messages. A separate SQL migration is a review artifact only, never automatic bootstrap. Production additionally requires PEOPLE_CONNECT_ENABLED=1 after owner-approved migration/release. Missing/unavailable durable storage returns 503. A deterministic in-memory repository is for offline tests/local integration only and must be explicitly enabled outside production.

Acceptance must prove real HTTP server↔native client request/response, approved signature independently recovered, rejection, disconnect, expiration/replay/role-token separation and fresh actual-node chain/balance reads. Automatic tests remain offline; separately opted-in native acceptance uses only fresh dedicated wallets and bounded official testnet reads. Do not claim the public site works until the server/page is reviewed and deployed through the repository's approved flow.

## Exact connection message

The following is an exact template with LF separators and **no trailing LF**, explicit URI scheme in the first line. `origin` is the exact approved origin, without trailing slash. `address` is canonical EIP-55. `nonce` is 32 lowercase hex characters (16 cryptographically random bytes), no 0x. `issuedAt` and `expiresAt` use `Date.toISOString()` format (`YYYY-MM-DDTHH:mm:ss.SSSZ`); expiry is exactly issuedAt+120000ms. Client allows issuedAt at most 30s in the future, requires now<expiresAt and issuedAt>=now−120s; does not extend expiry for skew.

```text
${origin} wants you to sign in with your Ethereum account:
${address}

Connect People Wallet to the PEOPLE website. No transactions are authorized.

URI: ${origin}/connect/mobile
Version: 1
Chain ID: 97401
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expiresAt}
```

Clients reconstruct this string from the validated challenge fields and require byte equality. No custom-scheme URL is introduced in v1; Android supports pasted links and HTTPS intents; iOS additionally provides in-app QR scanning and user-activity handling. Verified Android App Links / iOS Universal Links remain dependent on the owner's actual distribution certificate/team IDs and matching website association files; do not invent these identities.

For a human comparison, browser and phone display the first 8 hexadecimal characters of the public session id in uppercase before approval. This is a public connection code, never a capability or a substitute for origin/account/message validation.

## Verification gates

Ordinary offline checks use the existing no-live-rpc guard. Server/crypto tests are in `website/scripts/mobile-wallet-gateway.test.mjs`; provider lifecycle/signature tests are in `mobile-wallet-browser.test.mjs`. An explicit PostgreSQL integration test, `mobile-wallet-postgres.test.mjs`, is skipped unless PEOPLE_CONNECT_PG_TEST=1. It requires DATABASE_URL exactly `postgres:///people_connect_test`, PGUSER/PGUSERNAME `people_connect_test`, PGPORT 19483 and a fresh private socket directory matching `/private/tmp/people-connect-pg-*`. Initialize a separate disposable cluster and database first; never point this test at an existing application database. It exercises the actual adapter and review SQL, including a large JSONB message, competing claims and durable rate limits, and asserts that unrelated bootstrap tables are absent.

Native acceptance is a separate owner-authorized, bounded testnet path using fresh dedicated wallets. Record simulator/instrumentation results and the independent browser coordinator result separately from compilation. Production feature enablement, migration and publication remain a later explicit review/release decision.
