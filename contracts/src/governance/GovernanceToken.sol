// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes {
    /// @notice M07-5: supply mints to `initialHolder` (the DAO timelock), not the deployer.
    constructor(address initialHolder) ERC20("People Governance", "gPPL") ERC20Permit("People Governance") {
        _mint(initialHolder, 1_000_000 ether);
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    /// @notice AUD-M11: chain 97401 blocks are ~4 s, not the 12 s `GovernorSettings`/`ERC20Votes`
    /// defaults assume. Use wall-clock time for voting checkpoints instead of block number so
    /// `PeopleGovernor`'s voting delay/period are real time, independent of block time.
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
