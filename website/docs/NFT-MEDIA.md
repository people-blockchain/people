# NFT images, SVG and video on `/create/nft`

The mint form accepts an image (PNG, JPEG, WebP, SVG) or a video (MP4, WebM) with a required cover. Everything is stored permanently on IPFS **before** the wallet is asked to sign, and the token URI points at a JSON file, never at inline data.

## Formats and limits

| Object | Rule |
|---|---|
| Image / cover | PNG, JPEG or WebP up to 1,500,000 bytes (under PeopleScan's 2,000,000 cap) |
| SVG | up to 262,144 bytes in; rebuilt through an allowlist; the sanitized result (also at most 262,144 bytes) is what is pinned |
| Video | `video/mp4` or `video/webm`, up to 20,000,000 bytes. MP4 needs an `ftyp` box with a brand in `isom, iso2..iso9, mp41, mp42, avc1, dash, M4V `; WebM needs the EBML header and the `webm` doctype. QuickTime (`qt  `) is refused |
| Metadata JSON | `{name, description, image}` plus `animation_url` for video; at most 262,144 bytes; name 2 to 200 characters, description up to 8000 |

The limits live in `src/lib/nft-media-rules.ts` and match PeopleScan (`server/nft-media.ts`, `nft-svg.ts`, `nft-video.ts`). `src/lib/nft-svg-sanitize.ts` is a port of PeopleScan `server/nft-svg.ts` (same tags, attributes, limits and error cases, `saxes` 6.0.0); `scripts/nft-svg-sanitize.test.mjs` checks the parity cases. It additionally requires the output to be a fixed point, so PeopleScan renders exactly the bytes that were pinned.

## Flow

1. `POST /api/factory/nft/image` (multipart `file`): the declared type must agree with the file's real bytes. SVG is sanitized and only the sanitized bytes are pinned as `image.svg` in a wrapped directory (`ipfs://<dir>/image.svg`). The response includes the sanitized SVG so the preview shows the stored copy through `<img>`; the raw upload is never returned or inlined into HTML.
2. Video: `POST /api/factory/nft/video/sign` returns a short-lived signed upload URL scoped to the MIME type and 20,000,000 bytes, the browser uploads straight to storage (a serverless function body cannot carry 20 MB), then `POST /api/factory/nft/video/verify` checks the stored record (size, type) and the first 4096 bytes with the same container rules as PeopleScan. A rejected file is deleted. The result is `animation_url = ipfs://<cid>`.
3. `POST /api/factory/nft/metadata` rebuilds the JSON on the server from validated fields and pins it as `metadata.json`; `tokenUri = ipfs://<dir>/metadata.json`. `blob:`, `data:`, `http:` and unsafe `ipfs://` paths are refused.
4. Only then the "Create NFT" button is enabled. The transaction flow is the existing one (stablecoin approve and `payLaunchFee` when chosen, `createCollection` for a single item, then `mint` with `value = NftFactory.mintFee()`).

The `ipfs://<dir>/metadata.json` and `image.svg` paths carry an extension on purpose: PeopleScan takes the media type from the gateway's `Content-Type`, and a bare CID of a JSON or SVG file can be served as `text/plain`.

`/api/ipfs/[cid]` still refuses SVG and HTML (audit M20-1); nothing here changes it.

## Double mint protection

- An in-flight lock and a disabled button stop double taps.
- `src/lib/nft-mint-draft.ts` keeps a draft in `localStorage` (per wallet address). Every transaction hash is written **before** its receipt is awaited. A draft with a mint hash can only wait for that receipt, a known collection skips `createCollection`, a known payment hash is awaited instead of paying again.
- After a mint write was started, a retry first calls `findExistingMint`: if the collection's newest token has this token URI and is owned by the signer, the existing token is shown instead of minting again.
- For stablecoin payment, `prepaidCredit(signer)` is read first and payment is skipped when the credit already covers the fee.
- Uploads are idempotent (same bytes, same address).

## Environment

- `PINATA_JWT` (exists; must be set in Vercel Production). For MP4/WebM it needs the Pinata v3 Files scopes: create signed upload URLs, read file, delete file, plus legacy `pinFileToIPFS`. Without it the form says storage is unavailable and nothing is minted. With a legacy-only key, images and SVG work and video reports "video storage unavailable".
- `IPFS_GATEWAY_URL` (optional): dedicated gateway if the public one refuses ranged reads during video verification.
- `DATABASE_URL` (existing): durable rate limits. Without it the in-process limiter is used.
- No other new variable.

## Abuse limits

Per client: 20 image uploads / 10 min, 6 video signatures / hour, 12 video verifications / hour, 30 metadata saves / 10 min; 200 video signatures per UTC day across all clients. No sign-in is required (the page has none); add Turnstile if abuse shows up.

## Tests and evidence

`scripts/nft-svg-sanitize.test.mjs`, `nft-media-rules.test.mjs`, `nft-pinata-client.test.mjs`, `nft-upload-routes.test.mjs`, `nft-mint-draft.test.mjs`, `evm-nft-factory.test.mjs`; browser flow and screenshots with `playwright.nft-media-screenshots.config.mjs` (mocked wallet and storage; not a live mint). Evidence: `docs/screenshots/nft-media/`.
