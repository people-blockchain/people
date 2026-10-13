# Explorer token details

Implemented in the website: `/explorer/token/[assetId]`. Token names in the token
list and address balances link to this route.

The page reads existing node APIs: asset metadata, wallet accounts and the token's
creation block. `AssetMetadata.createdAt` is a **block height**, not a timestamp.
For a block outside the node's HTTP window, a server route reads one block from the
configured node's own advertised archival gossip endpoint. It checks the chain ID,
requested height, payload size and a five-second WebSocket deadline. Only
same-host peers advertised by that node are eligible. No transactions are submitted.
An unavailable archive is displayed as an unavailable date, never an estimated date.
Successful dates are cached with the genesis hash and height; the local cache is
bounded to 500 entries.

Holder counts include only accounts with a positive balance of that asset.
Native PPL is already stored in PPL; user assets use integer base units and their
registered decimals. The chart covers wallet balances, with the top five wallets
and the remaining wallets grouped. The table also shows percentages of total
supply. Protocol reserves, vesting and pools are not fabricated as wallet addresses.
The wallet request is bounded to 10,001 accounts. If truncated to 10,000, the UI
explicitly labels counts and charts as partial. This is a fetched view, not a
block-pinned atomic snapshot across all requests; it can be refreshed manually.

Explorer data loading uses the existing People logo with pulse/orbit CSS animation,
an accessible status label and reduced-motion support. Errors and empty results
are separate from loading states. New detail copy is provided in Russian and
English; other selected languages currently use English for the new detail labels.

Validation: `npm run test:token-explorer`, `npm run test:explorer-live`,
`npm run test:wallet`, `npm run typecheck`, and `npm run build -- --webpack`
from `website/`.
