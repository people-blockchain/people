// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPromoRewardsVault {
    function register(address token, address creator, uint16 promoBps, uint256 amount) external;
}
