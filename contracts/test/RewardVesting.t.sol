// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RewardVesting} from "../src/vesting/RewardVesting.sol";
import {PplReturnBurn} from "../src/sale/PplReturnBurn.sol";

contract RewardVestingTest is Test {
    RewardVesting internal vesting;
    PplReturnBurn internal burner;
    address internal owner = makeAddr("owner");
    address internal user = makeAddr("user");
    address internal feeSink = makeAddr("feeSink");
    address internal hub = makeAddr("hub");

    function setUp() public {
        vesting = new RewardVesting(owner);
        burner = new PplReturnBurn(owner, makeAddr("saleWallet"));
        vm.deal(owner, 100 ether);
        vm.startPrank(owner);
        vesting.setForbiddenRecipient(address(burner), true);
        vesting.setForbiddenRecipient(hub, true);
        vesting.setFeeSpendWhitelist(feeSink, true);
        uint64 start = uint64(block.timestamp);
        vesting.addGrant{value: 10 ether}(user, start, 100 days);
        vm.stopPrank();
    }

    function test_cannotClaimLockedToReturnBurn() public {
        vm.prank(user);
        vm.expectRevert(RewardVesting.ForbiddenRecipient.selector);
        vesting.claim(payable(address(burner)), 1 ether);
    }

    function test_cannotClaimUnlockedToReturnBurn() public {
        vm.warp(block.timestamp + 50 days);
        vm.prank(user);
        vm.expectRevert(RewardVesting.ForbiddenRecipient.selector);
        vesting.claim(payable(address(burner)), 1 ether);
    }

    function test_cannotClaimUnlockedToHub() public {
        vm.warp(block.timestamp + 50 days);
        vm.prank(user);
        vm.expectRevert(RewardVesting.ForbiddenRecipient.selector);
        vesting.claim(payable(hub), 1 ether);
    }

    function test_feeSpendOnlyViaWhitelist() public {
        vm.warp(block.timestamp + 50 days);
        vm.prank(user);
        vm.expectRevert(RewardVesting.NotWhitelisted.selector);
        vesting.spendOnSiteFee(makeAddr("random"), 1 ether);
    }

    function test_feeSpendToReturnBurnRevertsEvenIfWhitelisted() public {
        vm.warp(block.timestamp + 50 days);
        vm.startPrank(owner);
        vm.expectRevert(RewardVesting.ForbiddenRecipient.selector);
        vesting.setFeeSpendWhitelist(address(burner), true);
        vm.stopPrank();
    }

    function test_whitelistedFeeSpendWorks() public {
        vm.warp(block.timestamp + 50 days);
        uint256 before = feeSink.balance;
        vm.prank(user);
        vesting.spendOnSiteFee(feeSink, 2 ether);
        assertEq(feeSink.balance - before, 2 ether);
    }
}
