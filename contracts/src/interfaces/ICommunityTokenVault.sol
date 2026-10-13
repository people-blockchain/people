// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICommunityTokenVault {
    function register(address token, uint256 amount) external;
    function deposit(address token, uint256 amount) external;
}
