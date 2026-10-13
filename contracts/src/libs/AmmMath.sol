// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PeopleConstants} from "../PeopleConstants.sol";

library AmmMath {
    error ZeroOutput();
    error Slippage();
    error InvariantDecrease();

    function integerSqrt(uint256 n) internal pure returns (uint256) {
        if (n < 2) return n;
        uint256 x0 = n;
        uint256 x1 = (n >> 1) + 1;
        while (x1 < x0) {
            x0 = x1;
            x1 = (x1 + n / x1) >> 1;
        }
        return x0;
    }

    function swapExactIn(uint256 reserveIn, uint256 reserveOut, uint256 amountIn, uint256 feeBps, uint256 minOut)
        internal
        pure
        returns (uint256 amountOut, uint256 newReserveIn, uint256 newReserveOut)
    {
        uint256 feeMul = 10_000 - feeBps;
        uint256 amountInWithFee = amountIn * feeMul;
        uint256 denominator = reserveIn * 10_000 + amountInWithFee;
        amountOut = (amountInWithFee * reserveOut) / denominator;
        if (amountOut == 0 || amountOut >= reserveOut) revert ZeroOutput();
        if (amountOut < minOut) revert Slippage();
        newReserveIn = reserveIn + amountIn;
        newReserveOut = reserveOut - amountOut;
        if (newReserveIn * newReserveOut < reserveIn * reserveOut) revert InvariantDecrease();
    }

    function mintInitial(uint256 tokenIn, uint256 nativeIn)
        internal
        pure
        returns (uint256 lpMinted, uint256 locked)
    {
        uint256 raw = integerSqrt(tokenIn * nativeIn);
        if (raw <= PeopleConstants.AMM_MINIMUM_LIQUIDITY) revert ZeroOutput();
        locked = PeopleConstants.AMM_MINIMUM_LIQUIDITY;
        lpMinted = raw - locked;
    }

    function mintProportional(uint256 tokenIn, uint256 nativeIn, uint256 tokenReserve, uint256 nativeReserve, uint256 totalSupply)
        internal
        pure
        returns (uint256)
    {
        uint256 fromToken = (tokenIn * totalSupply) / tokenReserve;
        uint256 fromNative = (nativeIn * totalSupply) / nativeReserve;
        return fromToken < fromNative ? fromToken : fromNative;
    }
}
