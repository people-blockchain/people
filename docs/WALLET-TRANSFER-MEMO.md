# Native PPL transfer memo

The embedded website wallet transmits the reviewed draft payload.memo as UTF-8 EVM transaction data. The 256 UTF-16 code-unit limit matches the existing textarea; malformed Unicode, binary controls, bidi overrides and blank-only notes are rejected before signing. Empty memo retains the plain-transfer request. Gas is estimated by viem with the actual data; no fixed 21,000 gas override is applied.

Memo is public on chain. It is not a protocol-level EVM memo field. Transaction detail and recent-feed adapters expose recognized textual input as payload.memo. PeopleScan renders the same UTF-8 input in its transaction summary. Neither application derives memo from ABI arguments or binary calldata.

Previously the website recorded payload.memo only in its browser-local pending journal and omitted it from sendTransaction. The reported hash 0x38b67894ce766f89c2c38b021fbec35b56c8e1bde919ae03567bf4ebfebc482e has empty EVM input and empty outer transaction memo. Its local note cannot be recovered from chain history. This patch does not rewrite old transfers or replace the existing wallet activity/history source.

Regression tests use a public test key and mocked JSON-RPC only: actual sendNativeTransfer signing, independent serialized-transaction decoding, estimateGas input, unchanged empty-memo request, Unicode bounds, rejected invalid text and confirmed detail decoding. The public-node test guard remains enabled.

## Validation (2026-10-28)

Direct Node commands passed: 40 memo/explorer/activity/locale/docs/roadmap tests; 64 existing wallet regressions (in-memory PGlite fixture, dummy localhost DATABASE_URL); TypeScript; ESLint; production Next.js build using webpack. The default local Turbopack build retained a missing optional native-package resolution after installing the platform binaries; no product build configuration was changed. Next.js emitted its existing security upgrade reminder; dependency versions remain those of the approved lockfile.

The existing wallet Playwright scenario now also intercepts the real signed EVM submission and independently decodes its memo, verifies the public-memo hint and checks all 12 locales at mobile width. It passed on the built localhost site with the public-node guards enabled. The Russian 390px send sheet was visually inspected. No test broadcast a transaction or contacted a public validator.
