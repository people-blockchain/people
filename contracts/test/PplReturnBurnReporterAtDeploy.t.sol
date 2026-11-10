// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PplReturnBurn} from "../src/sale/PplReturnBurn.sol";
import {PplSaleDistributor, IPplReturnBurnCredit} from "../src/sale/PplSaleDistributor.sol";

/// @notice The sale reporter and its credit cap are now set in `PplReturnBurn`'s constructor, so
/// delivery works the moment the sale opens. This mirrors `DeployPplSaleDelivery.s.sol` (predict the
/// distributor address, pass it as both `returnRecipient` and initial `purchaseReporter`, cap from
/// env) and checks the timelock still applies to every LATER change.
contract PplReturnBurnReporterAtDeployTest is Test {
    PplReturnBurn internal burn;
    PplSaleDistributor internal dist;

    address internal owner = makeAddr("safe");
    address internal relayer = makeAddr("relayer");
    address internal pool = makeAddr("communityPool");
    address internal buyer = makeAddr("buyer");
    address internal constant HUB = address(0x4B0B);
    uint256 internal constant BASE = 8453;
    uint256 internal constant CAP = 1_000_000 ether;
    uint256 internal constant PERIOD = 1 days;

    function setUp() public {
        // Mirror DeployPplSaleDelivery: predict the distributor address and pass it to
        // PplReturnBurn as both the immutable returnRecipient and the initial purchaseReporter,
        // with the credit cap set at deploy (REPORTER_CREDIT_LIMIT / REPORTER_CREDIT_PERIOD).
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        burn = new PplReturnBurn(owner, predicted, predicted, CAP, PERIOD);
        dist = new PplSaleDistributor(owner, relayer, IPplReturnBurnCredit(address(burn)), BASE, HUB, pool);
        assertEq(address(dist), predicted, "predicted distributor");
        assertEq(burn.returnRecipient(), address(dist), "return recipient");
        assertEq(burn.purchaseReporter(), address(dist), "reporter set at deploy");
        assertEq(burn.reporterCreditLimit(), CAP, "limit set at deploy");
        assertEq(burn.reporterCreditPeriod(), PERIOD, "period set at deploy");

        vm.deal(address(this), 10_000_000 ether);
        (bool ok,) = address(dist).call{value: 10_000_000 ether}("");
        assertTrue(ok);
    }

    function _id(uint256 n) internal pure returns (bytes32) {
        return keccak256(abi.encode(BASE, HUB, keccak256(abi.encode("tx", n)), n));
    }

    /// @notice Delivery works in the same block as deploy, no warp, and credits hubPurchasedPpl.
    function test_deliverWorksSameBlockNoWarp() public {
        bytes32 id = _id(1);
        vm.prank(relayer);
        dist.deliver(id, buyer, 20_000 ether);
        assertEq(buyer.balance, 20_000 ether);
        assertEq(burn.hubPurchasedPpl(buyer), 20_000 ether, "hub purchase credited");
        assertEq(burn.reporterCreditUsed(), 20_000 ether);
        assertTrue(dist.delivered(id));
    }

    /// @notice The credit cap set at deploy is enforced immediately.
    function test_creditCapEnforcedAtDeploy() public {
        vm.prank(relayer);
        vm.expectRevert(PplReturnBurn.ReporterCreditCapExceeded.selector);
        dist.deliver(_id(1), buyer, CAP + 1);
        assertFalse(dist.delivered(_id(1)));
        assertEq(buyer.balance, 0);
    }

    /// @notice The rolling window resets after `reporterCreditPeriod`, so the cap is per window.
    function test_creditWindowResetsAfterPeriod() public {
        vm.startPrank(relayer);
        dist.deliver(_id(1), buyer, CAP / 2);
        dist.deliver(_id(2), buyer, CAP / 2);
        vm.stopPrank();
        vm.warp(block.timestamp + PERIOD);
        vm.prank(relayer);
        dist.deliver(_id(3), buyer, CAP / 2);
        assertEq(burn.reporterCreditUsed(), CAP / 2, "window reset after period");
    }

    /// @notice Changing the reporter later still needs queue + 48 h, no immediate setter.
    function test_changeReporterLaterStillTimelocked() public {
        address next = makeAddr("nextReporter");
        vm.prank(owner);
        bytes32 id = burn.queueSetPurchaseReporter(next);
        vm.prank(owner);
        vm.expectRevert(PplReturnBurn.Timelocked.selector);
        burn.executeSetPurchaseReporter(id);
        vm.warp(block.timestamp + burn.ADMIN_TIMELOCK());
        vm.prank(owner);
        burn.executeSetPurchaseReporter(id);
        assertEq(burn.purchaseReporter(), next);
    }

    /// @notice Changing the cap later still needs queue + 48 h.
    function test_changeCreditCapLaterStillTimelocked() public {
        vm.prank(owner);
        bytes32 id = burn.queueSetReporterCreditCap(CAP * 2, PERIOD);
        vm.prank(owner);
        vm.expectRevert(PplReturnBurn.Timelocked.selector);
        burn.executeSetReporterCreditCap(id);
        vm.warp(block.timestamp + burn.ADMIN_TIMELOCK());
        vm.prank(owner);
        burn.executeSetReporterCreditCap(id);
        assertEq(burn.reporterCreditLimit(), CAP * 2);
    }

    /// @notice A queued later change can be cancelled; a cancelled id cannot execute.
    function test_cancelQueuedReporterChange() public {
        vm.prank(owner);
        bytes32 id = burn.queueSetPurchaseReporter(makeAddr("x"));
        vm.prank(owner);
        burn.cancel(id);
        vm.warp(block.timestamp + burn.ADMIN_TIMELOCK());
        vm.prank(owner);
        vm.expectRevert(PplReturnBurn.NotQueued.selector);
        burn.executeSetPurchaseReporter(id);
        assertEq(burn.purchaseReporter(), address(dist), "original reporter unchanged");
    }

    /// @notice Only the owner can queue later changes.
    function test_nonOwnerCannotQueueLaterChange() public {
        vm.prank(buyer);
        vm.expectRevert();
        burn.queueSetPurchaseReporter(makeAddr("x"));
        vm.prank(buyer);
        vm.expectRevert();
        burn.queueSetReporterCreditCap(1 ether, 1 days);
    }

    function test_constructorRejectsZeroReporter() public {
        vm.expectRevert(PplReturnBurn.ZeroAddress.selector);
        new PplReturnBurn(owner, makeAddr("wallet"), address(0), CAP, PERIOD);
    }

    function test_constructorRejectsZeroLimit() public {
        vm.expectRevert(PplReturnBurn.ZeroAmount.selector);
        new PplReturnBurn(owner, makeAddr("wallet"), relayer, 0, PERIOD);
    }

    function test_constructorRejectsZeroPeriod() public {
        vm.expectRevert(PplReturnBurn.ZeroAmount.selector);
        new PplReturnBurn(owner, makeAddr("wallet"), relayer, CAP, 0);
    }

    function test_constructorRejectsZeroRecipient() public {
        vm.expectRevert(PplReturnBurn.ZeroAddress.selector);
        new PplReturnBurn(owner, address(0), relayer, CAP, PERIOD);
    }
    function test_constructorRejectsSelfAsReporter() public {
        address predictedBurn = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(PplReturnBurn.ZeroAddress.selector);
        new PplReturnBurn(owner, makeAddr("wallet"), predictedBurn, CAP, PERIOD);
    }

    /// @notice Only the distributor credits purchases: the relayer key itself cannot.
    function test_relayerCannotCreditDirectly() public {
        vm.prank(relayer);
        vm.expectRevert(PplReturnBurn.UnauthorizedReporter.selector);
        burn.creditHubPurchase(buyer, 1 ether);
        vm.prank(owner);
        vm.expectRevert(PplReturnBurn.UnauthorizedReporter.selector);
        burn.creditHubPurchase(buyer, 1 ether);
    }

    /// @notice A later (timelocked) cap change resets the window and the used credit.
    function test_laterCapChangeResetsWindow() public {
        vm.prank(relayer);
        dist.deliver(_id(1), buyer, CAP / 2);
        vm.prank(owner);
        bytes32 id = burn.queueSetReporterCreditCap(CAP, PERIOD);
        vm.warp(block.timestamp + burn.ADMIN_TIMELOCK());
        vm.prank(owner);
        burn.executeSetReporterCreditCap(id);
        assertEq(burn.reporterCreditUsed(), 0);
        assertEq(burn.reporterCreditWindowStart(), block.timestamp);
    }

    /// @notice Documents the tumbling window: up to 2x the limit can be credited across a boundary.
    function test_windowBoundaryAllowsTwoLimits() public {
        vm.warp(block.timestamp + PERIOD - 1);
        vm.prank(relayer);
        dist.deliver(_id(1), buyer, CAP);
        vm.warp(block.timestamp + 1);
        vm.prank(relayer);
        dist.deliver(_id(2), buyer, CAP);
        assertEq(burn.hubPurchasedPpl(buyer), 2 * CAP);
    }
}
