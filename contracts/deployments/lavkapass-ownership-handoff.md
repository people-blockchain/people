# LavkaPass ownership handoff: old multisig -> main timelock

> WARNING: this document is a recipe only. Nothing described here has been executed, and no
> transaction has been sent. Every step must be performed and double-checked by the signers.

## 1. Context

- LavkaPass (testnet): `0x47723bc7d7bab2dd177698e2255d0ae5646e37d4` (`contracts/src/lavka/LavkaPass.sol`).
- Current owner: old `PeopleMultisig` `0x8e6abdc7225621770cad88345a72f20ed77e9d03` (`docs/TESTNET-GENESIS-V3.md:30`).
- Target owner: main timelock `0xcdba640215e4d8a7cb52c967bb516a71b30d1dce`.
- Why: a multisig owner executes owner-only actions immediately once 2-of-3 confirm. Owning the
  contract via the timelock adds a mandatory delay (visible, cancellable window) to every owner action.
- `LavkaPass` inherits OpenZeppelin `Ownable` (not `Ownable2Step`; confirmed from the imports in
  the source). Handoff is a single `transferOwnership(address)` call.

## 2. What the old multisig must do

Inner call (what the multisig will make):

- target = `0x47723bc7d7bab2dd177698e2255d0ae5646e37d4` (LavkaPass)
- value = `0`
- data = `transferOwnership(0xcdba640215e4d8a7cb52c967bb516a71b30d1dce)`

```
data = 0xf2fde38b000000000000000000000000cdba640215e4d8a7cb52c967bb516a71b30d1dce
```

(Selector `0xf2fde38b` + address left-padded to 32 bytes. Re-derive locally before use:
`cast calldata "transferOwnership(address)" 0xcdba640215e4d8a7cb52c967bb516a71b30d1dce`.)

PeopleMultisig API (`contracts/src/governance/PeopleMultisig.sol`; threshold = 2, all three
functions are `onlyOwner` of the multisig):

- `submit(address to, uint256 value, bytes data) returns (uint256 txId)` - also auto-confirms for the submitter.
- `confirm(uint256 txId)`
- `execute(uint256 txId)` - requires `confirmations >= threshold`; reverts `StaleConfirmations` if the
  signer set/threshold changed since submit.

Sequence:

1. Signer A calls `submit(0x47723bc7d7bab2dd177698e2255d0ae5646e37d4, 0, <data above>)`.
   Note the returned `txId` (read it from the `Submitted` event, or `transactionCount() - 1`).
   Calldata for the multisig call itself (run locally, send to the multisig `0x8e6abdc7...9d03`):
   ```
   cast calldata "submit(address,uint256,bytes)" 0x47723bc7d7bab2dd177698e2255d0ae5646e37d4 0 0xf2fde38b000000000000000000000000cdba640215e4d8a7cb52c967bb516a71b30d1dce
   ```
   Output (verified with `cast calldata`):
   ```
   0x14de327f00000000000000000000000047723bc7d7bab2dd177698e2255d0ae5646e37d4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000024f2fde38b000000000000000000000000cdba640215e4d8a7cb52c967bb516a71b30d1dce00000000000000000000000000000000000000000000000000000000
   ```
2. Signer B calls `confirm(txId)` -> 2-of-3 reached.
   `cast calldata "confirm(uint256)" <txId>`; for `txId = 0` (use the real id from step 1):
   ```
   0xba0179b50000000000000000000000000000000000000000000000000000000000000000
   ```
3. Any multisig owner calls `execute(txId)`.
   `cast calldata "execute(uint256)" <txId>`; for `txId = 0`:
   ```
   0xfe0d94c10000000000000000000000000000000000000000000000000000000000000000
   ```

## 3. Single-step ownership: irreversible

- `acceptOwnership()` is NOT needed. After `execute` succeeds, the timelock is the owner immediately.
- The transfer cannot be undone by the old multisig. If the address is wrong, ownership is lost
  (or is held by an address that cannot act). Verify `0xcdba640215e4d8a7cb52c967bb516a71b30d1dce`
  twice (against the deployment record and the timelock's own deployment tx) before `execute`,
  and confirm the timelock's proposer/executor roles can actually reach LavkaPass owner functions.
- From then on, owner actions go through the timelock: `schedule` -> wait `minDelay` -> `execute`.

### Reference only: Ownable2Step variant (not needed for LavkaPass)

If the contract were `Ownable2Step`, `transferOwnership` would only set `pendingOwner`, and the
timelock would have to schedule `acceptOwnership()`:

- inner data: `0x79ba5097` (`cast calldata "acceptOwnership()"`)
- `timelock.schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)`
  e.g. `schedule(<contract>, 0, 0x79ba5097, 0x00..00, <salt>, <delay >= minDelay>)`, then, after the
  delay, `execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt)`.
- worked example (zero predecessor/salt, delay 172800 = 2 days, verified with `cast calldata`):
  ```
  0x01d5062a00000000000000000000000047723bc7d7bab2dd177698e2255d0ae5646e37d4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a300000000000000000000000000000000000000000000000000000000000000000479ba509700000000000000000000000000000000000000000000000000000000
  ```

Not needed for LavkaPass.

## 4. Post-execution verification checklist

Read-only commands for the operator to run (not run by the author of this document):

- [ ] `cast call 0x47723bc7d7bab2dd177698e2255d0ae5646e37d4 "owner()(address)" --rpc-url <testnet-rpc>`
      returns `0xcdba640215e4d8a7cb52c967bb516a71b30d1dce`.
- [ ] The returned owner is not `0x8e6abdc7225621770cad88345a72f20ed77e9d03` (old multisig is no longer owner).
- [ ] The multisig transaction shows `executed = true` (`getTransaction(txId)`) and an `Executed` event.
- [ ] `OwnershipTransferred(previousOwner = old multisig, newOwner = timelock)` event is present in the execute tx.
- [ ] Update `docs/TESTNET-GENESIS-V3.md` with the new owner and the execute tx hash.
