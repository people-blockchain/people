# Sell-back cosigner

A sell-back pays USDC on Base against a `MainnetReturn` attestation, a signed statement that the
seller handed the PPL in on the PEOPLE network. Until 2026-11-01 one server signed it. If that
server or its key were compromised, verified holders could sell their own lots back without
handing in PPL. The hub's caps limited the damage, but nothing stopped it until the Safe paused
the hub.

Since the audit of 2026-11-01 the hub has a second signer, `returnCosigner`:

- Once `returnCosigner` is set, `sellBack` needs both signatures: the verifier's 65 bytes followed
  by the cosigner's 65 bytes (130 bytes). One server alone cannot produce a valid attestation.
- On Base mainnet (chain id 8453), `sellBack` reverts with `CosignerRequired` until a cosigner is
  set.
- The cosigner is set with `queueSetReturnCosigner` and then `executeSetReturnCosigner`, behind the
  same 48-hour timelock as the verifier. It must differ from `returnVerifier`.

## How a sell-back is signed

1. The site route `/api/sale/return-attestation` checks the `ReturnBurned` receipt on PEOPLE and
   signs with the verifier key (AWS KMS).
2. It then calls the cosigner server at `SALE_RETURN_COSIGNER_URL`, sending
   `SALE_RETURN_COSIGNER_TOKEN` as a bearer token. The request carries `{txHash, returnId, deadline}`.
3. The cosigner re-checks the same receipt through its own PEOPLE RPC. It confirms its key is the
   hub's on-chain `returnCosigner`, signs the same digest with the same deadline, and returns the
   signature.
4. The route checks that the cosigner's signature recovers to the on-chain `returnCosigner`. It
   then returns both signatures. If any step fails, the route returns no signature at all.

## Brake and alerts

The cosigner keeps a rolling one-hour total of the PPL it has cosigned:

- Above `COSIGNER_WARN_PPL_PER_HOUR` it sends a Telegram alert to the signers' chat. It sends at
  most one alert per 15 minutes.
- Above `COSIGNER_MAX_PPL_PER_HOUR` it refuses to sign and sends an alert telling the signers to
  pause the hub from the Safe if this is an attack.

The total is held in memory, so a restart resets it to zero: after a restart, up to one more
hour's limit can pass. Alerts still fire as before. Set the limit to about
what 2% of the reserve buys at the current price. That way the brake trips before the hub's own
daily cap is reached.

## Running it

The cosigner must run separately from the site, ideally at another provider (for example Railway,
Fly.io or Google Cloud Run while the site is on Vercel). Give it its own key, ideally in a
different cloud account.

```
cd website
node --import ./scripts/register-ts-paths.mjs --experimental-strip-types scripts/return-cosigner.ts
```

| Env | Meaning |
|---|---|
| `PORT` | HTTP port (default 8787). Endpoints: `POST /cosign`, `GET /health` |
| `COSIGNER_TOKEN` | Shared secret, at least 32 characters. Must equal `SALE_RETURN_COSIGNER_TOKEN` on the site |
| `HUB_ADDRESS`, `HUB_CHAIN_ID`, `HUB_RPC_URL` | The Base hub and the cosigner's own Base RPC |
| `RETURN_BURN_ADDRESS`, `PEOPLE_RPC_URL` | `PplReturnBurn` and the cosigner's own PEOPLE **mainnet** RPC (chain 97400). The cosigner refuses to start on any other chain, including the testnet 97401 |
| `SALE_RETURN_COSIGNER_MODE=kms`, `SALE_RETURN_COSIGNER_KMS_KEY_ID` | Production key in AWS KMS (secp256k1). The key never leaves KMS |
| `SALE_RETURN_COSIGNER_LOCAL_KEY` | Base Sepolia only. Refused on any other chain |
| `COSIGNER_WARN_PPL_PER_HOUR`, `COSIGNER_MAX_PPL_PER_HOUR` | Brake levels in whole PPL |
| `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` | Where alerts go (the signers' chat) |

On the site (Vercel) set `PEOPLE_MAINNET_RPC_URL` (the PEOPLE mainnet RPC, chain 97400; the route refuses to sign if that RPC answers any other chain id) and `SALE_RETURN_COSIGNER_URL` (for example `https://cosigner.example/cosign`)
and `SALE_RETURN_COSIGNER_TOKEN`.

Before mainnet:

1. Create the KMS key and deploy the cosigner.
2. From the Safe, queue `queueSetReturnCosigner(<KMS key address>)`.
3. After 48 hours, execute it.
4. Test a small sell-back end to end.
