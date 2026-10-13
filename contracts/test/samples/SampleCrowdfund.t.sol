// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SampleCrowdfund} from "../../src/samples/SampleCrowdfund.sol";
import {SampleERC20} from "../../src/samples/SampleERC20.sol";

contract SampleCrowdfundTest is Test {
    address owner = address(0x0111E2);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    uint256 goal = 10 ether;
    uint256 duration = 7 days;

    SampleCrowdfund crowdfund;
    SampleCrowdfund crowdfundErc20;
    SampleERC20 stable;

    function setUp() public {
        vm.prank(owner);
        crowdfund = new SampleCrowdfund(goal, duration, address(0));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);

        stable = new SampleERC20("Test USD", "tUSD", 1_000_000e18);
        stable.transfer(alice, 100 ether);
        stable.transfer(bob, 100 ether);

        vm.prank(owner);
        crowdfundErc20 = new SampleCrowdfund(goal, duration, address(stable));
    }

    // -- native mode --

    function testContribute() public {
        vm.prank(alice);
        crowdfund.contribute{value: 3 ether}();
        assertEq(crowdfund.contributions(alice), 3 ether);
        assertEq(crowdfund.totalRaised(), 3 ether);
    }

    function testClaimWhenGoalMet() public {
        vm.prank(alice);
        crowdfund.contribute{value: 6 ether}();
        vm.prank(bob);
        crowdfund.contribute{value: 5 ether}();

        vm.warp(block.timestamp + duration + 1);
        vm.prank(owner);
        crowdfund.claim();
        assertEq(owner.balance, 11 ether);
        assertTrue(crowdfund.claimed());
    }

    function testRefundWhenGoalNotMet() public {
        vm.prank(alice);
        crowdfund.contribute{value: 2 ether}();

        vm.warp(block.timestamp + duration + 1);
        vm.prank(alice);
        crowdfund.refund();
        assertEq(alice.balance, 100 ether);
        assertEq(crowdfund.contributions(alice), 0);
    }

    function testNonOwnerClaimReverts() public {
        vm.prank(alice);
        crowdfund.contribute{value: 10 ether}();
        vm.warp(block.timestamp + duration + 1);
        vm.prank(alice);
        vm.expectRevert(SampleCrowdfund.NotOwner.selector);
        crowdfund.claim();
    }

    function testClaimBeforeDeadlineReverts() public {
        vm.prank(alice);
        crowdfund.contribute{value: 10 ether}();
        vm.prank(owner);
        vm.expectRevert(SampleCrowdfund.TooEarly.selector);
        crowdfund.claim();
    }

    function testClaimWhenGoalNotMetReverts() public {
        vm.prank(alice);
        crowdfund.contribute{value: 1 ether}();
        vm.warp(block.timestamp + duration + 1);
        vm.prank(owner);
        vm.expectRevert(SampleCrowdfund.GoalNotMet.selector);
        crowdfund.claim();
    }

    function testRefundWhenGoalMetReverts() public {
        vm.prank(alice);
        crowdfund.contribute{value: 10 ether}();
        vm.warp(block.timestamp + duration + 1);
        vm.prank(alice);
        vm.expectRevert(SampleCrowdfund.GoalWasMet.selector);
        crowdfund.refund();
    }

    function testDoubleRefundReverts() public {
        vm.prank(alice);
        crowdfund.contribute{value: 2 ether}();
        vm.warp(block.timestamp + duration + 1);
        vm.prank(alice);
        crowdfund.refund();
        vm.prank(alice);
        vm.expectRevert(SampleCrowdfund.NothingToRefund.selector);
        crowdfund.refund();
    }

    function testDoubleClaimReverts() public {
        vm.prank(alice);
        crowdfund.contribute{value: 10 ether}();
        vm.warp(block.timestamp + duration + 1);
        vm.prank(owner);
        crowdfund.claim();
        vm.prank(owner);
        vm.expectRevert(SampleCrowdfund.AlreadyClaimed.selector);
        crowdfund.claim();
    }

    function testZeroGoalConstructorReverts() public {
        vm.expectRevert(SampleCrowdfund.ZeroGoal.selector);
        new SampleCrowdfund(0, duration, address(0));
    }

    function testZeroDurationConstructorReverts() public {
        vm.expectRevert(SampleCrowdfund.ZeroDuration.selector);
        new SampleCrowdfund(goal, 0, address(0));
    }

    function testContributeAfterDeadlineReverts() public {
        vm.warp(block.timestamp + duration + 1);
        vm.prank(alice);
        vm.expectRevert(SampleCrowdfund.FundingClosed.selector);
        crowdfund.contribute{value: 1 ether}();
    }

    function testNativeModeRejectsErc20Contribute() public {
        vm.prank(alice);
        vm.expectRevert(SampleCrowdfund.WrongContributeFunction.selector);
        crowdfund.contribute(1 ether);
    }

    // -- ERC20 mode --

    function testErc20Contribute() public {
        vm.prank(alice);
        stable.approve(address(crowdfundErc20), 3 ether);
        vm.prank(alice);
        crowdfundErc20.contribute(3 ether);
        assertEq(crowdfundErc20.contributions(alice), 3 ether);
        assertEq(crowdfundErc20.totalRaised(), 3 ether);
        assertEq(stable.balanceOf(address(crowdfundErc20)), 3 ether);
    }

    function testErc20ClaimWhenGoalMet() public {
        vm.prank(alice);
        stable.approve(address(crowdfundErc20), 6 ether);
        vm.prank(alice);
        crowdfundErc20.contribute(6 ether);

        vm.prank(bob);
        stable.approve(address(crowdfundErc20), 5 ether);
        vm.prank(bob);
        crowdfundErc20.contribute(5 ether);

        vm.warp(block.timestamp + duration + 1);
        vm.prank(owner);
        crowdfundErc20.claim();
        assertEq(stable.balanceOf(owner), 11 ether);
    }

    function testErc20RefundWhenGoalNotMet() public {
        vm.prank(alice);
        stable.approve(address(crowdfundErc20), 2 ether);
        vm.prank(alice);
        crowdfundErc20.contribute(2 ether);

        vm.warp(block.timestamp + duration + 1);
        vm.prank(alice);
        crowdfundErc20.refund();
        assertEq(stable.balanceOf(alice), 100 ether);
        assertEq(crowdfundErc20.contributions(alice), 0);
    }

    function testErc20ModeRejectsNativeContribute() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(SampleCrowdfund.WrongContributeFunction.selector);
        crowdfundErc20.contribute{value: 1 ether}();
    }

    function testErc20ContributeWithoutApprovalReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        crowdfundErc20.contribute(1 ether);
    }

    function testErc20ZeroContributionReverts() public {
        vm.prank(alice);
        vm.expectRevert(SampleCrowdfund.ZeroContribution.selector);
        crowdfundErc20.contribute(0);
    }
}
