# Token / NFT Factory — implementation report (draft PR #27)

Status: **draft** — internal testnet wiring only. Not Mainnet. Growth Model A unchanged.

## 8. Owner-approved PPL tariffs (2026-09-29)

Solana-aligned defaults in `@people/protocol` (`factory-fees.ts`), converted at `PPL_PRICE_USD=0.12` and SOL=$117 assumption:

| Tariff | PPL | Source |
| --- | ---: | --- |
| Ordinary transfer (`DEFAULT_TRANSFER_FEE`) | **0.004875** | 5,000 lamports (one signature) |
| Token create minimum (`TOKEN_CREATE_MIN_FEE`) | **1.045005** | SPL mint rent + one signature |
| NFT mint minimum (`NFT_MINT_MIN_FEE`) | **2.925** | Metaplex Core ~0.003 SOL |

Batch transfer (same scale as legacy 0.1 → 0.004875):

| Component | PPL |
| --- | ---: |
| `BATCH_FEE_BASE` | 0.004875 |
| `BATCH_FEE_PER_EXTRA` | 0.000244 |
| `BATCH_FEE_CAP` | 0.024375 |

Public site mirrors token/NFT figures via `website/src/lib/factory-fees.ts` and transfer via `DEFAULT_TRANSFER_FEE_PPL`. Wallet `/wallet` uses `DEFAULT_TRANSFER_FEE` from `network-client.ts`. Node `GET /chain/config` and metrics expose `suggestedFee` / `suggestedTransferFee` from core.

Non-integer `tx.fee` still bypasses Growth Pool / Model A integer path (unchanged). Growth L1=70 / L2=30, depth=2, pool 15%, Claim D, caps — **not modified** by this tariff change.
