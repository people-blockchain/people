// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICommunityTokenVault {
    function register(address token, uint256 amount) external;

    /// @notice Credits promo tokens returned by `PromoRewardsVault` after the promo window
    /// closed, so they become withdrawable as part of the token's Community Pool allocation.
    function creditPromoReturn(address token, uint256 amount) external;

    /// @notice Add tokens to a token's community pool (unsold curve tokens after finalize).
    function deposit(address token, uint256 amount) external;
}
