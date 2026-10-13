// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeoplePair} from "../src/amm/PeoplePair.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleProjectToken} from "../src/token/PeopleProjectToken.sol";

contract PlainToken is ERC20 {
    constructor() ERC20("Plain", "PLN") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

/// Regression tests for audit M07-1 (PeoplePair.burn) and M07-2 (pre-created pair / router ratio).
contract PeopleAmmTest is Test {
    PeopleProtocolRegistry internal registry;
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal curve;
    PeopleRouter internal router;
    WPPL internal wppl;
    PeopleAmmFactory internal ammFactory;
    PlainToken internal plain;

    address internal fee = address(0xFEE);
    address internal creator = address(0xC0FFEE);
    address internal alice = address(0xA11CE);
    address internal mallory = address(0xBAD);

    function setUp() public {
        registry = new PeopleProtocolRegistry();
        wppl = new WPPL();
        ammFactory = new PeopleAmmFactory(address(registry));
        router = new PeopleRouter(address(ammFactory), wppl);
        curve = new BondingCurveMarket(address(registry), fee, router, ammFactory, address(this), address(0x7EA5));
        CreatorVesting vesting = new CreatorVesting(address(registry));
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(fee, curve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));

        plain = new PlainToken();
        plain.transfer(alice, 1_000 ether);
        plain.transfer(mallory, 1_000 ether);
        vm.deal(creator, 10 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(mallory, 1_000 ether);
    }

    function _peopleToken() internal returns (PeopleProjectToken t) {
        vm.prank(creator);
        t = PeopleProjectToken(
            tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Victim", "VIC", 18, 1_000_000_000 ether, "")
        );
    }

    function _addPlain(address who, uint256 tokenAmt, uint256 nativeAmt) internal returns (uint256 lp) {
        vm.startPrank(who);
        plain.approve(address(router), tokenAmt);
        (,, lp) = router.addLiquidityETH{value: nativeAmt}(address(plain), tokenAmt, 0, 0, who, block.timestamp);
        vm.stopPrank();
    }

    /// Exit through the pair directly (holder burns their own LP, no parking step).
    function _burn(address who, PeoplePair pair, uint256 lp) internal returns (uint256 wOut, uint256 tOut) {
        uint256 w0 = wppl.balanceOf(who);
        uint256 t0 = plain.balanceOf(who);
        vm.prank(who);
        pair.burn(who, who, lp);
        wOut = wppl.balanceOf(who) - w0;
        tOut = plain.balanceOf(who) - t0;
    }

    /// Exit through the router (allowance-based, atomic, pays native PPL).
    function _removeViaRouter(address who, uint256 lp, uint256 minToken, uint256 minEth)
        internal
        returns (uint256 tOut, uint256 ethOut)
    {
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(plain), address(wppl)));
        uint256 t0 = plain.balanceOf(who);
        uint256 e0 = who.balance;
        vm.startPrank(who);
        pair.approve(address(router), lp);
        router.removeLiquidityETH(address(plain), lp, minToken, minEth, who, block.timestamp);
        vm.stopPrank();
        tOut = plain.balanceOf(who) - t0;
        ethOut = who.balance - e0;
    }

    // ------------------------------------------------------------------ M07-1

    function test_secondLpWithdrawsOnlyItsShare() public {
        _addPlain(alice, 10 ether, 10 ether);
        uint256 lpMal = _addPlain(mallory, 10 ether, 10 ether);
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(plain), address(wppl)));

        (uint256 wOut, uint256 tOut) = _burn(mallory, pair, lpMal);
        assertLe(wOut, 10 ether, "mallory got more WPPL than deposited");
        assertLe(tOut, 10 ether, "mallory got more tokens than deposited");
        assertGe(wOut, 10 ether - 1e6, "mallory lost her deposit");

        // Alice can still withdraw her own half.
        (uint256 wA,) = _burn(alice, pair, pair.balanceOf(alice));
        assertGe(wA, 10 ether - 1e6);
        assertLe(wA, 10 ether);
    }

    function test_majorityLpWithdrawsAllInOneCall() public {
        uint256 lpA = _addPlain(alice, 30 ether, 30 ether);
        _addPlain(mallory, 10 ether, 10 ether);
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(plain), address(wppl)));
        (uint256 wOut,) = _burn(alice, pair, lpA);
        assertLe(wOut, 30 ether);
        assertGe(wOut, 30 ether - 1e6);
        (uint256 r0, uint256 r1,) = pair.getReserves();
        assertGe(r0, 10 ether - 1e6);
        assertGe(r1, 10 ether - 1e6);
    }

    // ------------------------------------------------------------------ M07-2

    function test_cannotPrecreatePairBeforeMigration() public {
        PeopleProjectToken t = _peopleToken();
        vm.startPrank(mallory);
        curve.buy{value: 20 ether}(address(t), 0);
        vm.expectRevert(abi.encodeWithSelector(PeopleAmmFactory.CurveNotMigrated.selector, address(t)));
        ammFactory.createPair(address(t), address(wppl));

        uint256 tok = t.balanceOf(mallory);
        t.approve(address(router), tok);
        vm.expectRevert(abi.encodeWithSelector(PeopleAmmFactory.CurveNotMigrated.selector, address(t)));
        router.addLiquidityETH{value: 1 ether}(address(t), tok, 0, 0, mallory, block.timestamp);
        vm.stopPrank();
    }

    function test_migrationLiquidityIsLockedAtDead() public {
        PeopleProjectToken t = _peopleToken();
        vm.prank(alice);
        curve.buy{value: 200 ether}(address(t), 0);
        assertTrue(curve.isMigrated(address(t)));
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(t), address(wppl)));
        assertTrue(address(pair) != address(0));
        assertEq(pair.balanceOf(address(0xdead)), pair.totalSupply(), "all migration LP on 0xdead");

        // After migration the token can be listed elsewhere.
        vm.prank(mallory);
        ammFactory.createPair(address(t), address(plain));
    }

    function test_addLiquidityUsesPairRatioAndRefundsSurplus() public {
        // Pair at 1 token : 2 WPPL.
        _addPlain(alice, 10 ether, 20 ether);
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(plain), address(wppl)));

        uint256 balBefore = mallory.balance;
        vm.startPrank(mallory);
        plain.approve(address(router), 5 ether);
        (uint256 amountToken, uint256 amountETH,) =
            router.addLiquidityETH{value: 20 ether}(address(plain), 5 ether, 0, 0, mallory, block.timestamp);
        vm.stopPrank();
        assertEq(amountToken, 5 ether);
        assertEq(amountETH, 10 ether, "native added at the pair ratio");
        assertEq(balBefore - mallory.balance, 10 ether, "surplus native refunded");
        (uint256 r0, uint256 r1,) = pair.getReserves();
        (uint256 rT, uint256 rE) = address(plain) == pair.token0() ? (r0, r1) : (r1, r0);
        assertEq(rT, 15 ether);
        assertEq(rE, 30 ether);
    }

    function test_addLiquidityMinimumsApplyToActualAmounts() public {
        _addPlain(alice, 10 ether, 20 ether);
        vm.startPrank(mallory);
        plain.approve(address(router), 5 ether);
        // Desired 5 tokens / 5 native at a 1:2 pair → only 2.5 tokens are used; min 5 must revert.
        vm.expectRevert(PeopleRouter.Slippage.selector);
        router.addLiquidityETH{value: 5 ether}(address(plain), 5 ether, 5 ether, 0, mallory, block.timestamp);
        // Native min above what the ratio requires must revert as well.
        vm.expectRevert(PeopleRouter.Slippage.selector);
        router.addLiquidityETH{value: 20 ether}(address(plain), 5 ether, 0, 11 ether, mallory, block.timestamp);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ AUD-C1

    /// The pre-fix exit was `pair.transfer(pair, lp)` in one tx and `pair.burn(me)` in the next,
    /// which any observer could win by calling `burn(attacker)` first. There is no longer a
    /// signature that pays out LP parked on the pair, so the race has nothing to win.
    function test_parkedLpCannotBeClaimedByAnyone() public {
        uint256 lp = _addPlain(alice, 10 ether, 10 ether);
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(plain), address(wppl)));
        vm.prank(alice);
        pair.transfer(address(pair), lp);
        // Mallory cannot burn the parked LP for herself: the pair's own balance is not hers,
        // and it has given her no allowance over it.
        vm.prank(mallory);
        vm.expectRevert();
        pair.burn(address(pair), mallory, lp);
        assertEq(plain.balanceOf(mallory), 1_000 ether, "mallory gained nothing");
        assertEq(wppl.balanceOf(mallory), 0);
    }

    /// A third party cannot burn someone else's LP without an allowance.
    function test_cannotBurnAnotherHoldersLp() public {
        uint256 lp = _addPlain(alice, 10 ether, 10 ether);
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(plain), address(wppl)));
        vm.prank(mallory);
        vm.expectRevert();
        pair.burn(alice, mallory, lp);
        assertEq(pair.balanceOf(alice), lp, "alice keeps her position");
    }

    /// The router exit is a single transaction: approve + removeLiquidityETH, paid in native PPL.
    function test_routerRemoveLiquidityIsAtomicAndPaysNative() public {
        uint256 lp = _addPlain(alice, 10 ether, 10 ether);
        (uint256 tOut, uint256 ethOut) = _removeViaRouter(alice, lp, 0, 0);
        assertGe(tOut, 10 ether - 1e6, "tokens returned");
        assertLe(tOut, 10 ether);
        assertGe(ethOut, 10 ether - 1e6, "native returned");
        assertLe(ethOut, 10 ether);
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(plain), address(wppl)));
        assertEq(pair.balanceOf(alice), 0);
        assertEq(wppl.balanceOf(address(router)), 0, "router keeps no wrapped dust");
    }

    /// Minimums are enforced against what the burn actually returned, before any payout.
    function test_routerRemoveLiquidityHonoursMinimums() public {
        uint256 lp = _addPlain(alice, 10 ether, 10 ether);
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(plain), address(wppl)));
        vm.startPrank(alice);
        pair.approve(address(router), lp);
        vm.expectRevert(PeopleRouter.Slippage.selector);
        router.removeLiquidityETH(address(plain), lp, 11 ether, 0, alice, block.timestamp);
        vm.expectRevert(PeopleRouter.Slippage.selector);
        router.removeLiquidityETH(address(plain), lp, 0, 11 ether, alice, block.timestamp);
        vm.stopPrank();
        assertEq(pair.balanceOf(alice), lp, "position untouched on revert");
    }

    /// An expired deadline must not execute.
    function test_routerRemoveLiquidityRespectsDeadline() public {
        uint256 lp = _addPlain(alice, 10 ether, 10 ether);
        PeoplePair pair = PeoplePair(ammFactory.getPair(address(plain), address(wppl)));
        vm.warp(block.timestamp + 100);
        vm.startPrank(alice);
        pair.approve(address(router), lp);
        vm.expectRevert(PeopleRouter.Expired.selector);
        router.removeLiquidityETH(address(plain), lp, 0, 0, alice, block.timestamp - 1);
        vm.stopPrank();
    }
}
