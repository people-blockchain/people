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
import {NftFactory} from "../src/nft/NftFactory.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";

/// @notice RA round 3 (2026-10-09): targeted PoC/regression tests for paths the prior rounds'
/// unit suites did not exercise end to end — `BondingCurveMarket.sell()` against the live
/// contract (only the `CurveMath` library was unit-tested before), the full migration reserve
/// split, post-migration curve shutdown, and direct-caller `onlyOwner` gates on the fee setters
/// that were previously only exercised via the multisig wrapper. All passed — no new fix needed;
/// kept as regression coverage.
contract Reaudit20261009Test is Test {
    PeopleProtocolRegistry internal registry;
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal bondingCurve;
    PeopleRouter internal router;
    WPPL internal wppl;
    PeopleAmmFactory internal ammFactory;
    NftFactory internal nftFactory;

    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xBEEF);
    address internal feeRecipient = address(0xFEE);

    function setUp() public {
        registry = new PeopleProtocolRegistry();
        wppl = new WPPL();
        ammFactory = new PeopleAmmFactory(address(registry));
        router = new PeopleRouter(address(ammFactory), wppl);
        bondingCurve =
            new BondingCurveMarket(address(registry), feeRecipient, router, ammFactory, address(this), address(0x7EA5));
        CreatorVesting vesting = new CreatorVesting(address(registry));
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(feeRecipient, bondingCurve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));
        nftFactory = new NftFactory(feeRecipient, address(registry), address(this));
        vm.deal(creator, 1_000_000 ether);
        vm.deal(trader, 1_000_000 ether);
    }

    function _createToken() internal returns (address token) {
        vm.prank(creator);
        token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Reaudit Test", "RAT", 6, 1_000_000_000, "ipfs://meta"
        );
    }

    /// Public-getter flattening of `curves(token)`: `State` (8 fields) then the three
    /// `TokenCurve` fields, in declaration order.
    struct CurveSnapshot {
        uint256 virtualTokenReserve;
        uint256 virtualNativeReserve;
        uint256 actualNativeReserve;
        uint256 currentTokenReserve;
        uint256 invariantK;
        uint256 migrationThreshold;
        bool active;
        bool migrated;
        uint256 liquidityReserve;
        uint256 ecosystemReserve;
        uint256 curveInventory;
    }

    function _snapshot(address token) internal view returns (CurveSnapshot memory s) {
        (CurveMath.State memory raw, uint256 liquidityReserve, uint256 ecosystemReserve, uint256 curveInventory) =
            bondingCurve.curves(token);
        s.virtualTokenReserve = raw.virtualTokenReserve;
        s.virtualNativeReserve = raw.virtualNativeReserve;
        s.actualNativeReserve = raw.actualNativeReserve;
        s.currentTokenReserve = raw.currentTokenReserve;
        s.invariantK = raw.invariantK;
        s.migrationThreshold = raw.migrationThreshold;
        s.active = raw.active;
        s.migrated = raw.migrated;
        s.liquidityReserve = liquidityReserve;
        s.ecosystemReserve = ecosystemReserve;
        s.curveInventory = curveInventory;
    }

    /// @notice `sell()` was previously only exercised against the `CurveMath` library in
    /// isolation. This drives it through the live `BondingCurveMarket`: buy, then sell part of
    /// it back, and check every balance moves by exactly the amount the math promises — no
    /// tokens or native currency created or destroyed, fee paid once, k (the virtual-reserve
    /// product) never decreases.
    function test_buyThenSell_conservesFundsAndInvariant() public {
        address token = _createToken();
        PeopleProjectToken t = PeopleProjectToken(token);
        uint256 kBefore = _snapshot(token).invariantK;

        vm.prank(trader);
        bondingCurve.buy{value: 5 ether}(token, 0);
        uint256 tokensHeld = t.balanceOf(trader);
        assertGt(tokensHeld, 0);
        assertGe(_snapshot(token).invariantK, kBefore, "k must not decrease on buy");

        uint256 sellAmount = tokensHeld / 2;
        uint256 marketTokenBalanceBeforeSell = t.balanceOf(address(bondingCurve));
        uint256 marketNativeBefore = address(bondingCurve).balance;
        uint256 traderNativeBefore = trader.balance;
        uint256 feeRecipientBefore = feeRecipient.balance;
        uint256 kAfterBuy = _snapshot(token).invariantK;

        vm.prank(trader);
        t.approve(address(bondingCurve), sellAmount);
        vm.prank(trader);
        bondingCurve.sell(token, sellAmount, 0);

        assertEq(t.balanceOf(trader), tokensHeld - sellAmount, "sold tokens left the seller");
        assertEq(
            t.balanceOf(address(bondingCurve)),
            marketTokenBalanceBeforeSell + sellAmount,
            "sold tokens landed back on the curve"
        );
        uint256 netOut = trader.balance - traderNativeBefore;
        uint256 feePaid = feeRecipient.balance - feeRecipientBefore;
        assertGt(netOut, 0, "seller received native currency");
        assertGt(feePaid, 0, "fee recipient was paid");
        assertEq(
            marketNativeBefore - address(bondingCurve).balance,
            netOut + feePaid,
            "market balance moved by exactly payout+fee"
        );
        assertGe(_snapshot(token).invariantK, kAfterBuy, "k must not decrease on sell");
    }

    /// @notice Selling more tokens than the curve ever received native currency for must revert
    /// cleanly (`CurveMath.calculateSell`'s `InsufficientInput`/`InsufficientLiquidity` guard),
    /// not underflow or pay out native currency the curve never received.
    function test_sell_revertsWhenExceedingActualReserve() public {
        address token = _createToken();
        PeopleProjectToken t = PeopleProjectToken(token);

        vm.prank(trader);
        bondingCurve.buy{value: 1 ether}(token, 0);
        uint256 tokensHeld = t.balanceOf(trader);

        vm.prank(trader);
        t.approve(address(bondingCurve), type(uint256).max);
        vm.prank(trader);
        vm.expectRevert();
        bondingCurve.sell(token, tokensHeld * 1000, 0);
    }

    /// @notice Drive the curve to migration with a large buy, then check: the ecosystem reserve
    /// (never touched by migration) is untouched, the pool actually received tokens, and the
    /// curve is fully shut down afterwards — no further buy/sell against it.
    function test_migration_untouchedEcosystemReserveAndShutsDownCurve() public {
        address token = _createToken();
        PeopleProjectToken t = PeopleProjectToken(token);

        CurveSnapshot memory before = _snapshot(token);
        uint256 marketTokenBalanceBefore = t.balanceOf(address(bondingCurve));
        assertEq(
            marketTokenBalanceBefore,
            before.liquidityReserve + before.ecosystemReserve + before.curveInventory,
            "curve's token balance must equal the sum of its three reserve buckets pre-migration"
        );

        // A large buy relative to the curve inventory triggers migration (threshold is
        // `curveInventory0 / 3`, see `CurveMath.initialState`).
        vm.prank(trader);
        bondingCurve.buy{value: 500 ether}(token, 0);
        assertTrue(bondingCurve.isMigrated(token), "expected migration to have fired");

        CurveSnapshot memory after_ = _snapshot(token);
        assertEq(
            after_.ecosystemReserve, before.ecosystemReserve, "ecosystem reserve must be untouched by migration"
        );
        assertFalse(after_.active, "curve must be inactive post-migration");

        address pair = ammFactory.getPair(token, address(wppl));
        assertTrue(pair != address(0), "pair must exist after migration");
        assertGt(t.balanceOf(pair), 0, "pair must hold tokens after migration");

        vm.prank(trader);
        vm.expectRevert(BondingCurveMarket.UnknownToken.selector);
        bondingCurve.buy{value: 1 ether}(token, 0);

        vm.prank(trader);
        t.approve(address(bondingCurve), 1);
        vm.prank(trader);
        vm.expectRevert(BondingCurveMarket.UnknownToken.selector);
        bondingCurve.sell(token, 1, 0);
    }

    /// @notice `withdrawEcosystemReserve` is `onlyOwner` — confirm a non-owner (e.g. the token
    /// creator, who has no special rights over the curve) cannot drain another token's
    /// ecosystem reserve.
    function test_withdrawEcosystemReserve_revertsForNonOwner() public {
        address token = _createToken();
        vm.prank(creator);
        vm.expectRevert();
        bondingCurve.withdrawEcosystemReserve(token, creator, 1);
    }

    /// @notice `TokenFactory.setFeeRecipient` / `NftFactory.setFeeRecipient` called directly
    /// (not through the multisig wrapper, which `PeopleMultisig.t.sol` already covers) must
    /// still reject non-owner callers and the zero address.
    function test_factoryFeeRecipientSetters_rejectNonOwnerAndZero() public {
        vm.prank(creator);
        vm.expectRevert();
        tokenFactory.setFeeRecipient(creator);

        vm.expectRevert();
        tokenFactory.setFeeRecipient(address(0));

        tokenFactory.setFeeRecipient(address(0xCAFE));
        assertEq(tokenFactory.feeRecipient(), address(0xCAFE));

        vm.prank(creator);
        vm.expectRevert();
        nftFactory.setFeeRecipient(creator);

        vm.expectRevert();
        nftFactory.setFeeRecipient(address(0));

        nftFactory.setFeeRecipient(address(0xCAFE));
        assertEq(nftFactory.feeRecipient(), address(0xCAFE));
    }

    /// @notice `NftFactory.mint` is gated to the collection's own creator (`creatorOf`) — a
    /// non-creator (even one who pays the fee) must not be able to mint into someone else's
    /// collection, and the fee must never move on a rejected call.
    function test_nftMint_rejectsNonCreatorAndDoesNotChargeFee() public {
        vm.prank(creator);
        address collection = nftFactory.createCollection("Reaudit Collection", "RAC");

        address attacker = address(0xA77AC4);
        vm.deal(attacker, 10 ether);
        uint256 feeRecipientBefore = feeRecipient.balance;

        vm.prank(attacker);
        vm.expectRevert(NftFactory.Unauthorized.selector);
        nftFactory.mint{value: PeopleConstants.NFT_MINT_FEE}(collection, "ipfs://x");

        assertEq(feeRecipient.balance, feeRecipientBefore, "rejected mint must not move the fee");
    }
}
