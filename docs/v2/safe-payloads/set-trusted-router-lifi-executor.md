# Safe payload: trust the LI.FI Executor on PplCurveHubV2 (Base)

**Prepared only. Not proposed, not signed, not sent.** Every step needs the owner's explicit
approval.

- Chain: Base mainnet (8453).
- `to`: **`<PPL_V2_HUB_BASE>`**. The mainnet PplCurveHubV2 address is not in the repo yet. Use
  the value of `NEXT_PUBLIC_PPL_V2_HUB_ADDRESS` once the hub is deployed.
- From: the hub `owner` (the v2 owner Safe). `value = 0`, `operation = 0` (CALL).
- **Hub redeploy:** the `verifyFor` / `verifyAndBuy` change (`../LIFI-ONE-TX.md` §3) needs a
  new hub deployment because the hub is not upgradeable. Run this payload against that new hub
  only. The calldata below does not depend on the hub address and is unchanged.
- Router: LI.FI `Executor` `0x4DaC9d1769b9b304cb04741DCDEb2FC14aBdF110` (see `../LIFI-ONE-TX.md` §2).

## Step 1: queue (starts the 48 h `ADMIN_TIMELOCK`)

`queueSetTrustedRouter(address router, bool trusted)` with
`(0x4DaC9d1769b9b304cb04741DCDEb2FC14aBdF110, true)`.

```
data = 0xa9b0b5f00000000000000000000000004dac9d1769b9b304cb04741dcdeb2fc14abdf1100000000000000000000000000000000000000000000000000000000000000001
```

Reverts with `KindAlreadyQueued` if another `setTrustedRouter` operation is still pending.

Read the operation id from the `Queued(bytes32 indexed id, bytes params, uint256 eta)` log of this
transaction (topic0 `0xb3714bd80e9f4fb0e0eb22d44d935765775efe455fa7c7e5615b5514a802f094`;
`id` = topic1). The id is
`keccak256(abi.encode(keccak256("setTrustedRouter"), router, 1, _adminNonce))`, and
`_adminNonce` is private and counts every earlier queued admin operation. So always take the id
from the log; do not precompute it. For reference only, if this were the very first admin
operation (nonce 0), the id would be
`0x11a7cea8f4f3d3639053c60d835f7ee33e9ab46f45ffd27a0c46dca6b4b60b2f`.

## Step 2: execute (no earlier than `eta`, within `GRACE_PERIOD`)

`executeSetTrustedRouter(bytes32 id)`, selector `0xadd04e0a`:

```
data = 0xadd04e0a<id from the Queued log, 32 bytes, no 0x>
```

Check afterwards (read-only):
`trustedRouter(0x4DaC9d1769b9b304cb04741DCDEb2FC14aBdF110)` → `true`.

```
eth_call data = 0x687e2c170000000000000000000000004dac9d1769b9b304cb04741dcdeb2fc14abdf110
```

## Rollback

- Before execution: `cancel(bytes32 id)`, selector `0xc4d252f5`.
- After execution, immediate with no timelock: `queueSetTrustedRouter(Executor, false)`:

```
data = 0xa9b0b5f00000000000000000000000004dac9d1769b9b304cb04741dcdeb2fc14abdf1100000000000000000000000000000000000000000000000000000000000000000
```

## Safe Transaction Builder JSON (step 1)

Replace `<PPL_V2_HUB_BASE>` before importing.

```json
{
  "version": "1.0",
  "chainId": "8453",
  "meta": {
    "name": "PplCurveHubV2: queueSetTrustedRouter(LI.FI Executor, true)",
    "description": "Starts the 48h timelock. Execute with executeSetTrustedRouter(id from Queued log)."
  },
  "transactions": [
    {
      "to": "<PPL_V2_HUB_BASE>",
      "value": "0",
      "data": "0xa9b0b5f00000000000000000000000004dac9d1769b9b304cb04741dcdeb2fc14abdf1100000000000000000000000000000000000000000000000000000000000000001"
    }
  ]
}
```
