// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PplReturnBurn} from "../src/sale/PplReturnBurn.sol";
import {PplSaleDistributor, IPplReturnBurnCredit} from "../src/sale/PplSaleDistributor.sol";

contract RejectsPpl {
    receive() external payable {
        revert("no");
    }

    function claimTo(PplSaleDistributor d, address payable to) external {
        d.claim(to);
    }
}

contract Reenterer {
    PplSaleDistributor public d;

    constructor(PplSaleDistributor d_) {
        d = d_;
    }

    receive() external payable {
        // Try to pull a second payout while being paid; must not succeed.
        try d.claim(payable(address(this))) {} catch {}
    }
}

contract PplSaleDistributorTest is Test {
    PplReturnBurn internal burn;
    PplSaleDistributor internal dist;

    address internal owner = makeAddr("safe");
    address internal relayer = makeAddr("relayer");
    address internal pool = makeAddr("communityPool");
    address internal buyer = makeAddr("buyer");
    address internal attacker = makeAddr("attacker");
    address internal constant HUB = address(0x4B0B);
    uint256 internal constant BASE = 8453;

    function setUp() public {
        // PplReturnBurn needs its returnRecipient at deploy; the distributor needs PplReturnBurn.
        // Predict the distributor address so returns flow back into it.
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        burn = new PplReturnBurn(owner, predicted);
        dist = new PplSaleDistributor(owner, relayer, IPplReturnBurnCredit(address(burn)), BASE, HUB, pool);
        assertEq(address(dist), predicted);

        vm.startPrank(owner);
        bytes32 a = burn.queueSetPurchaseReporter(address(dist));
        bytes32 b = burn.queueSetReporterCreditCap(1_000_000 ether, 1 days);
        vm.warp(block.timestamp + 48 hours);
        burn.executeSetPurchaseReporter(a);
        burn.executeSetReporterCreditCap(b);
        vm.stopPrank();

        vm.deal(address(this), 10_000_000 ether);
        (bool ok,) = address(dist).call{value: 5_000_000 ether}("");
        assertTrue(ok);
    }

    // Computed locally (no external call) so it does not consume a pending vm.prank.
    function _id(uint256 n) internal pure returns (bytes32) {
        return keccak256(abi.encode(BASE, HUB, keccak256(abi.encode("tx", n)), n));
    }

    function test_deliverPaysCreditsAndMarks() public {
        bytes32 id = _id(1);
        vm.prank(relayer);
        dist.deliver(id, buyer, 20_000 ether);
        assertEq(buyer.balance, 20_000 ether);
        assertEq(burn.hubPurchasedPpl(buyer), 20_000 ether);
        assertTrue(dist.delivered(id));
        assertEq(dist.totalDelivered(), 20_000 ether);
    }

    function test_cannotDeliverTwice() public {
        bytes32 id = _id(1);
        vm.startPrank(relayer);
        dist.deliver(id, buyer, 1 ether);
        vm.expectRevert(PplSaleDistributor.AlreadyDelivered.selector);
        dist.deliver(id, buyer, 1 ether);
        vm.stopPrank();
        assertEq(buyer.balance, 1 ether);
    }

    function test_onlyRelayer() public {
        vm.prank(attacker);
        vm.expectRevert(PplSaleDistributor.NotRelayer.selector);
        dist.deliver(_id(1), attacker, 1 ether);
        vm.prank(owner);
        vm.expectRevert(PplSaleDistributor.NotRelayer.selector);
        dist.deliver(_id(1), owner, 1 ether);
    }

    function test_pauseStopsDeliveries() public {
        vm.prank(owner);
        dist.setPaused(true);
        vm.prank(relayer);
        vm.expectRevert(PplSaleDistributor.IsPaused.selector);
        dist.deliver(_id(1), buyer, 1 ether);
        vm.prank(attacker);
        vm.expectRevert();
        dist.setPaused(false);
    }

    function test_reporterCapBoundsRelayer() public {
        vm.prank(relayer);
        vm.expectRevert(PplReturnBurn.ReporterCreditCapExceeded.selector);
        dist.deliver(_id(1), attacker, 1_000_001 ether);
        assertEq(attacker.balance, 0);
        assertFalse(dist.delivered(_id(1)));
    }

    function test_cannotDeliverMoreThanHeld() public {
        vm.prank(relayer);
        vm.expectRevert(PplSaleDistributor.InsufficientPpl.selector);
        dist.deliver(_id(1), buyer, 5_000_001 ether);
    }

    function test_rejectingRecipientGetsOwedAndClaims() public {
        RejectsPpl r = new RejectsPpl();
        vm.prank(relayer);
        dist.deliver(_id(1), address(r), 7 ether);
        assertEq(dist.owed(address(r)), 7 ether);
        assertEq(dist.available(), 5_000_000 ether - 7 ether);
        // Owed PPL are not available to others or to the community pool.
        vm.prank(owner);
        vm.expectRevert(PplSaleDistributor.InsufficientPpl.selector);
        dist.sendToCommunityPool(5_000_000 ether);
        address payable to = payable(makeAddr("newWallet"));
        r.claimTo(dist, to);
        assertEq(to.balance, 7 ether);
        assertEq(dist.owed(address(r)), 0);
        assertEq(dist.totalOwed(), 0);
    }

    function test_reentrantRecipientCannotDoubleClaim() public {
        Reenterer r = new Reenterer(dist);
        vm.prank(relayer);
        dist.deliver(_id(1), address(r), 3 ether);
        assertEq(address(r).balance, 3 ether);
        assertEq(dist.owed(address(r)), 0);
    }

    function test_returnsFlowBackAndCanBeRedelivered() public {
        vm.prank(relayer);
        dist.deliver(_id(1), buyer, 100 ether);
        uint256 before = address(dist).balance;
        vm.prank(buyer);
        burn.burnForReturn{value: 40 ether}(HUB, keccak256("person"), buyer, BASE);
        assertEq(address(dist).balance, before + 40 ether);
        assertEq(burn.hubPurchasedPpl(buyer), 60 ether);
    }

    function test_ownerCanOnlySendToCommunityPool() public {
        vm.prank(owner);
        dist.sendToCommunityPool(1_000 ether);
        assertEq(pool.balance, 1_000 ether);
        vm.prank(attacker);
        vm.expectRevert();
        dist.sendToCommunityPool(1 ether);
    }

    function test_relayerChangeIsTimelocked() public {
        address newRelayer = makeAddr("newRelayer");
        vm.prank(owner);
        dist.queueSetRelayer(newRelayer);
        vm.prank(owner);
        vm.expectRevert(PplSaleDistributor.Timelocked.selector);
        dist.executeSetRelayer();
        vm.warp(block.timestamp + 48 hours);
        vm.prank(owner);
        dist.executeSetRelayer();
        assertEq(dist.relayer(), newRelayer);
        vm.prank(relayer);
        vm.expectRevert(PplSaleDistributor.NotRelayer.selector);
        dist.deliver(_id(2), relayer, 1 ether);
    }

    function test_relayerQueueExpiresAndCancels() public {
        vm.startPrank(owner);
        dist.queueSetRelayer(attacker);
        dist.cancelSetRelayer();
        vm.expectRevert(PplSaleDistributor.NotQueued.selector);
        dist.executeSetRelayer();
        dist.queueSetRelayer(attacker);
        vm.warp(block.timestamp + 48 hours + 14 days + 1);
        vm.expectRevert(PplSaleDistributor.OpExpired.selector);
        dist.executeSetRelayer();
        vm.stopPrank();
    }

    function test_renounceDisabled() public {
        vm.prank(owner);
        vm.expectRevert(PplSaleDistributor.RenounceDisabled.selector);
        dist.renounceOwnership();
    }

    function test_purchaseIdBindsChainAndHub() public view {
        assertEq(dist.purchaseIdOf(keccak256(abi.encode("tx", uint256(3))), 3), _id(3));
    }

    function testFuzz_ownerCannotPullToSelf(uint256 amt) public {
        amt = bound(amt, 1, 5_000_000 ether);
        uint256 before = owner.balance;
        vm.startPrank(owner);
        dist.sendToCommunityPool(amt);
        vm.stopPrank();
        assertEq(owner.balance, before);
        assertEq(pool.balance, amt);
    }
}
