// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice TESTNET / TEST-ONLY 6-decimal stablecoin mock with NO value. Anyone can mint.
/// Never deploy it as a real payment token.
contract MockUSDC is ERC20 {
    constructor() ERC20("TEST USDC", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
