// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommunityAgentWallet} from "../src/agent/CommunityAgentWallet.sol";
import {PeopleMultisig} from "../src/governance/PeopleMultisig.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PeopleCommunitySale} from "../src/sale/PeopleCommunitySale.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerchantEscrow} from "../src/lavka/MerchantEscrow.sol";
import {GovernanceToken} from "../src/governance/GovernanceToken.sol";
import {PeopleTimelock} from "../src/governance/PeopleTimelock.sol";
import {PeopleGovernor} from "../src/governance/PeopleGovernor.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";

/// Regression tests for the Medium findings fixed in this branch (docs/audit-final/contracts.md).
contract AuditMediumsA_CommunityAgentWalletTest is Test {
    CommunityAgentWallet wallet;
    address executor = address(0xA11CE);
    address timelock = address(0x71);
    address recipient = address(0xFEE);
    address guardian = address(0x6D1A);

    function setUp() public {
        wallet = new CommunityAgentWallet(executor, timelock, recipient, guardian);
        vm.deal(address(wallet), 100 ether);
        vm.prank(timelock);
        wallet.setLimits(
            CommunityAgentWallet.Limits({
                maxPerTx: 10 ether,
                maxPerDay: 5 ether,
                maxPerWeek: 20 ether,
                whitelistEnabled: true,
                frozen: false
            })
        );
    }

    // ------------------------------------------------------------------ AUD-M3

    /// Pre-fix, `maxPerDay` used `block.timestamp / 1 days` calendar buckets: spending the full
    /// daily budget right before a UTC-day boundary and again right after let a spender clear
    /// 2x `maxPerDay` inside 2 minutes. A rolling 24h window must reject the second spend.
    function test_rollingDailyWindowBlocksDoubleSpendAcrossCalendarBoundary() public {
        uint256 dayBoundary = (block.timestamp / 1 days + 1) * 1 days;
        vm.warp(dayBoundary - 1 minutes);

        vm.prank(executor);
        wallet.spend(payable(recipient), 5 ether);

        // Still inside the rolling 24h window even though the calendar day flipped.
        vm.warp(dayBoundary + 1 minutes);
        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.OverLimit.selector);
        wallet.spend(payable(recipient), 1 ether);
    }

    /// Once the first spend actually ages out of the rolling 24h window, budget frees up again.
    function test_rollingDailyWindowFreesUpAfterTrueDayElapses() public {
        uint256 start = block.timestamp;
        vm.prank(executor);
        wallet.spend(payable(recipient), 5 ether);

        vm.warp(start + 1 days + 1);
        vm.prank(executor);
        wallet.spend(payable(recipient), 5 ether);
    }

    /// Same boundary trick must not bypass the weekly budget either.
    function test_rollingWeeklyWindowBlocksDoubleSpendAcrossCalendarBoundary() public {
        // Loosen the daily cap so only the weekly budget binds in this test.
        vm.prank(timelock);
        wallet.setLimits(
            CommunityAgentWallet.Limits({
                maxPerTx: 10 ether,
                maxPerDay: 100 ether,
                maxPerWeek: 20 ether,
                whitelistEnabled: true,
                frozen: false
            })
        );

        uint256 weekBoundary = (block.timestamp / 1 weeks + 1) * 1 weeks;
        // Four 5-ether spends, each >24h apart, landing just before the calendar-week boundary.
        vm.warp(weekBoundary - 3 days - 1 minutes);
        vm.prank(executor);
        wallet.spend(payable(recipient), 5 ether);
        vm.warp(weekBoundary - 2 days - 1 minutes);
        vm.prank(executor);
        wallet.spend(payable(recipient), 5 ether);
        vm.warp(weekBoundary - 1 days - 1 minutes);
        vm.prank(executor);
        wallet.spend(payable(recipient), 5 ether);
        vm.warp(weekBoundary - 1 minutes);
        vm.prank(executor);
        wallet.spend(payable(recipient), 5 ether);
        // 20 ether spent, still within the rolling 7d window despite crossing the calendar week.
        vm.warp(weekBoundary + 1 minutes);
        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.OverLimit.selector);
        wallet.spend(payable(recipient), 1 ether);
    }

    /// Many small spends inside the window must sum correctly (sliding window, not reset each tx).
    function test_rollingWindowSumsManySmallSpends() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(executor);
            wallet.spend(payable(recipient), 1 ether);
            vm.warp(block.timestamp + 1 hours);
        }
        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.OverLimit.selector);
        wallet.spend(payable(recipient), 1 ether);
    }

    // ------------------------------------------------------------------ AUD-M4

    function test_guardianCanFreezeInstantly() public {
        vm.prank(guardian);
        wallet.setEmergencyFreeze(true);
        (,,,, bool frozen) = wallet.limits();
        assertTrue(frozen);
    }

    function test_guardianCannotUnfreeze() public {
        vm.prank(timelock);
        wallet.setEmergencyFreeze(true);
        vm.prank(guardian);
        vm.expectRevert(CommunityAgentWallet.UnauthorizedRecipient.selector);
        wallet.setEmergencyFreeze(false);
    }

    function test_nonGuardianNonTimelockCannotFreeze() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(CommunityAgentWallet.UnauthorizedRecipient.selector);
        wallet.setEmergencyFreeze(true);
    }

    function test_timelockCanStillFreezeAndUnfreeze() public {
        vm.prank(timelock);
        wallet.setEmergencyFreeze(true);
        vm.prank(timelock);
        wallet.setEmergencyFreeze(false);
        (,,,, bool frozen) = wallet.limits();
        assertFalse(frozen);
    }
}

