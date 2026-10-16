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
import {LavkaPayments} from "../src/lavka/LavkaPayments.sol";

/// @notice Regression tests for the contract Mediums handled on `fix/medium-contracts-c`:
/// AUD-M1 (tokens stranded in `BondingCurveMarket` after a curve migrates) and AUD-M15
/// (`LavkaPayments`' protocol fee was a compile-time constant).
contract AuditMediumsCTest is Test {
    // ------------------------------------------------------------------ AUD-M1

    PeopleProtocolRegistry internal registry;
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal bondingCurve;
    PeopleRouter internal router;
    WPPL internal wppl;
    PeopleAmmFactory internal ammFactory;

    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xBEEF);
    address internal feeRecipient = address(0xFEE);
    /// @dev Stands in for the treasury multisig the owner chose as the AUD-M1 destination.
    address internal treasury = address(0xC949);
    CommunityTokenVault internal vault;
    uint256 internal _communityAlloc;

    function setUp() public {
        registry = new PeopleProtocolRegistry();
        wppl = new WPPL();
        ammFactory = new PeopleAmmFactory(address(registry));
        router = new PeopleRouter(address(ammFactory), wppl);
        bondingCurve = new BondingCurveMarket(address(registry), feeRecipient, router, ammFactory, address(this), treasury);
        CreatorVesting vesting = new CreatorVesting(address(registry));
        vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(feeRecipient, bondingCurve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));
        vm.deal(creator, 1_000_000 ether);
        vm.deal(trader, 1_000_000 ether);
    }

    function _createToken() internal returns (address token) {
        // CommunityPool mode: AUD-M1 asserts leftovers land in the vault (not burn).
        vm.prank(creator);
        token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Mediums C", "AMC", 6, 1_000_000_000, "ipfs://meta", uint16(0), uint8(1)
        );
    }

    /// @notice AUD-M1: before the fix the curve's unsold inventory and unused liquidity reserve
    /// stayed in the market forever (nothing could withdraw them). After migration they must
    /// land on the treasury, the two reserve fields must be cleared, the ecosystem reserve must
    /// be untouched, and no token may be created or destroyed along the way.
    function test_AUD_M1_migrationSweepsLeftoverTokensToCommunityPool() public {
        address token = _createToken();
        PeopleProjectToken t = PeopleProjectToken(token);
        _communityAlloc = vault.balances(token);

        (, uint256 liquidityReserve0, uint256 ecosystemReserve0, uint256 curveInventory0) = bondingCurve.curves(token);
        uint256 marketBalance0 = t.balanceOf(address(bondingCurve));
        assertEq(
            marketBalance0,
            liquidityReserve0 + ecosystemReserve0 + curveInventory0,
            "pre-migration market balance = liquidity + ecosystem + inventory"
        );

        // A buy large enough to cross the migration threshold (curveInventory0 / 3).
        vm.prank(trader);
        bondingCurve.buy{value: 500 ether}(token, 0);
        assertTrue(bondingCurve.isMigrated(token), "expected migration to have fired");

        uint256 tokensToTrader = t.balanceOf(trader);
        uint256 tokensToPair = t.balanceOf(address(ammFactory.getPair(token, address(wppl))));
        uint256 swept = t.balanceOf(address(vault)) - _communityAlloc;
        assertEq(t.balanceOf(treasury), 0, "treasury gets nothing");
        assertGt(swept, 0, "community pool must actually receive the leftovers");
        assertEq(vault.balances(token), _communityAlloc + swept, "pool balance credited");
        assertEq(
            swept,
            liquidityReserve0 + curveInventory0 - tokensToTrader - tokensToPair,
            "pool gets exactly the unsold inventory + unused liquidity reserve"
        );

        (, uint256 liquidityReserve1, uint256 ecosystemReserve1, uint256 curveInventory1) = bondingCurve.curves(token);
        assertEq(curveInventory1, 0, "curve inventory must be cleared once swept");
        assertEq(liquidityReserve1, 0, "liquidity reserve must be cleared once swept");
        assertEq(ecosystemReserve1, ecosystemReserve0, "ecosystem reserve is untouched by the sweep");
        assertEq(t.balanceOf(address(bondingCurve)), ecosystemReserve0, "only the ecosystem reserve stays behind");

        assertEq(
            t.balanceOf(address(bondingCurve)) + tokensToTrader + tokensToPair + swept,
            marketBalance0,
            "no token created or destroyed by buy + migration"
        );
    }

    /// @notice AUD-M1: the treasury is `onlyOwner`, rejects the zero address (a zero sink would
    /// silently strand the leftovers again), and rotation takes effect for the next migration.
    function test_AUD_M1_setTreasuryIsOwnerOnlyAndRejectsZero() public {
        vm.prank(creator);
        vm.expectRevert();
        bondingCurve.setTreasury(creator);

        vm.expectRevert(BondingCurveMarket.ZeroTreasury.selector);
        bondingCurve.setTreasury(address(0));

        bondingCurve.setTreasury(address(0x7EA5E));
        assertEq(bondingCurve.treasury(), address(0x7EA5E));
    }

    function test_AUD_M1_constructorRejectsZeroTreasury() public {
        vm.expectRevert(BondingCurveMarket.ZeroTreasury.selector);
        new BondingCurveMarket(address(registry), feeRecipient, router, ammFactory, address(this), address(0));
    }

    // ------------------------------------------------------------------ AUD-M15

    LavkaPayments internal pay;
    address internal communityVault = address(0xC0);
    address internal lavkaTreasury = address(0x7A);
    address internal validators = address(0xA11);
    address internal liquidity = address(0x11D);
    address internal growth = address(0x620);
    address internal merchant = address(0xE4);

    function _deployPayments() internal {
        pay = new LavkaPayments(address(this), communityVault, lavkaTreasury, validators, liquidity, growth);
        vm.deal(address(this), 100 ether);
    }

    /// @notice AUD-M15: the protocol fee starts at the approved 1% and can be changed by the
    /// owner (governance), but never above the 3% hard cap.
    function test_AUD_M15_feeIsSettableWithHardCap() public {
        _deployPayments();
        assertEq(uint256(pay.protocolFeeBps()), 100, "1% default");

        pay.setProtocolFee(300);
        assertEq(uint256(pay.protocolFeeBps()), 300, "cap itself is allowed");

        vm.expectRevert(LavkaPayments.FeeTooHigh.selector);
        pay.setProtocolFee(301);
        assertEq(uint256(pay.protocolFeeBps()), 300, "rejected update must not change the fee");

        vm.expectRevert(LavkaPayments.FeeTooHigh.selector);
        pay.setProtocolFee(type(uint16).max);
        assertEq(uint256(pay.protocolFeeBps()), 300, "no value above the cap");
    }

    function test_AUD_M15_setFeeIsOwnerOnly() public {
        _deployPayments();
        vm.prank(creator);
        vm.expectRevert();
        pay.setProtocolFee(200);
        assertEq(uint256(pay.protocolFeeBps()), 100);
    }

    /// @notice AUD-M15: `payMerchant` must charge the configured rate, not a constant.
    function test_AUD_M15_payMerchantUsesConfiguredFee() public {
        _deployPayments();
        pay.setProtocolFee(300); // 3%

        uint256 amount = 10 ether;
        uint256 merchantBefore = merchant.balance;
        uint256 validatorsBefore = validators.balance;

        vm.prank(creator);
        pay.payMerchant{value: amount}(merchant, bytes32(0));

        uint256 fee = (amount * 300) / 10_000;
        assertEq(merchant.balance - merchantBefore, amount - fee, "merchant gets the payment minus the 3% fee");
        assertGt(validators.balance - validatorsBefore, 0, "validators received their Model A slice");
        assertEq(address(pay).balance, 0, "no fee dust retained in the contract");
    }

    function testFuzz_AUD_M15_feeNeverExceedsCap(uint16 bps) public {
        _deployPayments();
        if (bps > 300) {
            vm.expectRevert(LavkaPayments.FeeTooHigh.selector);
            pay.setProtocolFee(bps);
            assertEq(uint256(pay.protocolFeeBps()), 100, "over-cap value rejected");
        } else {
            pay.setProtocolFee(bps);
            assertEq(uint256(pay.protocolFeeBps()), uint256(bps), "any value up to the 3% cap is accepted");
        }
    }

    receive() external payable {}
}
