# Participant state and referral graph

**Status:** Phase A and Phase B only. **IMPLEMENTED** in consensus state.  
**Not production activation.** Settlement and payouts are not in this phase. Later implementation decisions turn on the Model A fee split and write `C`/`N`; see `docs/PROTOCOL-DECISIONS.md`.

This file records the state that the code stores. It does not change `docs/ECONOMIC-MODEL-v0.1.md` or any approved number. Economic Model v0.1 and Growth / Referral Protocol v0.1 stay the source of those rules. Where a consensus rule for registration or the edge is missing or marked for human review, it is listed below and is **not** invented here.

---

## Ambiguities (not guessed)

1. **Participant registration is APPROVED** as an explicit signed transition and identity only. A signed `registerParticipant` from that address creates `{ address }` and nothing else. No fee, stake, or reward. An account or a validator does not become a participant by itself. A non-zero `amount` or `fee` is rejected so the transition cannot move value or enter the legacy fee pool.

2. **`linkEpoch` is not stored.** The edge stores `linkedAtHeight`: the block height that included the edge. It is not a growth-epoch index. Maturation is not implemented in this phase. The old epoch-alignment formula is not applied here.

3. **Both endpoints must already be participants.** The proposal's accept pseudocode does not say this. The edge is rejected unless `tx.from` and `payload.parent` are already in `participants`, so an account does not become a graph node as a side effect of the edge. This is the composition of Phase A and the graph. It is not an economic parameter.

4. **The child signs the edge. APPROVED.** The signer is `tx.from`. No other signer is accepted.

5. **Transaction names.** `registerParticipant` is the architecture placeholder. `participantReferral` is the name used for the edge action. Neither name is an approved economic parameter. `payload.parent` is the parent address. `Validator.referredBy` is a different field and is not read.

6. **Fraud/reversal** is **OUTSIDE v0.1**. The edge is immutable: a second parent is rejected. There is no delete and no replace.

---

## Phase A — participant record — IMPLEMENTED

Consensus field: `ChainState.participants`, keyed by canonical address (`0x` + 40 lowercase hex).

| Fact | Rule |
| --- | --- |
| Distinct from an account | A funded account has no participant record until `registerParticipant` is applied |
| Distinct from a validator | `joinValidator` does not create a participant. Registration does not create a validator |
| Consensus | Applied inside `applyTransaction` during block transition. Included in `computeStateRoot`. Copied into checkpoints. Restored from the snapshot on load. A legacy snapshot with no field loads as `{}`. Mempool admission does not create the participant and does not create a new account, so producers and receivers hash the same account order |
| Not a participant source | URL, QR, `localStorage`, the web `?ref=` binder, the SDK, and the HTTP snapshot DTO do not write this map |

Stored shape: `{ address, parent?, linkedAtHeight?, registeredAtHeight? }`. `linkedAtHeight` is written once, with the parent, and is the including block height. `registeredAtHeight` is the block height that included registration. Depth is not stored. A caller-supplied height in the payload is ignored.

---

## Phase B — referral forest — IMPLEMENTED

Authoritative edge: signed `participantReferral` with `payload.parent`, applied in a block. Creating the edge credits no balance and writes no reward.

| Rule | Outcome |
| --- | --- |
| At most one parent | A second parent, including a repeat of the same parent, is rejected. `linkedAtHeight` stays. State is unchanged |
| Inclusion height | `linkedAtHeight` is the height of the block that applies the edge. Immutable. Not `linkEpoch`. No maturation |
| Self | `parent == child` is rejected |
| Cycle | Direct and indirect cycles are rejected. The walk follows stored parents |
| Forest | Many roots. Roots have no `parent` key |
| Depth | Derived, not stored. Root = 0. Child depth = parent depth + 1. Only L1–L2 are accepted. Depth > 2 is rejected and is not stored as depth 2 |
| Determinism | The same apply order yields the same parent and the same state root. Mempool order is the existing fee / timestamp / id sort. The first applied edge wins; the conflicting edge is dropped |
| No reward | Balances, treasury, burn, community pool, and `distributeEpochRewards` are unchanged by the edge |

`linkEpoch` is not stored. `contributionEpochs` and `networkActivityEpochs` are consensus maps. A later implementation decision writes them from qualifying transfers and launch or curve fees. Caps and claim records are not part of this state.

---

## Validator referral — unchanged, separate

`Validator.referredBy` and `NetworkConfig.referralShare` are not renamed and are not read by the participant path. Participant edges do not change validator selection, finality, slashing, block production, or validator rewards. Validator `referralPayouts` still come only from `referralShare` cut of the referred validator's reward.

---

## Approved and not implemented

These remain **APPROVED** in Economic Model v0.1 and **NOT IMPLEMENTED** in this change:

- Growth epoch settlement, budget `B`, bootstrap C
- Payouts, claims, caps, remainder, FORFEIT
- Maturation payouts and `linkEpoch`. The inclusion-height predicate is separate and does not pay
- Score weights, event catalogs, and the live Model A split are implementation decisions in `docs/PROTOCOL-DECISIONS.md`, not part of phases A and B
- Anti-Sybil, wash detection, fraud/reversal
- Historical payment weights 50/25/15/7/3. Active Beta payout is L1=70, L2=30. Referral graph is L1/L2 only (`MAX_PARTICIPANT_REFERRAL_DEPTH = 2`); deeper edges are rejected.

Production protocol is not deployed by this change.