// ---------------------------------------------------------------------- AUD-M7

contract AuditMediumsA_PeopleMultisigTest is Test {
    PeopleMultisig multisig;
    address owner1 = address(0x1);
    address owner2 = address(0x2);
    address owner3 = address(0x3);
    address receiver = address(0xBEEF);

    function setUp() public {
        multisig = new PeopleMultisig([owner1, owner2, owner3]);
        vm.deal(address(multisig), 10 ether);
    }

    /// A confirming owner can withdraw their confirmation before execution, and the
    /// transaction then correctly requires a fresh second confirmation.
    function test_revokeConfirmationBeforeExecute() public {
        vm.prank(owner1);
        uint256 txId = multisig.submit(receiver, 1 ether, "");
        vm.prank(owner2);
        multisig.confirm(txId);

        vm.prank(owner2);
        multisig.revokeConfirmation(txId);

        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.NotEnoughConfirmations.selector);
        multisig.execute(txId);

        vm.prank(owner3);
        multisig.confirm(txId);
        vm.prank(owner1);
        multisig.execute(txId);
        assertEq(receiver.balance, 1 ether);
    }

    function test_cannotRevokeConfirmationAfterExecute() public {
        vm.prank(owner1);
        uint256 txId = multisig.submit(receiver, 1 ether, "");
        vm.prank(owner2);
        multisig.confirm(txId);
        vm.prank(owner1);
        multisig.execute(txId);

        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.AlreadyExecuted.selector);
        multisig.revokeConfirmation(txId);
    }

    function test_cannotRevokeWithoutHavingConfirmed() public {
        vm.prank(owner1);
        uint256 txId = multisig.submit(receiver, 1 ether, "");
        vm.prank(owner3);
        vm.expectRevert(PeopleMultisig.NotConfirmed.selector);
        multisig.revokeConfirmation(txId);
    }

    /// Owner management is only reachable via the multisig calling itself, approved the same
    /// way as any other transaction.
    function test_ownerRotationViaSelfCall() public {
        address newOwner = address(0x4);
        bytes memory data = abi.encodeWithSelector(PeopleMultisig.addOwner.selector, newOwner);
        vm.prank(owner1);
        uint256 txId = multisig.submit(address(multisig), 0, data);
        vm.prank(owner2);
        multisig.confirm(txId);
        vm.prank(owner1);
        multisig.execute(txId);

        assertTrue(multisig.isOwner(newOwner));
        assertEq(multisig.ownerCount(), 4);
    }

    function test_directCallToAddOwnerRejected() public {
        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.NotSelf.selector);
        multisig.addOwner(address(0x4));
    }

    function test_changeThresholdRejectsAboveOwnerCount() public {
        bytes memory data = abi.encodeWithSelector(PeopleMultisig.changeThreshold.selector, uint256(4));
        vm.prank(owner1);
        uint256 txId = multisig.submit(address(multisig), 0, data);
        vm.prank(owner2);
        multisig.confirm(txId);
        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.CallFailed.selector);
        multisig.execute(txId);
    }

    function test_changeThresholdThenRemoveOwnerEnforcesFloor() public {
        // Bump threshold to 3 (all owners), then removing any owner must fail.
        bytes memory bump = abi.encodeWithSelector(PeopleMultisig.changeThreshold.selector, uint256(3));
        vm.prank(owner1);
        uint256 t1 = multisig.submit(address(multisig), 0, bump);
        vm.prank(owner2);
        multisig.confirm(t1);
        vm.prank(owner1);
        multisig.execute(t1);
        assertEq(multisig.threshold(), 3);

        bytes memory data = abi.encodeWithSelector(PeopleMultisig.removeOwner.selector, owner1);
        vm.prank(owner1);
        uint256 t2 = multisig.submit(address(multisig), 0, data);
        vm.prank(owner2);
        multisig.confirm(t2);
        vm.prank(owner3);
        multisig.confirm(t2);
        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.CallFailed.selector);
        multisig.execute(t2);
    }

    function test_replaceOwnerViaSelfCall() public {
        address newOwner = address(0x4);
        bytes memory data = abi.encodeWithSelector(PeopleMultisig.replaceOwner.selector, owner3, newOwner);
        vm.prank(owner1);
        uint256 txId = multisig.submit(address(multisig), 0, data);
        vm.prank(owner2);
        multisig.confirm(txId);
        vm.prank(owner1);
        multisig.execute(txId);

        assertFalse(multisig.isOwner(owner3));
        assertTrue(multisig.isOwner(newOwner));
        assertEq(multisig.ownerCount(), 3);
    }
}

