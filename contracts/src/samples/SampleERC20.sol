// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SampleERC20
/// @notice Educational fixed-supply ERC20 token. NOT part of the People's Blockchain
/// protocol — standalone teaching contract for the sample contract templates explorer.
///
/// The entire `supply_` is minted to the deployer at construction and there is no further
/// minting function, so total supply is fixed forever after deployment. `supply_` is taken
/// as-is in the token's base units (i.e. including decimals) — the deployer is responsible
/// for scaling, e.g. passing `1_000_000e18` for one million whole tokens at 18 decimals.
contract SampleERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 supply_) ERC20(name_, symbol_) {
        _mint(msg.sender, supply_);
    }
}
