// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PeopleConstants} from "../PeopleConstants.sol";

/// @dev Virtual constant-product curve math mirroring `BondingCurveEngine` (micro-PPL ceil path).
library CurveMath {
    struct Allocation {
        uint256 bondingCurve;
        uint256 communityPool;
        uint256 creator;
        uint256 liquidityReserve;
        uint256 ecosystemReserve;
    }

    struct State {
        uint256 virtualTokenReserve;
        uint256 virtualNativeReserve;
        uint256 actualNativeReserve;
        uint256 currentTokenReserve;
        uint256 invariantK;
        uint256 migrationThreshold;
        bool active;
        bool migrated;
    }

    error CurveInactive();
    error InsufficientInput();
    error Slippage();
    error InsufficientLiquidity();
    /// @notice Only `PROMO_BPS_NONE` / `PROMO_BPS_LOW` / `PROMO_BPS_HIGH` (0 / 500 / 1000) are
    /// accepted as a promo share — anything else, including values in between, is rejected.
    error InvalidPromoBps(uint16 promoBps);

    /// @notice The standard launch split: 60% bonding curve, 15% creator, 10% community pool,
    /// 10% liquidity reserve, 5% ecosystem reserve. Unchanged.
    function calculateAllocation(uint256 totalSupply) internal pure returns (Allocation memory a) {
        a.communityPool = (totalSupply * 10) / 100;
        a.creator = (totalSupply * 15) / 100;
        a.liquidityReserve = (totalSupply * 10) / 100;
        a.ecosystemReserve = (totalSupply * 5) / 100;
        a.bondingCurve = totalSupply - (a.communityPool + a.creator + a.liquidityReserve + a.ecosystemReserve);
    }

    /// @notice Reverts unless `promoBps` is exactly one of the three accepted promo shares.
    function requireValidPromoBps(uint16 promoBps) internal pure {
        if (
            promoBps != PeopleConstants.PROMO_BPS_NONE && promoBps != PeopleConstants.PROMO_BPS_LOW
                && promoBps != PeopleConstants.PROMO_BPS_HIGH
        ) {
            revert InvalidPromoBps(promoBps);
        }
    }

    /// @notice The standard launch split with an optional creator promo share carved out.
    /// @dev Owner decision 2026-10-13. `promo` is `promoBps` of `totalSupply` and is taken
    /// **entirely out of the bonding-curve portion** — never out of the community pool, the
    /// creator allocation, the liquidity reserve or the ecosystem reserve. Reasons:
    ///   1. the 10% Community Pool allocation is mandatory for the standard launch template
    ///      (`docs/TOKEN-ECONOMY.md` §4), so it must not shrink;
    ///   2. the liquidity reserve backs post-curve DEX liquidity and the ecosystem reserve backs
    ///      protocol grants — both are protocol-reserved and a creator must not be able to shrink
    ///      them in exchange for tokens they get to hand out;
    ///   3. taking it from the creator's own 15% would make the option economically meaningless;
    ///   4. the curve portion is the creator's own market inventory and is the only bucket whose
    ///      size is a pure creator/market trade-off: a smaller curve means a thinner market and a
    ///      steeper price, which is a cost the creator chooses to pay for promotion budget.
    /// The invariant is therefore `sum(a) + promo == totalSupply`, with the curve absorbing the
    /// whole deduction (60% -> 55% at 500 bps, 60% -> 50% at 1000 bps).
    /// @dev `promoBps == 0` returns byte-for-byte the same `Allocation` as
    /// `calculateAllocation(totalSupply)` and `promo == 0`.
    /// @return a The allocation, with `bondingCurve` already reduced by `promo`.
    /// @return promo The promo share, held by `PromoRewardsVault` under contract rules.
    function calculateAllocationWithPromo(uint256 totalSupply, uint16 promoBps)
        internal
        pure
        returns (Allocation memory a, uint256 promo)
    {
        requireValidPromoBps(promoBps);
        a = calculateAllocation(totalSupply);
        // `promoBps` is one of 0 / 500 / 1000, so the share is exactly nothing, a twentieth or a
        // tenth of supply. Written as a plain division rather than `totalSupply * promoBps /
        // 10_000` so no intermediate can overflow at any supply the fixed split itself survives;
        // the values are identical, since `floor(s * 500 / 10_000) == floor(s / 20)` and
        // `floor(s * 1000 / 10_000) == floor(s / 10)`.
        if (promoBps == PeopleConstants.PROMO_BPS_LOW) {
            promo = totalSupply / 20;
        } else if (promoBps == PeopleConstants.PROMO_BPS_HIGH) {
            promo = totalSupply / 10;
        }
        // Cannot underflow: `promo` is at most 10% of `totalSupply` while `a.bondingCurve` is
        // ~60% of it (exactly `totalSupply` minus the four 10/15/10/5 floor divisions).
        a.bondingCurve -= promo;
    }

    function initialState(uint256 bondingCurveAllocation) internal pure returns (State memory s) {
        uint256 x0 = bondingCurveAllocation;
        uint256 y0 = PeopleConstants.VIRTUAL_NATIVE_RESERVE;
        s.virtualTokenReserve = x0;
        s.virtualNativeReserve = y0;
        s.currentTokenReserve = x0;
        s.actualNativeReserve = 0;
        s.invariantK = x0 * y0;
        s.migrationThreshold = x0 / 3;
        s.active = true;
    }

    function curveFee(uint256 amount) internal pure returns (uint256) {
        return _ceilDiv(amount * PeopleConstants.CURVE_FEE_BPS, 10_000);
    }

    function calculateBuy(State memory s, uint256 nativeAmount, uint256 minTokensOut)
        internal
        pure
        returns (
            uint256 tokensOut,
            uint256 fee,
            uint256 netNativeIn,
            State memory next,
            bool migrationTriggered
        )
    {
        if (!s.active || s.migrated) revert CurveInactive();
        fee = curveFee(nativeAmount);
        netNativeIn = nativeAmount - fee;
        if (netNativeIn == 0) revert InsufficientInput();

        uint256 x = s.virtualTokenReserve;
        uint256 y = s.virtualNativeReserve;
        uint256 k = s.invariantK;
        uint256 y1 = y + netNativeIn;
        uint256 x1 = _ceilDiv(k, y1);
        if (x1 >= x) revert InsufficientInput();
        tokensOut = x - x1;
        if (tokensOut > s.currentTokenReserve) revert InsufficientLiquidity();
        if (tokensOut < minTokensOut) revert Slippage();

        next = s;
        next.virtualTokenReserve = x1;
        next.virtualNativeReserve = y1;
        next.invariantK = x1 * y1;
        next.actualNativeReserve = s.actualNativeReserve + netNativeIn;
        next.currentTokenReserve = s.currentTokenReserve - tokensOut;
        migrationTriggered = next.currentTokenReserve <= s.migrationThreshold;
    }

    function calculateSell(State memory s, uint256 tokenAmount, uint256 minNativeOut)
        internal
        pure
        returns (uint256 netNativeOut, uint256 fee, uint256 grossNativeOut, State memory next)
    {
        if (!s.active || s.migrated) revert CurveInactive();
        if (tokenAmount == 0) revert InsufficientInput();
        uint256 x = s.virtualTokenReserve;
        uint256 y = s.virtualNativeReserve;
        uint256 k = s.invariantK;
        uint256 x1 = x + tokenAmount;
        uint256 y1 = _ceilDiv(k, x1);
        if (y1 >= y) revert InsufficientInput();
        grossNativeOut = y - y1;
        if (grossNativeOut == 0) revert InsufficientInput();
        if (grossNativeOut > s.actualNativeReserve) revert InsufficientLiquidity();
        fee = curveFee(grossNativeOut);
        netNativeOut = grossNativeOut - fee;
        if (netNativeOut < minNativeOut) revert Slippage();

        next = s;
        next.virtualTokenReserve = x1;
        next.virtualNativeReserve = y1;
        next.invariantK = x1 * y1;
        next.actualNativeReserve = s.actualNativeReserve - grossNativeOut;
        next.currentTokenReserve = s.currentTokenReserve + tokenAmount;
    }

    function calculateMigration(State memory s, uint256 liquidityReserveTokens)
        internal
        pure
        returns (uint256 poolNative, uint256 poolToken, uint256 fromLiq, uint256 fromCurve)
    {
        poolNative = s.actualNativeReserve;
        if (poolNative == 0) revert InsufficientLiquidity();
        uint256 xFinal = s.virtualTokenReserve;
        uint256 yFinal = s.virtualNativeReserve;
        poolToken = (poolNative * xFinal) / yFinal;
        if (poolToken == 0) revert InsufficientLiquidity();

        if (liquidityReserveTokens >= poolToken) {
            fromLiq = poolToken;
        } else {
            fromLiq = liquidityReserveTokens;
            fromCurve = poolToken - fromLiq;
        }
        if (fromCurve > s.currentTokenReserve) revert InsufficientLiquidity();
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return (a + b - 1) / b;
    }
}
