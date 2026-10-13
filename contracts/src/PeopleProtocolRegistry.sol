// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Thin registry for factory wiring (EIP-170–safe; no nested `new`).
contract PeopleProtocolRegistry is Ownable {
    address public tokenFactory;

    event TokenFactorySet(address indexed tokenFactory);

    error ZeroAddress();

    constructor() Ownable(msg.sender) {}

    /// @notice AUD-M12: rotatable by the owner (the deployer at construction, then the
    /// timelock once `Deploy.s.sol` transfers ownership) instead of a deployer-only, one-shot
    /// setter — a wrong or retired factory address no longer requires redeploying the registry.
    function setTokenFactory(address tokenFactory_) external onlyOwner {
        if (tokenFactory_ == address(0)) revert ZeroAddress();
        tokenFactory = tokenFactory_;
        emit TokenFactorySet(tokenFactory_);
    }

    function tokenFactoryAddress() external view returns (address) {
        return tokenFactory;
    }
}