// ---------------------------------------------------------------------- AUD-M8

contract AuditMediumsA_MockUsdt is ERC20 {
    constructor() ERC20("Tether USD", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AuditMediumsA_PeopleCommunitySaleTest is Test {
    AuditMediumsA_MockUsdt usdt;
    PeopleCommunitySale sale;
    address treasury = address(0x7EA5);
    address owner = address(0x0123);
    address buyer = address(0xB0B);

    function setUp() public {
        usdt = new AuditMediumsA_MockUsdt();
        sale = new PeopleCommunitySale(address(usdt), treasury, owner);
        vm.prank(owner);
        sale.open(address(0xC0DE));
        usdt.mint(buyer, 1_000 * 1e6);
    }

    function test_ownerCanPauseAndBuyReverts() public {
        vm.prank(owner);
        sale.pause();

        vm.startPrank(buyer);
        usdt.approve(address(sale), type(uint256).max);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        sale.buy(buyer, 10 * 1e6, 1);
        vm.stopPrank();
    }

    function test_buyWorksAfterUnpause() public {
        vm.prank(owner);
        sale.pause();
        vm.prank(owner);
        sale.unpause();

        vm.startPrank(buyer);
        usdt.approve(address(sale), type(uint256).max);
        sale.buy(buyer, 10 * 1e6, 1);
        vm.stopPrank();
        assertGt(sale.soldPpl(), 0);
    }

    function test_nonOwnerCannotPause() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, buyer));
        sale.pause();
    }

    /// Ownable2Step: the new owner must explicitly accept before control transfers.
    function test_ownershipTransferRequiresAcceptance() public {
        address newOwner = address(0x4567);
        vm.prank(owner);
        sale.transferOwnership(newOwner);
        assertEq(sale.owner(), owner, "pending until accepted");

        vm.prank(newOwner);
        sale.acceptOwnership();
        assertEq(sale.owner(), newOwner);
    }
}

// ---------------------------------------------------------------------- AUD-M9

