// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {LavkaPayments} from "../src/lavka/LavkaPayments.sol";
import {MerchantEscrow} from "../src/lavka/MerchantEscrow.sol";
import {PeoplePair} from "../src/amm/PeoplePair.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";

contract PlainToken is ERC20 {
    constructor() ERC20("Plain", "PLN") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

/// PoC regression tests for Session 2 of the 2026-10-12 audit (S2-01, S2-02, S2-03). Each test
/// demonstrably fails against the pre-fix source (reverted with `git stash` / checked out at
/// the parent commit) and passes against the fixed source in this PR.
contract SecurityAuditS2Test is Test {
    // ---------------------------------------------------------------- S2-01

    /// Before the fix: `CommunityTokenVault` has no `receive`/`fallback`, so the native-PPL
    /// push to it in `_send` reverted with "split" and bricked every single `payMerchant` call,
    /// 100% of the time, regardless of amount. This is the real live bucket shape (confirmed on
    /// chain 97401), not a synthetic mock.
    function testPayMerchantDoesNotBrickOnNonPayableBucket() public {
        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), address(this));
        address treasury = address(0xC1);
        address validators = address(0xC2);
        address liquidity = address(0xC3);
        address growth = address(0xC4);
        LavkaPayments pay =
            new LavkaPayments(address(this), address(vault), treasury, validators, liquidity, growth);

        address merchant = address(0xA11CE);
        vm.deal(address(this), 10 ether);

        // Pre-fix this reverts with "split". Post-fix the checkout completes and the
        // community slice accrues instead of reverting the whole payment.
        pay.payMerchant{value: 10 ether}(merchant, bytes32("memo"));

        uint256 fee = (10 ether * uint256(pay.protocolFeeBps())) / 10_000;
        uint256 communityShare = (fee * 2500) / 10_000;
        assertEq(merchant.balance, 10 ether - fee, "merchant still gets paid");
        assertEq(pay.owed(address(vault)), communityShare, "rejected slice accrues, not lost");
        assertEq(validators.balance, (fee * 3000) / 10_000, "other buckets still paid normally");

        // Governance can rescue the accrued balance to a payable address.
        address rescue = address(0xBEEF);
        pay.withdrawAccrued(address(vault), rescue);
        assertEq(rescue.balance, communityShare);
        assertEq(pay.owed(address(vault)), 0);
    }

    // ---------------------------------------------------------------- S2-02

    /// Before the fix: `autoCloseDispute` hardcoded `refundCustomer_ = true`, so any customer
    /// could open a free, cost-free dispute and simply wait out `DISPUTE_AUTO_CLOSE_WINDOW` to
    /// walk away with 100% of the escrow even with no evidence or merit. After the fix, an
    /// auto-close with nobody adjudicating splits the funds 50/50 instead of handing the
    /// customer a free win.
    function testAutoCloseDisputeSplitsInsteadOfAlwaysRefundingCustomer() public {
        MerchantEscrow escrow = new MerchantEscrow(address(this));
        address merchant = address(0xA11CE);
        address customer = address(0xC0FFEE);
        vm.deal(customer, 5 ether);

        uint64 deadline = uint64(block.timestamp + escrow.MIN_ESCROW_DURATION());
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 2 ether}(merchant, deadline, bytes32(0));

        // Customer opens a dispute for free, with no bond or evidence requirement.
        vm.prank(customer);
        escrow.openDispute(id);

        vm.warp(block.timestamp + escrow.DISPUTE_AUTO_CLOSE_WINDOW() + 1);
        escrow.autoCloseDispute(id);
        vm.prank(customer);
        escrow.withdrawPending();
        vm.prank(merchant);
        escrow.withdrawPending();

        // Pre-fix: customer.balance == 5 ether (full refund, the free win).
        // Post-fix: the 2 ether is split 50/50.
        assertEq(customer.balance, 4 ether, "customer no longer wins 100% by default");
        assertEq(merchant.balance, 1 ether, "merchant gets their half too");
        (,,,, MerchantEscrow.Status status,,) = escrow.escrows(id);
        assertEq(uint8(status), uint8(MerchantEscrow.Status.Split));
    }

    // ---------------------------------------------------------------- S2-03

    /// Before the fix: `sync()` was callable by anyone even on a pair that was never minted
    /// (`totalSupply() == 0`), so an attacker could donate a 1-wei-skewed balance and call
    /// `sync()` to desync reserves before the first real `mint`, permanently bricking it via a
    /// divide-by-zero in `AmmMath.mintProportional`. After the fix, `sync()` reverts pre-mint.
    function testSyncRevertsBeforeFirstMint() public {
        PlainToken tokenA = new PlainToken();
        PlainToken tokenB = new PlainToken();
        PeoplePair pair = new PeoplePair();
        pair.initialize(address(tokenA), address(tokenB));

        // Attacker donates a skewed 1-wei balance directly to the pair, pre-mint.
        tokenA.transfer(address(pair), 1);

        vm.expectRevert(PeoplePair.Forbidden.selector);
        pair.sync();

        // The pair is still mintable normally afterwards (not bricked).
        tokenA.transfer(address(pair), 1_000 ether - 1);
        tokenB.transfer(address(pair), 1_000 ether);
        uint256 liquidity = pair.mint(address(this));
        assertGt(liquidity, 0);
    }
}
