// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract PeopleTimelock is TimelockController {
    constructor(uint256 minDelay) TimelockController(minDelay, new address[](0), new address[](0), msg.sender) {}
}
