// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {PplCurveHub, PplCurveMath} from "../src/sale/PplCurveHub.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

contract MockToken is ERC20 {
    uint8 internal immutable _d;

    constructor(string memory n, uint8 d_) ERC20(n, n) {
        _d = d_;
    }

    function decimals() public view override returns (uint8) {
        return _d;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Charges a 1% fee on every transfer (must be rejected by the hub).
contract FeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

contract HubHarness is PplCurveHub {
    constructor(address o, address t) PplCurveHub(o, t) {}

    function forceRaised(uint256 r) external {
        raisedUsd6 = r;
        soldPpl = PplCurveMath.soldForRaised(r);
    }

    function ln(uint256 x) external pure returns (uint256) {
        return PplCurveMath.lnWad(x);
    }

    function soldFor(uint256 r) external pure returns (uint256) {
        return PplCurveMath.soldForRaised(r);
    }
}

contract PplCurveHubTest is Test {
    event Bought(address indexed buyer, address token, uint256 amountIn, uint256 pplOut);
    event TokenSet(address indexed token, bool allowed, uint8 decimals);
    event SaleOpened(uint256 openedAt, uint256 closesAt);
    event Graduated(uint256 raisedUsd6, uint256 soldPpl);

    PplCurveHub hub;
    HubHarness harness;
    MockUSDC usdc;
    MockUSDT usdt;
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        usdt = new MockUSDT();
        hub = new PplCurveHub(owner, treasury);
        harness = new HubHarness(owner, treasury);
        vm.startPrank(owner);
        hub.setToken(address(usdc), true);
        hub.setToken(address(usdt), true);
        hub.open();
        harness.setToken(address(usdc), true);
        harness.open();
        vm.stopPrank();
        _fund(alice, usdc, 1_000_000e6, hub);
        _fund(bob, usdc, 1_000_000e6, hub);
        usdt.mint(alice, 1_000_000e6);
        vm.prank(alice);
        usdt.approve(address(hub), type(uint256).max);
    }

    function _fund(address who, MockUSDC t, uint256 amt, PplCurveHub h) internal {
        t.mint(who, amt);
        vm.prank(who);
        t.approve(address(h), type(uint256).max);
    }

    function _buy(address who, uint256 usd6) internal returns (uint256) {
        vm.prank(who);
        return hub.buyWith(address(usdc), usd6, 0);
    }

    function _approxRel(uint256 a, uint256 b, uint256 relWad) internal pure returns (bool) {
        uint256 diff = a > b ? a - b : b - a;
        return diff * 1e18 <= b * relWad;
    }

    // ------------------------------------------------------------------ math

    function test_lnKnownValues() public view {
        assertEq(harness.ln(1e18), 0);
        assertTrue(_approxRel(harness.ln(2e18), 693147180559945309, 1e3)); // ln 2
        assertTrue(_approxRel(harness.ln(50e18), 3912023005428146058, 1e3)); // ln 50
        assertTrue(_approxRel(harness.ln(1e18 + 1e14), 99995000333308, 1e6)); // ln(1.0001)
    }

    /// @dev Reference values from website/src/lib/sale/curve.ts: p0=0.005, k=ln(50)/100.
    /// soldPplForRaisedUsd(1e6)=55,661,239.54797432; (2e6)=71,888,524.49659397; (4e6)=88,827,419.40313987.
    function test_matchesWebsiteCurve() public view {
        assertTrue(_approxRel(harness.soldFor(1_000_000e6), 55_661_239_547974320000000000, 1e9));
        assertTrue(_approxRel(harness.soldFor(2_000_000e6), 71_888_524_496593970000000000, 1e9));
        assertTrue(_approxRel(harness.soldFor(4_000_000e6), 88_827_419_403139870000000000, 1e9));
        assertEq(harness.soldFor(0), 0);
        // first dollars sell at ~p0: 1000 USD / 0.005 = 200,000 PPL less the small curve slope
        uint256 s = harness.soldFor(1_000e6);
        assertLt(s, 200_000e18);
        assertGt(s, 199_000e18);
    }

    // ------------------------------------------------------------------ buy

    function test_buyHappyPath() public {
        uint256 q = hub.quoteBuy(address(usdc), 100e6);
        vm.expectEmit(true, false, false, true, address(hub));
        emit Bought(alice, address(usdc), 100e6, q);
        uint256 out = _buy(alice, 100e6);
        assertEq(out, q);
        assertGt(out, 19_000e18); // ~100/0.005 = 20,000 less slope
        assertEq(hub.purchasedOf(alice), out);
        assertEq(hub.soldPpl(), out);
        assertEq(hub.totalPurchasedPpl(), out);
        assertEq(hub.raisedUsd6(), 100e6);
        assertEq(usdc.balanceOf(treasury), 100e6);
        assertEq(usdc.balanceOf(address(hub)), 0);
        assertEq(usdc.balanceOf(alice), 1_000_000e6 - 100e6);
        assertEq(hub.dailyUsed(alice), 100e6);
        assertEq(hub.nextBuyAt(alice), vm.getBlockTimestamp() + 60);
    }

    function test_buyWithUsdt() public {
        vm.prank(alice);
        uint256 out = hub.buyWith(address(usdt), 50e6, 0);
        assertGt(out, 0);
        assertEq(usdt.balanceOf(treasury), 50e6);
    }

    function test_minMaxPerPurchase() public {
        vm.startPrank(alice);
        vm.expectRevert(PplCurveHub.BelowMin.selector);
        hub.buyWith(address(usdc), 10e6 - 1, 0);
        vm.expectRevert(PplCurveHub.AboveMax.selector);
        hub.buyWith(address(usdc), 500e6 + 1, 0);
        vm.expectRevert(PplCurveHub.ZeroAmount.selector);
        hub.buyWith(address(usdc), 0, 0);
        hub.buyWith(address(usdc), 10e6, 0);
        vm.warp(vm.getBlockTimestamp() + 60);
        hub.buyWith(address(usdc), 500e6, 0);
        vm.stopPrank();
    }

    function test_slippage() public {
        uint256 q = hub.quoteBuy(address(usdc), 100e6);
        vm.prank(alice);
        vm.expectRevert(PplCurveHub.Slippage.selector);
        hub.buyWith(address(usdc), 100e6, q + 1);
        vm.prank(alice);
        assertEq(hub.buyWith(address(usdc), 100e6, q), q);
    }

    function test_quoteEqualsRealAcrossCurve() public {
        harness.forceRaised(0);
        for (uint256 i = 0; i < 6; i++) {
            address b = address(uint160(0xB000 + i));
            usdc.mint(b, 1_000e6);
            vm.prank(b);
            usdc.approve(address(hub), type(uint256).max);
            uint256 q = hub.quoteBuy(address(usdc), 250e6);
            vm.prank(b);
            assertEq(hub.buyWith(address(usdc), 250e6, 0), q);
        }
    }

    function test_feeOnTransferTokenRejected() public {
        FeeToken ft = new FeeToken();
        vm.prank(owner);
        hub.setToken(address(ft), true);
        ft.mint(alice, 1_000e6);
        vm.startPrank(alice);
        ft.approve(address(hub), type(uint256).max);
        vm.expectRevert(PplCurveHub.TransferMismatch.selector);
        hub.buyWith(address(ft), 100e6, 0);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ limits

    function test_cooldown() public {
        _buy(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert(PplCurveHub.Cooldown.selector);
        hub.buyWith(address(usdc), 10e6, 0);
        vm.warp(vm.getBlockTimestamp() + 59);
        vm.prank(alice);
        vm.expectRevert(PplCurveHub.Cooldown.selector);
        hub.buyWith(address(usdc), 10e6, 0);
        vm.warp(vm.getBlockTimestamp() + 1);
        _buy(alice, 10e6);
        // other addresses are unaffected
        _buy(bob, 10e6);
    }

    function test_rollingDailyCapReleasesExpiredPartOnly() public {
        uint256 t0 = vm.getBlockTimestamp();
        _buy(alice, 500e6); // t0
        vm.warp(t0 + 100);
        _buy(alice, 500e6); // t0+100
        vm.warp(t0 + 200);
        _buy(alice, 500e6); // t0+200
        vm.warp(t0 + 300);
        _buy(alice, 500e6); // t0+300 -> 2000 used
        assertEq(hub.dailyUsed(alice), 2_000e6);

        vm.warp(t0 + 400);
        vm.prank(alice);
        vm.expectRevert(PplCurveHub.DailyCapExceeded.selector);
        hub.buyWith(address(usdc), 10e6, 0);

        // one second before the first entry expires
        vm.warp(t0 + 1 days - 1);
        assertEq(hub.dailyUsed(alice), 2_000e6);
        vm.prank(alice);
        vm.expectRevert(PplCurveHub.DailyCapExceeded.selector);
        hub.buyWith(address(usdc), 10e6, 0);

        // first entry (t0) is exactly 24h old: only it is released
        vm.warp(t0 + 1 days);
        assertEq(hub.dailyUsed(alice), 1_500e6);
    }

    function test_rollingCapExactRelease() public {
        uint256 t0 = vm.getBlockTimestamp();
        _buy(alice, 500e6);
        vm.warp(t0 + 100);
        _buy(alice, 500e6);
        vm.warp(t0 + 200);
        _buy(alice, 500e6);
        vm.warp(t0 + 300);
        _buy(alice, 500e6);

        vm.warp(t0 + 1 days);
        assertEq(hub.dailyUsed(alice), 1_500e6);
        // exactly the freed 500 fits, then the cap is full again
        _buy(alice, 500e6);
        assertEq(hub.dailyUsed(alice), 2_000e6);
        vm.warp(t0 + 1 days + 60);
        vm.prank(alice);
        vm.expectRevert(PplCurveHub.DailyCapExceeded.selector);
        hub.buyWith(address(usdc), 10e6, 0);

        // at t0+100+1d the second entry expires
        vm.warp(t0 + 1 days + 100);
        assertEq(hub.dailyUsed(alice), 1_500e6);
        // after a long pause everything is released
        vm.warp(t0 + 10 days);
        assertEq(hub.dailyUsed(alice), 0);
        _buy(alice, 500e6);
        assertEq(hub.dailyUsed(alice), 500e6);
    }

    // ------------------------------------------------------------------ lifecycle

    function test_notOpen() public {
        PplCurveHub h = new PplCurveHub(owner, treasury);
        vm.prank(owner);
        h.setToken(address(usdc), true);
        _fund(alice, usdc, 100e6, h);
        assertEq(h.closesAt(), 0);
        assertFalse(h.isActive());
        vm.prank(alice);
        vm.expectRevert(PplCurveHub.NotOpen.selector);
        h.buyWith(address(usdc), 10e6, 0);
        // quoting works before open
        assertGt(h.quoteBuy(address(usdc), 10e6), 0);
    }

    function test_renounceOwnershipDisabled() public {
        vm.prank(owner);
        vm.expectRevert(PplCurveHub.RenounceDisabled.selector);
        hub.renounceOwnership();
        assertEq(hub.owner(), owner);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        hub.renounceOwnership();
    }

    function test_openOnlyOwnerAndOnce() public {
        PplCurveHub h = new PplCurveHub(owner, treasury);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        h.open();
        vm.startPrank(owner);
        vm.expectEmit(false, false, false, true, address(h));
        emit SaleOpened(vm.getBlockTimestamp(), vm.getBlockTimestamp() + 730 days);
        h.open();
        assertEq(h.openedAt(), vm.getBlockTimestamp());
        assertEq(h.closesAt(), vm.getBlockTimestamp() + 730 days);
        assertTrue(h.isActive());
        vm.expectRevert(PplCurveHub.AlreadyOpened.selector);
        h.open();
        vm.stopPrank();
    }

    function test_termExpiry() public {
        uint256 opened = hub.openedAt();
        vm.warp(opened + 730 days - 1);
        _buy(alice, 10e6);
        assertTrue(hub.isActive());
        vm.warp(opened + 730 days);
        assertFalse(hub.isActive());
        vm.prank(alice);
        vm.expectRevert(PplCurveHub.SaleEnded.selector);
        hub.buyWith(address(usdc), 10e6, 0);
    }

    function test_pauseUnpause() public {
        vm.prank(alice);
        vm.expectRevert();
        hub.pause();
        vm.prank(owner);
        hub.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        hub.buyWith(address(usdc), 10e6, 0);
        vm.prank(owner);
        hub.unpause();
        _buy(alice, 10e6);
    }

    // ------------------------------------------------------------------ tokens

    function test_tokenAllowlist() public {
        MockToken other = new MockToken("OTH", 6);
        other.mint(alice, 100e6);
        vm.startPrank(alice);
        other.approve(address(hub), type(uint256).max);
        vm.expectRevert(PplCurveHub.TokenNotAllowed.selector);
        hub.buyWith(address(other), 10e6, 0);
        vm.expectRevert(PplCurveHub.TokenNotAllowed.selector);
        hub.quoteBuy(address(other), 10e6);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        hub.setToken(address(other), true);
        vm.stopPrank();

        vm.startPrank(owner);
        vm.expectEmit(true, false, false, true, address(hub));
        emit TokenSet(address(other), true, 6);
        hub.setToken(address(other), true);
        vm.stopPrank();
        vm.prank(alice);
        assertGt(hub.buyWith(address(other), 10e6, 0), 0);

        // disable again
        vm.prank(owner);
        hub.setToken(address(other), false);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.prank(alice);
        vm.expectRevert(PplCurveHub.TokenNotAllowed.selector);
        hub.buyWith(address(other), 10e6, 0);
    }

    function test_setTokenValidation() public {
        address d0 = address(new MockToken("D0", 0));
        address d19 = address(new MockToken("D19", 19));
        vm.startPrank(owner);
        vm.expectRevert(PplCurveHub.ZeroAddress.selector);
        hub.setToken(address(0), true);
        vm.expectRevert(PplCurveHub.BadDecimals.selector);
        hub.setToken(d0, true);
        vm.expectRevert(PplCurveHub.BadDecimals.selector);
        hub.setToken(d19, true);
        vm.stopPrank();
    }

    function test_decimals18() public {
        MockToken t18 = new MockToken("T18", 18);
        vm.prank(owner);
        hub.setToken(address(t18), true);
        t18.mint(alice, 1_000e18);
        vm.startPrank(alice);
        t18.approve(address(hub), type(uint256).max);

        // 100.0000009 tokens -> 100 USD6, dust (9e11 wei) not charged
        uint256 amountIn = 100e18 + 9e11;
        uint256 q = hub.quoteBuy(address(t18), amountIn);
        vm.expectEmit(true, false, false, true, address(hub));
        emit Bought(alice, address(t18), 100e18, q);
        assertEq(hub.buyWith(address(t18), amountIn, 0), q);
        vm.stopPrank();
        assertEq(t18.balanceOf(treasury), 100e18);
        assertEq(t18.balanceOf(alice), 900e18);
        assertEq(hub.raisedUsd6(), 100e6);
        // same PPL as 100 USDC on a fresh curve
        assertEq(q, harness.soldFor(100e6));
        // below one USD6 unit of dust quotes zero
        assertEq(hub.quoteBuy(address(t18), 1e11), 0);
    }

    function test_decimals2() public {
        MockToken t2 = new MockToken("T2", 2);
        vm.prank(owner);
        hub.setToken(address(t2), true);
        t2.mint(alice, 100_000);
        vm.startPrank(alice);
        t2.approve(address(hub), type(uint256).max);
        vm.expectRevert(PplCurveHub.BelowMin.selector);
        hub.buyWith(address(t2), 999, 0); // $9.99
        assertEq(hub.buyWith(address(t2), 1_000, 0), harness.soldFor(10e6)); // $10.00
        vm.stopPrank();
        assertEq(t2.balanceOf(treasury), 1_000);
        assertEq(hub.raisedUsd6(), 10e6);
    }

    function test_rescueToken() public {
        usdc.mint(address(hub), 5e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        hub.rescueToken(address(usdc), 5e6);
        vm.prank(owner);
        hub.rescueToken(address(usdc), 5e6);
        assertEq(usdc.balanceOf(treasury), 5e6);
    }

    function test_ownable2Step() public {
        vm.prank(owner);
        hub.transferOwnership(alice);
        assertEq(hub.owner(), owner);
        assertEq(hub.pendingOwner(), alice);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        hub.acceptOwnership();
        vm.prank(alice);
        hub.acceptOwnership();
        assertEq(hub.owner(), alice);
    }

    function test_constructorZeroAddress() public {
        vm.expectRevert(PplCurveHub.ZeroAddress.selector);
        new PplCurveHub(owner, address(0));
        vm.expectRevert(); // OZ Ownable rejects a zero owner first
        new PplCurveHub(address(0), treasury);
    }

    // ------------------------------------------------------------------ graduation

    function test_partialFillAndSoldOutMixedDecimals() public {
        MockToken t18 = new MockToken("T18", 18);
        MockToken t2 = new MockToken("T2", 2);
        vm.startPrank(owner);
        harness.setToken(address(t18), true);
        harness.setToken(address(t2), true);
        vm.stopPrank();
        t18.mint(alice, 1_000e18);
        t2.mint(bob, 100_000);
        vm.prank(alice);
        t18.approve(address(harness), type(uint256).max);
        vm.prank(bob);
        t2.approve(address(harness), type(uint256).max);

        // 3.5 USD left to raise: 18-dec buyer asks $20 and is charged exactly 3.5
        harness.forceRaised(4_000_000e6 - 3_500_000);
        uint256 soldBefore = harness.soldPpl();
        uint256 expectedOut = harness.soldFor(4_000_000e6) - soldBefore;
        vm.prank(alice);
        uint256 out = harness.buyWith(address(t18), 20e18, 0);
        assertEq(out, expectedOut);
        assertEq(t18.balanceOf(treasury), 3_500_000 * 1e12);
        assertEq(t18.balanceOf(alice), 1_000e18 - 3_500_000 * 1e12);
        assertTrue(harness.graduated());
        assertEq(harness.raisedUsd6(), 4_000_000e6);
        assertEq(harness.remainingRaiseUsd6(), 0);
        assertFalse(harness.isActive());

        vm.prank(bob);
        vm.expectRevert(PplCurveHub.SoldOut.selector);
        harness.buyWith(address(t2), 1_000, 0);
    }

    function test_partialFillRoundsUpForLowDecimals() public {
        MockToken t2 = new MockToken("T2", 2);
        vm.prank(owner);
        harness.setToken(address(t2), true);
        t2.mint(bob, 100_000);
        vm.prank(bob);
        t2.approve(address(harness), type(uint256).max);
        // remaining 15,000 USD6 = $0.015 -> 2 cents (rounded up, <= amountIn)
        harness.forceRaised(4_000_000e6 - 15_000);
        vm.prank(bob);
        harness.buyWith(address(t2), 1_000, 0);
        assertEq(t2.balanceOf(treasury), 2);
        assertEq(harness.raisedUsd6(), 4_000_000e6);
        assertTrue(harness.graduated());
    }

    function test_graduationEventAndQuoteZero() public {
        harness.forceRaised(4_000_000e6 - 100e6);
        usdc.mint(alice, 1_000e6);
        vm.prank(alice);
        usdc.approve(address(harness), type(uint256).max);
        uint256 target = harness.soldFor(4_000_000e6);
        vm.expectEmit(false, false, false, true, address(harness));
        emit Graduated(4_000_000e6, target);
        vm.prank(alice);
        harness.buyWith(address(usdc), 100e6, 0);
        assertEq(harness.quoteBuy(address(usdc), 100e6), 0);
    }

    /// @dev ~8000 buyers-worth of $500 purchases from 100 addresses (4 per day each) until sold out.
    function test_fullCurveSoldOutManyBuyers() public {
        vm.pauseGasMetering(); // ~8000 purchases exceed the default per-test gas cap
        uint256 n = 100;
        address[] memory buyers = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            buyers[i] = address(uint160(0xC0000 + i));
            usdc.mint(buyers[i], 100_000e6);
            vm.prank(buyers[i]);
            usdc.approve(address(hub), type(uint256).max);
        }
        // an odd first purchase so that the last one is a partial fill
        vm.prank(buyers[0]);
        hub.buyWith(address(usdc), 499e6, 0);
        vm.warp(vm.getBlockTimestamp() + 61);

        uint256 sumOut = hub.purchasedOf(buyers[0]);
        bool sawPartial;
        for (uint256 day = 0; day < 40 && !hub.graduated(); day++) {
            for (uint256 round = 0; round < 4 && !hub.graduated(); round++) {
                for (uint256 i = 0; i < n && !hub.graduated(); i++) {
                    // buyers[0] already used 499 on day 0: skip its 4th purchase that day
                    if (day == 0 && round == 3 && i == 0) continue;
                    uint256 rem = hub.remainingRaiseUsd6();
                    uint256 balBefore = usdc.balanceOf(buyers[i]);
                    vm.prank(buyers[i]);
                    uint256 out = hub.buyWith(address(usdc), 500e6, 0);
                    sumOut += out;
                    if (rem < 500e6) {
                        sawPartial = true;
                        assertEq(balBefore - usdc.balanceOf(buyers[i]), rem);
                    }
                }
                vm.warp(vm.getBlockTimestamp() + 61);
            }
            vm.warp(vm.getBlockTimestamp() + 1 days);
        }

        assertTrue(hub.graduated());
        assertTrue(sawPartial);
        assertEq(hub.raisedUsd6(), 4_000_000e6);
        assertEq(usdc.balanceOf(treasury), 4_000_000e6);
        assertEq(hub.remainingRaiseUsd6(), 0);
        assertFalse(hub.isActive());
        assertEq(hub.soldPpl(), hub.totalPurchasedPpl());
        // matches the closed-form curve (88,827,419.40313987 PPL) and per-buyer sums add up
        assertTrue(_approxRel(hub.soldPpl(), 88_827_419_403139870000000000, 1e9));
        assertLe(hub.soldPpl(), harness.soldFor(4_000_000e6));
        uint256 sumPurchased;
        for (uint256 i = 0; i < n; i++) {
            sumPurchased += hub.purchasedOf(buyers[i]);
        }
        assertEq(sumPurchased, hub.soldPpl());
        assertEq(sumOut, hub.soldPpl());

        vm.prank(buyers[1]);
        vm.expectRevert(PplCurveHub.SoldOut.selector);
        hub.buyWith(address(usdc), 10e6, 0);
        assertEq(hub.quoteBuy(address(usdc), 10e6), 0);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_quoteMonotoneAndBounded(uint256 raised, uint256 a, uint256 b) public {
        raised = bound(raised, 0, 4_000_000e6 - 1_000e6);
        a = bound(a, 10e6, 500e6);
        b = bound(b, 0, 500e6);
        harness.forceRaised(raised);
        uint256 qa = harness.quoteBuy(address(usdc), a);
        uint256 qab = harness.quoteBuy(address(usdc), a + b);
        assertGt(qa, 0);
        assertGe(qab, qa);
        // average price (wad USD per PPL) stays on the curve: p0 <= avg <= 0.25
        uint256 avg = (a * 1e12 * 1e18) / qa;
        assertGe(avg + 1e9, 5e15); // tiny tolerance for the p0 boundary at raised == 0
        assertLe(avg, 25e16);
    }

    function testFuzz_raisedNeverExceedsCap(uint256 start, uint8 count, uint256 seed) public {
        start = bound(start, 3_990_000e6, 4_000_000e6 - 10e6);
        harness.forceRaised(start);
        usdc.mint(address(this), 1_000_000e6);
        usdc.approve(address(harness), type(uint256).max);
        // one fresh funded address per purchase
        for (uint256 i = 0; i < uint256(count) % 40 + 1; i++) {
            if (harness.graduated()) break;
            address b = address(uint160(0xD0000 + i));
            uint256 amt = bound(uint256(keccak256(abi.encode(seed, i))), 10e6, 500e6);
            usdc.mint(b, amt);
            vm.startPrank(b);
            usdc.approve(address(harness), type(uint256).max);
            harness.buyWith(address(usdc), amt, 0);
            vm.stopPrank();
            assertLe(harness.raisedUsd6(), 4_000_000e6);
        }
        assertLe(harness.raisedUsd6(), 4_000_000e6);
    }

    function testFuzz_soldForRaisedMonotone(uint256 r, uint256 d) public view {
        r = bound(r, 0, 4_000_000e6 - 10e6);
        d = bound(d, 10e6, 500e6);
        assertGt(harness.soldFor(r + d), harness.soldFor(r));
    }

    // ------------------------------------------------------------------ fork e2e

    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function test_forkBaseUsdcEndToEnd() public {
        string memory url = vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org"));
        try vm.createSelectFork(url) returns (uint256) {}
        catch {
            vm.skip(true);
            return;
        }
        if (block.chainid != 8453 || BASE_USDC.code.length == 0) {
            vm.skip(true);
            return;
        }

        address o = makeAddr("forkOwner");
        address tre = makeAddr("forkTreasury");
        address buyer = makeAddr("forkBuyer");
        PplCurveHub h = new PplCurveHub(o, tre);
        vm.startPrank(o);
        h.setToken(BASE_USDC, true);
        h.open();
        vm.stopPrank();

        deal(BASE_USDC, buyer, 1_000e6);
        uint256 treBefore = ERC20(BASE_USDC).balanceOf(tre);
        uint256 q = h.quoteBuy(BASE_USDC, 250e6);
        vm.startPrank(buyer);
        ERC20(BASE_USDC).approve(address(h), type(uint256).max);
        uint256 out = h.buyWith(BASE_USDC, 250e6, q);
        vm.stopPrank();

        assertEq(out, q);
        assertEq(h.purchasedOf(buyer), out);
        assertEq(h.raisedUsd6(), 250e6);
        assertEq(ERC20(BASE_USDC).balanceOf(tre) - treBefore, 250e6);
        assertEq(ERC20(BASE_USDC).balanceOf(buyer), 750e6);
        assertEq(ERC20(BASE_USDC).balanceOf(address(h)), 0);
    }
}
