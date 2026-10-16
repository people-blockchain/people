// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Protocol constants aligned with `people-node` (`curve.ts`, `factory-fees.ts`).
library PeopleConstants {
    /// 60 PPL virtual native reserve (18-decimal `appl`).
    uint256 internal constant VIRTUAL_NATIVE_RESERVE = 60 ether;
    uint256 internal constant CURVE_FEE_BPS = 100;
    uint256 internal constant AMM_FEE_BPS = 30;
    uint256 internal constant AMM_MINIMUM_LIQUIDITY = 1000;
    /// `DEFAULT_TOKEN_CREATE_MIN_FEE` (~1.045005 PPL).
    uint256 internal constant TOKEN_CREATE_FEE = 1_045_005_000_000_000_000;
    /// `DEFAULT_NFT_MINT_MIN_FEE` (2.925 PPL).
    uint256 internal constant NFT_MINT_FEE = 2_925_000_000_000_000_000;
    uint256 internal constant VESTING_DURATION = 180 days;
    uint256 internal constant PEOPLE_EVM_CHAIN_ID = 97401;

    // --------------------------------------------------- optional creator promo share
    // Owner decision 2026-10-13: a creator may optionally set aside an extra promo share for
    // referral/partner promotion rewards. Only these three values are accepted — there is no
    // free-form basis-point input, so the launch split stays one of three auditable shapes.
    /// No promo share (the default; the launch split is unchanged).
    uint16 internal constant PROMO_BPS_NONE = 0;
    /// 5% of total supply.
    uint16 internal constant PROMO_BPS_LOW = 500;
    /// 10% of total supply.
    uint16 internal constant PROMO_BPS_HIGH = 1000;

    /// @dev Window during which the creator may hand out promo rewards. Deliberately the same
    /// 180 days as `VESTING_DURATION` (the creator-vesting / curve horizon) so a launch has a
    /// single economic clock. Afterwards every undistributed promo token is returned to the
    /// token's Community Pool allocation.
    uint256 internal constant PROMO_WINDOW = VESTING_DURATION;

    /// @dev Anti-abuse: the cumulative share of one token's promo pool a single recipient may be
    /// awarded, in basis points of the pool (1000 = 10%, i.e. at least 10 distinct recipients are
    /// needed to hand out the whole pool). Provisional implementation value — the final number is
    /// `TBD`, see `docs/TOKEN-ECONOMY.md` §4a.
    uint16 internal constant PROMO_RECIPIENT_CAP_BPS = 1000;

    /// @dev Anti-abuse / gas bound: how many separate awards one recipient may hold per token.
    /// Each award vests on its own clock, and `claim` walks them, so the count must be bounded.
    uint256 internal constant PROMO_MAX_AWARDS_PER_RECIPIENT = 16;

    /// @dev Share of a promo award unlocked immediately, the rest vesting linearly over
    /// `VESTING_DURATION`. Same shape as the creator allocation (10% upfront / 90% linear over
    /// 180 days) so promo rewards cannot be dumped the moment they are handed out.
    uint256 internal constant PROMO_UPFRONT_PERCENT = 10;
}
