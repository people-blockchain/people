# M11-2 — treasury/community/liquidity/growth withdrawal path (design note, not implemented)

**Update (2026-10-08): implemented.** The owner picked option (b) below (multisig sweep, not a
gov-gated spend module) plus the team/validator-pool vesting schedules and the related M11-4/
M11-5/M07-4/M07-5/M11-7/M10-5 items. See `docs/PROTOCOL-DECISIONS.md` ("Cosmos chain economics
(M11-2 and related)") for the recorded decision and
`chain/overrides/evmd/peoplefees/`, `chain/overrides/evmd/upgrades/`,
`chain/emission/allocation.json`, `contracts/src/governance/PeopleMultisig.sol` for the code.
The rest of this file is kept as the original design note / history of the finding.

**Finding:** `audit(M11)` (origin/claude-audit `AUDIT.md`), high, "до mainnet; решение владельца".
Still open on `main` as of 2026-10-07 — confirmed by reading
`chain/overrides/evmd/cmd/evmd/config/evmd_config.go` (`maccPerms`, `BlockedAddresses`) and
`chain/emission/allocation.json`.

## What's wrong

`people_treasury`, `people_liquidity`, `people_growth`, `people_team`, `people_sale` are plain
Cosmos SDK module accounts (`maccPerms` → `nil` permissions, no `Minter`/`Burner`). They are also
in `BlockedAddresses()`, so they cannot receive `MsgSend` either — only `peoplefees` (`feesplit.go`)
can credit them. There is no keeper, no governance message, and no CLI command anywhere in
`chain/overrides/` that can move funds *out* of these accounts. The `community` bucket is a
`ContinuousVestingAccount` at a hash-derived address with no known private key, so it is
unspendable by construction, not just unimplemented.

Net effect: ~65% of genesis supply (team 15 + treasury 15 + sale 10 + liquidity 5 + community 35,
minus whatever the validator pool represents) plus 70% of every transaction fee (treasury 20% +
liquidity 10% + growth 15% + community 25%, per `fee_split_bps` in `allocation.json`) accumulate
forever with no exit. The validator pool account (`people1yaf2…`) also has no code paying out its
periodic vesting tranches (60M/50M/50M/40M PPL in years 1-4) — validators currently only receive
the 30% live fee share from `peoplefees`, not the vesting schedule promised in `allocation.json`.

## Why this needs an owner decision, not a guess

Picking an implementation here is picking tokenomics and custody policy, not fixing a bug:

- **Treasury/liquidity/growth**: should each be (a) a Cosmos SDK module account gated by a new
  `x/gov`-only "spend from module" message (on-chain, auditable, slow), or (b) swept periodically
  to an off-chain multisig address via a one-time migration handler (faster, but moves funds
  outside consensus-enforced rules)? `RESET_TESTNET.md` and `allocation.json` both say "replace
  via governance" / "DAO multisig TBD" but neither is implemented, and the two approaches are not
  interchangeable from a security or audit standpoint.
- **Team/sale**: `allocation.json` already flags these `owner_placeholder: true` and says the
  owner must set a vesting controller — i.e. the founder has not yet chosen the vesting schedule
  (cliff, duration, revocability) to encode.
- **Validator pool payout**: needs a decision on whether the periodic vesting unlocks are paid as
  extra `peoplefees` share, a separate epoch-boundary mint-free transfer, or folded into the
  existing 30% live cut — each changes validator incentives differently and is a consensus-rule
  change requiring a coordinated upgrade (same class as `SECURITY_UPGRADE_HEIGHT` in
  `AUDIT-CRITICAL-FIXES.md`).

Any of these requires a new protocol-upgrade handler (module account permissions and the
`BlockedAddresses` allowlist are consensus-critical: `GetMaccPerms`/`BlockedAddresses` are read by
every node) and a written entry in `docs/PROTOCOL-DECISIONS.md` before code is written, per
`AGENTS.md` §4 (no consensus/economic rule change without recorded owner approval).

## Recommended next step (not applied)

1. Founder picks, per bucket: on-chain gov-gated module spend vs. multisig sweep, and — for
   team/sale — the vesting cliff/duration.
2. Record the decision in `docs/PROTOCOL-DECISIONS.md` (same table format as the Growth Pool
   entries), including the activation-height mechanics (reuse the
   `SECURITY_UPGRADE_HEIGHT`-style coordinated rollout already used for M10-1/M11-1).
3. Only then implement the keeper/message (or migration handler) and update
   `validate-emission-genesis.py` to check the new maccPerms/keeper wiring, closing the gap noted
   in M11-7.

No code changes were made for M11-2 in this pass — only this note.

## 2026-10-10 — team vesting schedule change (owner-approved, NOT yet on chain)

Public schedule is now: team 15% of supply, 0% at launch, 6-month cliff, then 18 months linear (24 months total) — website `src/lib/tokenomics.ts` + tokenomics copy updated.

The genesis tooling still encodes the old schedule and was **not** changed or redeployed:
- `chain/emission/allocation.json` team bucket: `vesting_cliff_pct: 10`, `vesting_linear_months: 24` (10% unlocked at genesis, 90% linear over 24 months, no cliff).
- `chain/scripts/apply-emission-genesis.py` / `validate-emission-genesis.py` build/check the team account as a `ContinuousVestingAccount`; a 6-month cliff needs `start_time = genesis + 6mo` (or a `PeriodicVestingAccount` with a zero first period), `vesting_cliff_pct: 0`, 18 months linear.
Apply before the next genesis (mainnet); the live testnet account keeps its current schedule unless migrated.
