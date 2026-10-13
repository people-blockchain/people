// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommunityAgentWallet} from "../src/agent/CommunityAgentWallet.sol";

contract CommunityAgentWalletTest is Test {
    CommunityAgentWallet wallet;
    address executor = address(0xA11CE);
    address timelock = address(0x71);
    address recipient = address(0xFEE);
    address guardian = address(0x6D1A);

    function setUp() public {
        wallet = new CommunityAgentWallet(executor, timelock, recipient, guardian);
        vm.deal(address(wallet), 100 ether);
    }

    /// Raise the per-transaction cap so only the daily/weekly budgets can bind.
    function _loosenPerTx(uint256 maxPerTx) internal {
        vm.prank(timelock);
        wallet.setLimits(
            CommunityAgentWallet.Limits({
                maxPerTx: maxPerTx,
                maxPerDay: 5 ether,
                maxPerWeek: 20 ether,
                whitelistEnabled: true,
                frozen: false
            })
        );
    }

    /// An authorization consumes the daily budget exactly like a spend does.
    function testAuthorizePaymentCountsTowardDailyLimit() public {
        _loosenPerTx(10 ether);
        vm.prank(executor);
        wallet.authorizePayment(keccak256("a"), recipient, 3 ether);

        // 3 + 3 = 6 ether exceeds the 5-ether daily budget.
        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.OverLimit.selector);
        wallet.authorizePayment(keccak256("b"), recipient, 3 ether);

        // 3 + 2 fits.
        vm.prank(executor);
        wallet.authorizePayment(keccak256("c"), recipient, 2 ether);
    }

    /// Many per-transaction-sized authorizations must not slip past the cumulative cap.
    function testAuthorizePaymentCannotBypassDailyLimit() public {
        _loosenPerTx(1 ether);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(executor);
            wallet.authorizePayment(keccak256(abi.encode(i)), recipient, 1 ether);
        }

        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.OverLimit.selector);
        wallet.authorizePayment(keccak256("over"), recipient, 1 ether);
    }

    /// Authorizations and spends share one budget (fail closed, never under-counted).
    function testAuthorizeThenSpendCountsBoth() public {
        _loosenPerTx(10 ether);
        vm.prank(executor);
        wallet.authorizePayment(keccak256("a"), recipient, 3 ether);

        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.OverLimit.selector);
        wallet.spend(payable(recipient), 3 ether);
    }

    /// Freeze and whitelist still gate authorizations.
    function testAuthorizeRespectsFreezeAndWhitelist() public {
        vm.prank(timelock);
        wallet.setEmergencyFreeze(true);
        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.Frozen.selector);
        wallet.authorizePayment(keccak256("a"), recipient, 1 ether);

        vm.prank(timelock);
        wallet.setEmergencyFreeze(false);
        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.NotWhitelisted.selector);
        wallet.authorizePayment(keccak256("a"), address(0xBAD), 1 ether);
    }
}
