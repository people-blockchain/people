// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleProjectToken} from "../src/token/PeopleProjectToken.sol";

/// H-01: `CommunityTokenVault.withdraw` used to accept any `to`, so the vault's owner (an
/// ordinary EOA/multisig in production, pre-fix) could sweep the full 10% community allocation
/// of every launched token to an arbitrary, never-approved address in a single call — no
/// allow-list, no separate approval step, nothing distinguishing a legitimate community payout
/// from a straight theft of community funds.
///
/// This PoC proves that path is closed: `withdraw` to an address that was never explicitly
/// allow-listed by `owner()` now reverts `RecipientNotAllowed`, and only succeeds once
/// `setRecipientAllowed` has been called for that exact address by the owner (in production, the
/// `PeopleTimelock`, behind its 2-day delay — see `Deploy.s.sol` and H-02/S1-03).
contract PocCommunityVaultArbitraryWithdrawTest is Test {
    PeopleProtocolRegistry internal registry;
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal bondingCurve;
    CommunityTokenVault internal vault;
    PeopleRouter internal router;
    WPPL internal wppl;
    PeopleAmmFactory internal ammFactory;

    // The vault's `owner()` is `address(this)` in this PoC so the test can call `withdraw`
    // directly, without wrapping it in a multisig/timelock dance that's orthogonal to the
    // specific vulnerability (arbitrary `to`) this PoC demonstrates.
    address internal creator = address(0xC0FFEE);
    address internal feeRecipient = address(0xFEE);
    address internal arbitraryAddress = address(0xBAD1D);

    address internal token;

    function setUp() public {
        registry = new PeopleProtocolRegistry();
        wppl = new WPPL();
        ammFactory = new PeopleAmmFactory(address(registry));
        router = new PeopleRouter(address(ammFactory), wppl);
        bondingCurve =
            new BondingCurveMarket(address(registry), feeRecipient, router, ammFactory, address(this), address(0x7EA5));
        CreatorVesting vesting = new CreatorVesting(address(registry));
        vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(feeRecipient, bondingCurve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));

        vm.deal(creator, 2 ether);
        vm.prank(creator);
        token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "People Test", "PTST", 6, 1_000_000_000, "ipfs://meta"
        );
    }

    /// Fail-before (pre-fix shape): the owner could call `withdraw` straight to any address with
    /// zero setup — a fresh, never-seen-before address starts un-allow-listed and the withdraw
    /// would have succeeded regardless. Pass-after: the exact same call now reverts until that
    /// address is explicitly allow-listed.
    function test_withdrawToNeverAllowlistedAddressReverts() public {
        uint256 amount = vault.balances(token);
        assertGt(amount, 0);

        assertFalse(vault.allowedRecipient(arbitraryAddress), "fresh address starts un-allow-listed");
        vm.expectRevert(abi.encodeWithSelector(CommunityTokenVault.RecipientNotAllowed.selector, arbitraryAddress));
        vault.withdraw(token, arbitraryAddress, amount);

        // The funds never moved.
        assertEq(vault.balances(token), amount);
        assertEq(PeopleProjectToken(token).balanceOf(arbitraryAddress), 0);
    }

    function test_withdrawSucceedsOnlyAfterExplicitAllowlisting() public {
        uint256 amount = vault.balances(token);

        vault.setRecipientAllowed(arbitraryAddress, true);
        assertTrue(vault.allowedRecipient(arbitraryAddress));

        vault.withdraw(token, arbitraryAddress, amount);
        assertEq(PeopleProjectToken(token).balanceOf(arbitraryAddress), amount);
        assertEq(vault.balances(token), 0);
    }

    /// Only `owner()` may grow the allow-list — an attacker who is not the owner cannot
    /// self-allow-list a drain address even if they somehow got a transaction into the vault.
    function test_nonOwnerCannotAllowlistRecipient() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        vault.setRecipientAllowed(arbitraryAddress, true);
    }

    function test_withdrawRejectsNonOwnerRegardlessOfAllowlist() public {
        vault.setRecipientAllowed(arbitraryAddress, true);
        vm.prank(address(0xBAD));
        vm.expectRevert();
        vault.withdraw(token, arbitraryAddress, 1);
    }
}
