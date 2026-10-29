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
import {CurveMath} from "../src/libs/CurveMath.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";

/// S1-01: `CurveMath.calculateSell` priced trades off a stale `invariantK` and never rejected
/// `tokenAmount == 0`, so a zero-token "sell" paid out real native PPL from the curve's reserve.
/// This PoC mirrors the audit's exploit: a low-decimals token (small raw curve allocation, where
/// the ceil-rounding residue is material) is bought into once, then "sold" with zero tokens in a
/// loop, each call draining a sliver of native PPL for free.
contract PocCurveZeroSellDrainTest is Test {
    PeopleProtocolRegistry internal registry;
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal bondingCurve;

    address internal victim = address(0xA11CE);
    address internal attacker = address(0xBEEF);
    address internal feeRecipient = address(0xFEE);
    address internal treasury = address(0x7EA5);

    function setUp() public {
        registry = new PeopleProtocolRegistry();
        WPPL wppl = new WPPL();
        PeopleAmmFactory ammFactory = new PeopleAmmFactory(address(registry));
        PeopleRouter router = new PeopleRouter(address(ammFactory), wppl);
        bondingCurve =
            new BondingCurveMarket(address(registry), feeRecipient, router, ammFactory, address(this), treasury);
        CreatorVesting vesting = new CreatorVesting(address(registry));
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(feeRecipient, bondingCurve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));

        vm.deal(victim, 1_000 ether);
        vm.deal(attacker, 5 ether);
    }

    /// Before the fix: zero tokens in, non-zero native PPL out, repeatable with zero capital.
    /// After the fix: `calculateSell`/`sell` reverts with `InsufficientInput` on a zero amount.
    function test_zeroTokenSellCannotDrainNativePpl() public {
        vm.prank(attacker);
        address token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Tiny Token", "TT", 0, 1000, ""
        );

        vm.prank(victim);
        bondingCurve.buy{value: 10 ether}(token, 1, block.timestamp);

        uint256 attackerBalBefore = attacker.balance;
        vm.prank(attacker);
        vm.expectRevert(CurveMath.InsufficientInput.selector);
        bondingCurve.sell(token, 0, 1, block.timestamp);

        assertEq(attacker.balance, attackerBalBefore, "zero-token sell must not pay out any native PPL");
    }

    /// Even granting the attacker a handful of free "harvest" attempts via repeated buys, no
    /// amount of zero-token sells may ever extract native PPL: the invariant is re-derived after
    /// every trade, so no residue accrues to a later zero-amount trader.
    function test_repeatedZeroTokenSellsNeverExtractValue() public {
        vm.prank(attacker);
        address token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Tiny Token", "TT", 6, 1_000_000_000, ""
        );

        uint256 attackerBalBefore = attacker.balance;
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(victim);
            bondingCurve.buy{value: 10 ether}(token, 1, block.timestamp);

            vm.prank(attacker);
            vm.expectRevert(CurveMath.InsufficientInput.selector);
            bondingCurve.sell(token, 0, 1, block.timestamp);
        }
        assertEq(attacker.balance, attackerBalBefore, "attacker token balance is zero throughout; no PPL extracted");
    }
}
