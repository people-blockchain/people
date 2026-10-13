// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Project token minted once at launch (Token Factory).
contract PeopleProjectToken is ERC20 {
    address public immutable factory;
    address public immutable creator;
    uint8 private immutable _decimals;
    string public metadataURI;

    error OnlyFactory();

    constructor(
        address factory_,
        address creator_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 totalSupply_,
        string memory metadataURI_
    ) ERC20(name_, symbol_) {
        factory = factory_;
        creator = creator_;
        _decimals = decimals_;
        metadataURI = metadataURI_;
        _mint(factory_, totalSupply_);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function setMetadataURI(string calldata uri) external {
        if (msg.sender != factory) revert OnlyFactory();
        metadataURI = uri;
    }
}
