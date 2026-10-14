// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {PeoplePredict} from "../src/PeoplePredict.sol";

contract RejectPayout {
    PeoplePredict p;

    constructor(PeoplePredict p_) {
        p = p_;
    }

    function depositMerge() external payable {
        p.split{value: msg.value}(1);
        p.merge(1, msg.value);
    }

    function withdraw() external {
        p.withdraw();
    }

    receive() external payable {
        revert();
    }
}

contract PredictReenter {
    PeoplePredict p;

    constructor(PeoplePredict p_) {
        p = p_;
    }

    function splitMerge() external payable {
        p.split{value: msg.value}(1);
        p.merge(1, msg.value);
    }

    function withdraw() external {
        p.withdraw();
    }

    receive() external payable {
        try p.withdraw() {} catch {}
    }
}

contract PeoplePredictTest is Test {
    PeoplePredict p;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address resolver = address(0x111);
    address arbiter = address(0x222);
    uint64 closeAt;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1000);
        p = new PeoplePredict(address(this));
        closeAt = uint64(block.timestamp + 7 days);
        p.createMarket(
            "Will the event occur?",
            "YES iff official source confirms before deadline; otherwise NO.",
            "https://example.org/official",
            "science",
            closeAt,
            resolver,
            arbiter
        );
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function splitAlice(uint256 amount) internal {
        vm.prank(alice);
        p.split{value: amount}(1);
    }

    function settle(uint8 result) internal {
        vm.warp(closeAt);
        vm.prank(resolver);
        p.propose(1, result, keccak256("source evidence"));
        vm.warp(block.timestamp + 48 hours);
        p.finalize(1, result, bytes32(0));
    }

    function solvent() internal view {
        assertEq(address(p).balance, p.totalCollateral() + p.totalBuyEscrow() + p.totalCredits());
    }

    function testSplitMergeWithdrawAndReplay() public {
        splitAlice(3 ether);
        (uint256 yes, uint256 no) = p.positions(1, alice);
        assertEq(yes, 3 ether);
        assertEq(no, 3 ether);
        solvent();
        vm.prank(alice);
        p.merge(1, 3 ether);
        solvent();
        vm.prank(alice);
        p.withdraw();
        assertEq(alice.balance, 100 ether);
        solvent();
        vm.prank(alice);
        vm.expectRevert("empty");
        p.withdraw();
        vm.prank(alice);
        vm.expectRevert();
        p.merge(1, 3 ether);
    }

    function testAskPartialFillCancelAndYesRedemption() public {
        splitAlice(2 ether);
        vm.prank(alice);
        uint256 o = p.placeOrder(1, true, false, 2 ether, 0.6 ether, closeAt);
        vm.prank(bob);
        p.fillOrder{value: 0.6 ether}(o, 1 ether);
        solvent();
        vm.prank(alice);
        p.cancelOrder(o);
        solvent();
        settle(1);
        vm.prank(bob);
        p.redeem(1);
        vm.prank(alice);
        p.redeem(1);
        solvent();
        assertEq(p.credits(bob), 1 ether);
        assertEq(p.credits(alice), 1.6 ether);
        vm.prank(bob);
        vm.expectRevert("empty");
        p.redeem(1);
    }

    function testBidPartialFillAndCancelRefund() public {
        splitAlice(2 ether);
        vm.prank(bob);
        uint256 o = p.placeOrder{value: 0.8 ether}(1, false, true, 2 ether, 0.4 ether, closeAt);
        vm.prank(alice);
        p.fillOrder(o, 1 ether);
        solvent();
        vm.prank(bob);
        p.cancelOrder(o);
        assertEq(p.credits(bob), 0.4 ether);
        solvent();
        settle(2);
        vm.prank(bob);
        p.redeem(1);
        vm.prank(alice);
        p.redeem(1);
        solvent();
        assertEq(p.credits(bob), 1.4 ether);
        assertEq(p.credits(alice), 1.4 ether);
    }

    function testVoidExactSmallestLot() public {
        splitAlice(1e14);
        vm.prank(alice);
        uint256 o = p.placeOrder(1, true, false, 1e14, 1e14, closeAt);
        vm.prank(bob);
        p.fillOrder{value: 1e10}(o, 1e14);
        settle(3);
        vm.prank(alice);
        p.redeem(1);
        vm.prank(bob);
        p.redeem(1);
        solvent();
        assertEq(p.credits(bob), 5e13);
        assertEq(p.credits(alice), 5e13 + 1e10);
        assertEq(p.totalCollateral(), 0);
    }

    function testDisputeAuthorityAndBoundaries() public {
        splitAlice(1 ether);
        vm.warp(closeAt);
        vm.prank(bob);
        vm.expectRevert("resolver only");
        p.propose(1, 1, keccak256("e"));
        vm.prank(resolver);
        p.propose(1, 1, keccak256("e"));
        vm.prank(bob);
        p.dispute(1, keccak256("counter evidence"));
        vm.expectRevert("evidence/disputed");
        p.dispute(1, keccak256("e"));
        vm.expectRevert("finalize time");
        p.finalize(1, 1, bytes32(0));
        vm.warp(block.timestamp + 48 hours);
        vm.prank(bob);
        vm.expectRevert("dispute time");
        p.dispute(1, keccak256("late"));
        vm.prank(resolver);
        vm.expectRevert("arbiter/evidence");
        p.finalize(1, 2, keccak256("e"));
        vm.prank(arbiter);
        p.finalize(1, 2, keccak256("decision"));
        vm.expectRevert("finalize time");
        p.finalize(1, 2, bytes32(0));
        vm.prank(alice);
        p.redeem(1);
        assertEq(p.credits(alice), 1 ether);
        solvent();
    }

    function testClosedExpiredInvalidPrecisionPaymentsAndReplay() public {
        splitAlice(1 ether);
        vm.prank(alice);
        uint256 o = p.placeOrder(1, true, false, 1 ether, 0.5 ether, closeAt - 1);
        vm.prank(bob);
        vm.expectRevert("exact payment");
        p.fillOrder{value: 1 ether}(o, 1 ether);
        vm.prank(alice);
        vm.expectRevert("order");
        p.fillOrder(o, 1 ether);
        vm.prank(bob);
        vm.expectRevert("maker only");
        p.cancelOrder(o);
        vm.prank(alice);
        vm.expectRevert("precision");
        p.split{value: 1}(1);
        vm.prank(alice);
        vm.expectRevert("price");
        p.placeOrder(1, true, false, 1 ether, 1 ether, closeAt);
        vm.prank(alice);
        vm.expectRevert("expiry");
        p.placeOrder(1, true, false, 1 ether, 0.5 ether, closeAt + 1);
        vm.warp(closeAt - 1);
        vm.prank(bob);
        vm.expectRevert("expired");
        p.fillOrder{value: 0.5 ether}(o, 1 ether);
        vm.warp(closeAt);
        vm.prank(alice);
        vm.expectRevert("closed");
        p.split{value: 1 ether}(1);
        vm.prank(alice);
        p.cancelOrder(o);
        vm.prank(alice);
        vm.expectRevert("empty");
        p.cancelOrder(o);
        solvent();
    }

    function testUnresolvedAndFinalizedMerge() public {
        splitAlice(1 ether);
        vm.prank(alice);
        vm.expectRevert("unresolved");
        p.redeem(1);
        vm.prank(resolver);
        vm.expectRevert("proposal time");
        p.propose(1, 1, keccak256("e"));
        settle(1);
        vm.prank(alice);
        vm.expectRevert("finalized");
        p.merge(1, 1 ether);
    }

    function testRolesAndWrongChain() public {
        vm.prank(alice);
        vm.expectRevert("admin only");
        p.createMarket("t", "terms", "source", "category", closeAt, resolver, arbiter);
        vm.expectRevert("separate roles");
        p.createMarket("t", "terms", "source", "category", closeAt, resolver, resolver);
        vm.chainId(1);
        vm.expectRevert("testnet only");
        new PeoplePredict(address(this));
    }

    function testEscrowRecoverableAfterSettlement() public {
        splitAlice(1 ether);
        vm.prank(alice);
        uint256 o = p.placeOrder(1, true, false, 1 ether, 0.7 ether, closeAt);
        settle(1);
        vm.prank(alice);
        p.cancelOrder(o);
        vm.prank(alice);
        p.redeem(1);
        assertEq(p.credits(alice), 1 ether);
        solvent();
    }

    function testReentrancyDoesNotDoubleWithdraw() public {
        PredictReenter r = new PredictReenter(p);
        vm.deal(address(this), 1 ether);
        r.splitMerge{value: 1 ether}();
        r.withdraw();
        assertEq(address(r).balance, 1 ether);
        solvent();
    }

    function testWithdrawalFailurePreservesCredits() public {
        RejectPayout r = new RejectPayout(p);
        vm.deal(address(this), 1 ether);
        r.depositMerge{value: 1 ether}();
        vm.expectRevert("withdraw failed");
        r.withdraw();
        assertEq(p.credits(address(r)), 1 ether);
        solvent();
    }

    function testOneMarketCannotConsumeAnotherCollateral() public {
        p.createMarket(
            "Second", "Exact conditions", "https://example.org/second", "science", closeAt, resolver, arbiter
        );
        splitAlice(1 ether);
        vm.prank(bob);
        p.split{value: 2 ether}(2);
        settle(1);
        vm.prank(alice);
        p.redeem(1);
        vm.prank(alice);
        p.withdraw();
        assertEq(p.getMarket(2).collateral, 2 ether);
        solvent();
        vm.prank(bob);
        p.merge(2, 2 ether);
        vm.prank(bob);
        p.withdraw();
        assertEq(address(p).balance, 0);
        solvent();
    }

    function testProposalEvidenceAndOutcomeValidation() public {
        vm.warp(closeAt);
        vm.prank(resolver);
        vm.expectRevert("outcome");
        p.propose(1, 0, keccak256("e"));
        vm.prank(resolver);
        vm.expectRevert("evidence");
        p.propose(1, 1, bytes32(0));
        vm.prank(resolver);
        p.propose(1, 1, keccak256("e"));
        vm.prank(resolver);
        vm.expectRevert("proposal time");
        p.propose(1, 2, keccak256("e"));
        vm.warp(block.timestamp + 48 hours);
        vm.expectRevert("proposed outcome");
        p.finalize(1, 2, bytes32(0));
        p.finalize(1, 1, bytes32(0));
    }

    function testFuzzTradeConservation(uint64 lots, uint16 ticks, bool buy, bool yes, uint8 result) public {
        uint256 amount = (uint256(lots) % 100000 + 1) * 1e14;
        uint256 price = (uint256(ticks) % 9999 + 1) * 1e14;
        uint256 cost = amount * price / 1 ether;
        splitAlice(amount);
        uint256 o;
        if (buy) {
            vm.prank(bob);
            o = p.placeOrder{value: cost}(1, yes, true, amount, price, closeAt);
            vm.prank(alice);
            p.fillOrder(o, amount);
        } else {
            vm.prank(alice);
            o = p.placeOrder(1, yes, false, amount, price, closeAt);
            vm.prank(bob);
            p.fillOrder{value: cost}(o, amount);
        }
        solvent();
        settle(result % 3 + 1);
        vm.prank(alice);
        p.redeem(1);
        vm.prank(bob);
        p.redeem(1);
        assertEq(p.totalCollateral(), 0);
        solvent();
        vm.prank(alice);
        p.withdraw();
        if (p.credits(bob) > 0) {
            vm.prank(bob);
            p.withdraw();
        }
        solvent();
        assertEq(address(p).balance, 0);
    }
}
