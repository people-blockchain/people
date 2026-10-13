// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployLavka} from "../script/DeployLavka.s.sol";

/// LAV-M2: the Lavka fee buckets must be configured explicitly and must never silently
/// default to the deployer EOA on a live deploy. `requiredBucket` reads the env with
/// `vm.envAddress`, so an absent variable reverts the deploy (forge behaviour); these tests
/// pin the value guard it adds on top.
contract DeployLavkaConfigTest is Test {
    DeployLavka internal deploy = new DeployLavka();

    function testConfiguredBucketReturnsExplicitAddress() public view {
        assertEq(deploy.configuredBucket(address(0xB0), "TREASURY"), address(0xB0));
        assertEq(deploy.configuredBucket(address(0xB1), "VALIDATORS"), address(0xB1));
        assertEq(deploy.configuredBucket(address(0xB2), "GROWTH_POOL"), address(0xB2));
    }

    function testConfiguredBucketRevertsWhenZero() public {
        vm.expectRevert(bytes("TREASURY must be a non-zero address"));
        deploy.configuredBucket(address(0), "TREASURY");
    }
}
