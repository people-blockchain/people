# PEOPLE Genesis Quest

**Status:** owner-approved rules (2026-11-01). Constants live in `website/src/lib/founders/genesis-quest.ts`
(tests: `website/scripts/genesis-quest.test.mjs`). Payout is accounting only until PPL are distributed
on PEOPLE mainnet.

Period: 2 November – 1 December 2026. Quest tasks run on third-party quest platforms. Rewards require
registration on /founders and human verification.

## Funding (no mint)

Paid from the 50M Million Founders program pool (5% of supply, Community & rewards bucket):

| Part of the program | Before | After |
| --- | ---: | ---: |
| Season 1 founder points | 20M | 15M |
| Referral pool (all seasons) | 15M | 10M (Season 1 keeps 6M) |
| Genesis Quest | none | up to 25M |
| **Total** | **50M** | **50M** |

"Up to": PPL not earned in the quest go back to the program pool.

## Rewards

| Part | Budget | Rule |
| --- | ---: | --- |
| Base | 13M | Verification + one real network action. Telegram 300 PPL, Human Passport 1,500 PPL. Social follows required, not paid. Max 3,000 PPL per person for tasks and referrals. |
| Referrals | 6M | 500 PPL per invitee who has Human Passport, made a real action and is still active after 7 days. Max 20 invitees per person (more only for approved ambassadors). |
| Leaderboard | 6M | Top 100 by verified active invitees. 1st: 500,000; 2nd–10th: 150,000 each; 11th–100th: 46,111 each. Clusters of fake accounts can be removed before payout. |

Referrals and the leaderboard require Human Passport with score ≥ 10 (reachable with free stamps).

## Unlock

- Fully locked 1 December 2026 – 1 March 2027.
- Then one ninth on the 1st of each month, 1 April 2027 … 1 December 2027.
- Each ninth opens only if the person made at least one on-chain action in the month before it.
  A missed ninth stays locked.
- This schedule is separate from Founders season rewards (10% at once + 52 weeks, `reward-rules.ts`).

## No buyback

The project never buys quest PPL back and they never go into the sale reserve. The sell-back contract
on PEOPLE (`contracts/src/sale/PplReturnBurn.sol`) accepts only PPL the purchase reporter credited as
sale purchases (`hubPurchasedPpl`); any other PPL revert with `NotHubPurchasedPpl` (tested in
`contracts/test/PplCurveHubV2OpusR3.t.sol`). Unlocked quest PPL can be transferred between participants
once transfers open.

The contract cannot stop a holder from trading unlocked PPL with anyone else on the open network
(for example in a public liquidity pool). It only guarantees that the project's own sell-back and
reserve never take them.
