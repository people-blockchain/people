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

    function calculateAllocation(uint256 totalSupply) internal pure returns (Allocation memory a) {
        a.communityPool = (totalSupply * 10) / 100;
        a.creator = (totalSupply * 15) / 100;
        a.liquidityReserve = (totalSupply * 10) / 100;
        a.ecosystemReserve = (totalSupply * 5) / 100;
        a.bondingCurve = totalSupply - (a.communityPool + a.creator + a.liquidityReserve + a.ecosystemReserve);
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
