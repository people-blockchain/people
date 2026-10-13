// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBondingCurveMarket {
    function registerToken(
        address token,
        uint256 curveInventory,
        uint256 liquidityReserve,
        uint256 ecosystemReserve
    ) external;

    function buy(address token, uint256 minTokensOut) external payable;

    function sell(address token, uint256 tokenAmount, uint256 minNativeOut) external;

    function quoteBuy(address token, uint256 nativeIn) external view returns (uint256 tokensOut, uint256 fee);

    function quoteSell(address token, uint256 tokenIn) external view returns (uint256 nativeOut, uint256 fee);
}