contract AuditMediumsA_MerchantEscrowTest is Test {
    MerchantEscrow escrow;
    address merchant = address(0xA11CE);
    address customer = address(0xC0FFEE);
    uint256 minDuration;
    uint256 claimWindow;

    function setUp() public {
        escrow = new MerchantEscrow(address(this));
        vm.deal(customer, 5 ether);
        minDuration = escrow.MIN_ESCROW_DURATION();
        claimWindow = escrow.MERCHANT_CLAIM_WINDOW();
    }

    function _open() internal returns (uint256 id) {
        vm.prank(customer);
        id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
    }

    /// Before the merchant's claim window elapses, the customer cannot self-refund — closing
    /// the race the audit flagged, where both paths were open simultaneously after deadline.
    function test_customerCannotSelfRefundDuringMerchantClaimWindow() public {
        uint256 id = _open();
        vm.warp(block.timestamp + minDuration + 1);
        vm.prank(customer);
        vm.expectRevert(MerchantEscrow.DeadlineNotReached.selector);
        escrow.refundCustomer(id);

        vm.warp(block.timestamp + claimWindow - 2);
        vm.prank(customer);
        vm.expectRevert(MerchantEscrow.DeadlineNotReached.selector);
        escrow.refundCustomer(id);
    }

    function test_customerCanSelfRefundAfterMerchantClaimWindowElapses() public {
        uint256 id = _open();
        vm.warp(block.timestamp + minDuration + claimWindow + 1);
        vm.prank(customer);
        escrow.refundCustomer(id);
        assertEq(customer.balance, 5 ether);
    }

    function test_merchantCanClaimInsideWindow() public {
        uint256 id = _open();
        vm.warp(block.timestamp + minDuration + claimWindow - 1);
        vm.prank(merchant);
        escrow.claimRelease(id);
        assertEq(merchant.balance, 1 ether);
    }

    /// Once the merchant's exclusive window elapses they lose the unilateral claim path too —
    /// from then on only a merchant/owner-initiated refund or a dispute can move the funds.
    function test_merchantCannotClaimAfterWindowElapses() public {
        uint256 id = _open();
        vm.warp(block.timestamp + minDuration + claimWindow + 1);
        vm.prank(merchant);
        vm.expectRevert(MerchantEscrow.ClaimWindowElapsed.selector);
        escrow.claimRelease(id);
    }

    /// The merchant can still refund the customer at any time while Locked, deadline or not.
    function test_merchantCanRefundCustomerAnytime() public {
        uint256 id = _open();
        vm.prank(merchant);
        escrow.refundCustomer(id);
        assertEq(customer.balance, 5 ether);
    }
}

// ---------------------------------------------------------------------- AUD-M11

contract AuditMediumsA_GovernanceClockTest is Test {
    GovernanceToken gov;
    PeopleTimelock timelock;
    PeopleGovernor governor;

    function setUp() public {
        timelock = new PeopleTimelock(2 days);
        gov = new GovernanceToken(address(timelock));
        governor = new PeopleGovernor(gov, timelock);
    }

    /// Chain 97401 blocks are ~4 s, not the 12 s `GovernorSettings`/`ERC20Votes` defaults assume.
    /// The token's clock must report wall-clock time, and the governor's delay/period must be
    /// real seconds (1 day / 7 days), not a block count calibrated for a different chain.
    function test_clockModeIsTimestamp() public view {
        assertEq(gov.CLOCK_MODE(), "mode=timestamp");
        assertEq(gov.clock(), uint48(block.timestamp));
    }

    function test_votingDelayAndPeriodAreInSeconds() public view {
        assertEq(governor.votingDelay(), 1 days);
        assertEq(governor.votingPeriod(), 7 days);
    }

    /// The clock must track wall-clock time, not block number: advancing the block number
    /// alone (no time warp) must not move it.
    function test_clockIsIndependentOfBlockNumber() public {
        uint256 ts = block.timestamp;
        vm.roll(block.number + 1_000_000);
        assertEq(gov.clock(), ts);

        vm.warp(ts + 1);
        assertEq(gov.clock(), ts + 1);
    }
}

// ---------------------------------------------------------------------- AUD-M12

contract AuditMediumsA_PeopleProtocolRegistryTest is Test {
    PeopleProtocolRegistry registry;
    address factoryA = address(0x1111);
    address factoryB = address(0x2222);

    function setUp() public {
        registry = new PeopleProtocolRegistry();
    }

    /// Pre-fix this was deployer-only and one-shot; a wrong or retired factory address could
    /// never be fixed without redeploying the whole registry.
    function test_ownerCanRotateTokenFactory() public {
        registry.setTokenFactory(factoryA);
        assertEq(registry.tokenFactoryAddress(), factoryA);

        registry.setTokenFactory(factoryB);
        assertEq(registry.tokenFactoryAddress(), factoryB);
    }

    function test_nonOwnerCannotSetTokenFactory() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xBAD)));
        registry.setTokenFactory(factoryA);
    }

    function test_zeroAddressRejected() public {
        vm.expectRevert(PeopleProtocolRegistry.ZeroAddress.selector);
        registry.setTokenFactory(address(0));
    }

    function test_ownershipRotatesToNewOwner() public {
        address newOwner = address(0x9999);
        registry.transferOwnership(newOwner);
        assertEq(registry.owner(), newOwner);

        vm.prank(newOwner);
        registry.setTokenFactory(factoryA);
        assertEq(registry.tokenFactoryAddress(), factoryA);
    }
}
