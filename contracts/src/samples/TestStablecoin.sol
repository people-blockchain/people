// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestStablecoin
/// @notice TESTNET-ONLY mock stablecoin with NO real-world value. NOT part of the People's
/// Blockchain protocol — standalone teaching contract for the sample contract templates
/// explorer, deployed twice (as "Test USD Coin" / tUSDC and "Test Tether" / tUSDT) so the
/// Escrow and Crowdfund samples have something ERC20 to settle in on testnet. Anyone can
/// call `mint()` to get free test tokens; there is no backing asset and no redemption path.
///
/// 6 decimals, matching real USDC/USDT, so sample amounts read naturally (e.g. `1_000e6`).
contract TestStablecoin is ERC20 {
    uint256 public constant FAUCET_LIMIT = 1_000e6;
    uint256 public constant FAUCET_PERIOD = 24 hours;

    mapping(address => uint256) public lastMintAt;

    error FaucetCooldown(uint256 availableAt);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Public testnet faucet: mints up to `FAUCET_LIMIT` test tokens to the caller,
    /// at most once per `FAUCET_PERIOD`. Anyone can call this — it mints play money with no
    /// value, so there is nothing to protect beyond basic rate limiting.
    function mint() external {
        uint256 last = lastMintAt[msg.sender];
        if (last != 0) {
            uint256 availableAt = last + FAUCET_PERIOD;
            if (block.timestamp < availableAt) revert FaucetCooldown(availableAt);
        }
        lastMintAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_LIMIT);
    }
}
