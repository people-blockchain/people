# Consensus Upgrade #1 (owner-approved small items)

Status: APPROVED by owner, implemented behind a single coordinated activation height,
`NetworkConfig.consensusUpgrade1.height`, set via `CONSENSUS_UPGRADE_1_HEIGHT`
(`people-node/packages/core/src/consensus-upgrade-1.ts`). Omitted on legacy networks — not part
of genesis identity, same pattern as `securityUpgrade`. A node with no `consensusUpgrade1`
configured, or at a height below it, keeps every pre-upgrade behaviour byte-for-byte so historical
blocks replay unchanged. All items below take effect at the same height; there is no per-item
sub-height.

Source: `docs/audit-remaining-small.md` items marked "skipped: needs decision" that the owner has
now signed off on. Each item's finding text, PoC and exact file/line references live there; this
file only records what the owner approved and how it is gated. M12-6 (the `evm.ts` per-call state
clone performance item) is explicitly **out of scope** — deferred, not a consensus change.

## Items

| Item | Rule | Gate |
| --- | --- | --- |
| B10 | Stake, epoch rewards and slashes are atom-exact (six decimal places, 1 PPL = 1,000,000 atoms) end-to-end, matching the bound `pplToAtoms` already puts on transfers (M04-4). `joinValidator` rejects a stake that is not atom-exact. Epoch rewards and referral cuts are floored in atoms per validator; the float remainder from the weighted split is given to the highest-weighted active validator, deterministically — never fractional dust. Slashing rounds the (possibly pre-upgrade, non-atom) stake to the nearest atom, then floors the slashed amount and the reporter's cut in atoms | `consensusUpgrade1Active` |
| M01-1 / M03-5 | `from`, `publicKey` and `signature` must be the canonical lowercase hex form. `isCanonicalAddressMatch` still tolerates mixed case for signature verification (so a signed tx is not rejected for the wrong reason), but the dedicated gate runs first, in both `enqueueTransaction` and `applyTransaction`, and throws a specific error before any case-sensitive state lookup. This removes the historical ability to create two account/validator records that differ only by case | `consensusUpgrade1Active` |
| M10-2 | `updateFinality` and `countAttestationQuorumHeights` weight each recorded attestation vote by the voter's **current** active stake, not the stake frozen at vote-cast time. A validator that has since left, unstaked or been slashed contributes zero weight to quorum, even though its vote record is still in `state.attestationVotes` | `consensusUpgrade1Active` |
| M10-4 | `leaveValidator` additionally accepts a validator whose `status === "slashed"` once `state.epoch >= jailUntilEpoch`, even if the remaining stake is below `minStake` (the only prior escape, `activateValidators`, requires stake back above `minStake` to un-jail). Leaving clears `jailUntilEpoch` and moves to `unbonding`; the remainder still needs a normal `unstake` after the unbonding period | `consensusUpgrade1Active` |
| M12-3 | A contract (`contractDeploy`/`contractCall`) fee is almost never a whole-PPL safe integer (gas price `8.7e-7` PPL/gas), so the pre-upgrade `Number.isSafeInteger(tx.fee)` gate in `applyTransactionUnchecked` skipped `routeEligibleTxFee` for nearly every contract fee. This was *worse* than "falls back to the legacy bucket": `txFeeUsesLiveModelA` (used elsewhere to decide whether to add the fee to `pendingValidatorFees`) already used a `Number.isFinite` check and treated the fee as Model-A-handled, so the fee was credited nowhere — debited from the sender, never credited to validators/community pool/treasury/liquidity/growth pool. Behind the upgrade, the crediting gate uses the same `Number.isFinite(tx.fee) && tx.fee > 0` check, so the fee is actually routed through the live Model A split (30/25/20/10/15/0), same as every other eligible fee | `consensusUpgrade1Active` |
| M12-4 | `hydrateState` (`evm.ts`) loads a contract address's EVM nonce from `state.contracts[addr].nonce` instead of always from `state.accounts[addr].nonce` (which is never written for a contract and stays 0 forever). This lets a factory `CREATE` more than one child: before the upgrade, every `CREATE` from the same contract computed the same child address (collision, silently a no-op on the second and later calls); after, each call correctly derives a distinct address. Threaded through `ExecutionEnv.consensusUpgrade1`, set by `buildBlockDraft`/`tryApplyRemoteBlockDraft` at the block height being built/applied | `consensusUpgrade1Active` via `ExecutionEnv.consensusUpgrade1` |
| M12-7 | `isAllowedImageUri` restricts a new NFT mint's `imageUri` to `https://` or `ipfs://`. `http://`, `data:`, `blob:` and `sha256:` are no longer accepted for new mints — `blob:` in particular is meaningless once persisted off the browser that created it. An NFT minted before the upgrade keeps rendering under the old, wider rule; this only changes what a *new* mint will accept | `consensusUpgrade1Active` |
| M13-5 part 3 | `closeGrowthEpochIfBoundary` (called from `finalizeBlockState` at every Growth Epoch boundary) catches an error thrown by `settleGrowthEpoch` instead of letting it reject the whole block. `settleGrowthEpoch` only mutates state after all of its own invariant checks pass, so a caught error leaves state exactly as it was before the call — this is safe to catch without partial writes. The failure (epoch, height, message) is appended to `ChainState.growthSettlementFailures` (capped at 20 entries) for operator visibility; that field is excluded from `computeStateRoot`, so it carries no consensus weight. Before the upgrade, the same error still rejects the block (unchanged legacy behaviour) | `consensusUpgrade1Active` |
| M10-6 | Informational notes folded into the items above where applicable (proposer seed and dead slashing branch are unrelated pre-existing observations, out of scope here; the "fee-bearing attestations" and "unaccounted burned stake" notes are about *future* economics, not this batch; "faucet key reuse for slashEvidence" is a devnet-only operational note, not a consensus change) — no code change beyond what M10-2/M10-4 already cover | n/a |

## Why one shared height, not per-item heights

Every item above is a narrow, independently-reviewable fix, but bundling them behind one
`consensusUpgrade1.height` avoids shipping multiple coordinated-upgrade heights in quick
succession (each one needs every validator upgraded and restarted at the same height; the
operational cost is per *upgrade*, not per *item*). None of the items depend on each other's
state, so a node that has upgraded code but has not yet reached the height keeps producing
byte-identical blocks to a node still on the old code.

## Non-goals of this upgrade

- **M12-6** (lazy per-account EVM state access) is a performance redesign that must still produce
  byte-identical state roots on revert; it needs its own benchmarked design, not a drive-by change
  bundled with this batch.
- This upgrade does not touch `securityUpgrade` (the separate, already-shipped coordinated fork) or
  any of the owner-decision items in `docs/audit-remaining-small.md` that remain unresolved after
  this pass (M07-4/M07-5, M08-4/M08-5/M08-6, M11-4/M11-5, etc.) — those still need their own
  decisions and are untouched here.

## Rollout

Operators set `CONSENSUS_UPGRADE_1_HEIGHT` to the agreed height on every validator ahead of time,
the same way `SECURITY_UPGRADE_HEIGHT`/`securityUpgrade` was rolled out. A network with the env var
unset never activates the upgrade and keeps exactly the pre-upgrade behaviour described above for
every item.
