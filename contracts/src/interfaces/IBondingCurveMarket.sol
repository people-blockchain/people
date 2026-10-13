// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBondingCurveMarket {
    /// @notice Owner rule 2026-10-13: at launch the creator chooses what happens to
    /// (1) the curve leftover after AMM migration and (2) the unsold remainder at 180-day
    /// finalize. Never the creator, never the treasury.
    /// 0 = Burn (default): send to 0xdead. 1 = CommunityPool: send to the token's own vault.
    /// Encoded as `uint8` on the wire so the ABI stays stable; validated on-chain.
    enum LeftoverMode {
        Burn,
        CommunityPool
    }

    function registerToken(
        address token,
        uint256 curveInventory,
        uint256 liquidityReserve,
        uint256 ecosystemReserve,
        uint8 leftoverMode
    ) external;

    function buy(address token, uint256 minTokensOut) external payable;

    function sell(address token, uint256 tokenAmount, uint256 minNativeOut) external;

    function quoteBuy(address token, uint256 nativeIn) external view returns (uint256 tokensOut, uint256 fee);

    function quoteSell(address token, uint256 tokenIn) external view returns (uint256 nativeOut, uint256 fee);
}
