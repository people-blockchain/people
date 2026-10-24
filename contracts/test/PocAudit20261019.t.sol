// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {StableFeeGateway} from "../src/fees/StableFeeGateway.sol";
import {TestStablecoin} from "../src/samples/TestStablecoin.sol";
import {MerchantEscrow} from "../src/lavka/MerchantEscrow.sol";

// =====================================================================================
// Audit 2026-10-19 contract-guard PoCs. Every test here fails against the pre-fix source
// (missing symbol / missing revert / fail-open / push-payment brick) and passes now.
// =====================================================================================

abstract contract PocCurveBase is Test {
    PeopleProtocolRegistry internal registry;
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal curve;
    CreatorVesting internal vesting;
    CommunityTokenVault internal vault;

    address internal creator = address(0xC0FFEE);
    address internal buyer = address(0xB0B);
    address internal buyer2 = address(0xB0B2);
    address internal donor = address(0xD0D0);
    address internal sweepTo = address(0x5EED);
    address internal evilFactory = address(0xE711);

    function setUp() public virtual {
        registry = new PeopleProtocolRegistry();
        WPPL wppl = new WPPL();
        PeopleAmmFactory ammFactory = new PeopleAmmFactory(address(registry));
        PeopleRouter router = new PeopleRouter(address(ammFactory), wppl);
        curve = new BondingCurveMarket(address(registry), address(0xFEE), router, ammFactory, address(this), address(0x7EA5));
        vesting = new CreatorVesting(address(registry));
        vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(address(0xFEE), curve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));
        vm.deal(creator, 1_000 ether);
        vm.deal(buyer, 100_000 ether);
        vm.deal(buyer2, 1_000 ether);
        vm.deal(donor, 100 ether);
    }

    function _launch() internal returns (address token) {
        vm.prank(creator);
        token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Test", "TST", 18, 1_000_000, "");
    }

    function _buy(address who, address token, uint256 value) internal returns (uint256 got) {
        uint256 before = IERC20(token).balanceOf(who);
        vm.prank(who);
        curve.buy{value: value}(token, 1, block.timestamp);
        got = IERC20(token).balanceOf(who) - before;
    }

    /// A single huge buy sells the curve out and migrates it to the AMM.
    function _migrate(address token) internal {
        vm.prank(buyer);
        curve.buy{value: 50_000 ether}(token, 1, block.timestamp);
        assertTrue(curve.isMigrated(token), "migrated");
    }

    function _forceSend(uint256 amount) internal {
        vm.prank(donor);
        (bool ok,) = address(curve).call{value: amount}("");
        require(ok, "donate");
    }

    function _reserve(address token) internal view returns (uint256) {
        (CurveMath.State memory st,,,) = curve.curves(token);
        return st.actualNativeReserve;
    }

    function _curveHash(address token) internal view returns (bytes32) {
        (CurveMath.State memory st, uint256 a, uint256 b, uint256 c) = curve.curves(token);
        return keccak256(abi.encode(st, a, b, c));
    }
}

// -------------------------------------------------------------------------------------
// 1. Re-register guards (CreatorVesting.register / BondingCurveMarket.registerToken)
// -------------------------------------------------------------------------------------
contract PocAudit20261019_ReRegisterTest is PocCurveBase {
    function test_vesting_swappedFactoryCannotOverwriteSchedule() public {
        address token = _launch();

        // Let the creator claim part of the schedule so `claimed` is visibly above the upfront.
        vm.warp(block.timestamp + 100 days);
        vm.prank(creator);
        vesting.claim(token);

        (address c0, uint256 total0, uint256 upfront0, uint256 claimed0, uint256 start0) = vesting.schedules(token);
        assertEq(c0, creator);
        assertGt(start0, 0);
        assertGt(claimed0, upfront0, "creator has claimed beyond the upfront");

        // Owner swaps in a (malicious) factory; it tries to reset the schedule and take over.
        registry.setTokenFactory(evilFactory);
        vm.prank(evilFactory);
        vm.expectRevert(CreatorVesting.AlreadyRegistered.selector);
        vesting.register(token, evilFactory, 1 ether, 0);

        (address c1, uint256 total1, uint256 upfront1, uint256 claimed1, uint256 start1) = vesting.schedules(token);
        assertEq(c1, c0, "creator unchanged");
        assertEq(total1, total0, "allocation unchanged");
        assertEq(upfront1, upfront0, "upfront unchanged");
        assertEq(claimed1, claimed0, "claimed unchanged");
        assertEq(start1, start0, "startTime unchanged");
    }

    function test_curve_swappedFactoryCannotResetMigratedCurve() public {
        address token = _launch();
        _migrate(token);

        bytes32 hashBefore = _curveHash(token);
        uint256 launchedBefore = curve.launchedAt(token);
        uint8 modeBefore = curve.leftoverMode(token);

        registry.setTokenFactory(evilFactory);
        vm.warp(block.timestamp + 1 days);
        vm.prank(evilFactory);
        vm.expectRevert(BondingCurveMarket.AlreadyRegistered.selector);
        curve.registerToken(token, 1_000 ether, 1_000 ether, 1_000 ether, 1);

        assertTrue(curve.isMigrated(token), "migrated flag survives");
        assertEq(_curveHash(token), hashBefore, "curve state untouched");
        assertEq(curve.launchedAt(token), launchedBefore, "launchedAt untouched");
        assertEq(curve.leftoverMode(token), modeBefore, "leftoverMode untouched");
    }

    function test_curve_swappedFactoryCannotResetActiveCurve() public {
        address token = _launch();
        _buy(buyer, token, 1 ether);
        bytes32 hashBefore = _curveHash(token);
        uint256 reserveBefore = _reserve(token);
        assertGt(reserveBefore, 0);

        registry.setTokenFactory(evilFactory);
        vm.prank(evilFactory);
        vm.expectRevert(BondingCurveMarket.AlreadyRegistered.selector);
        curve.registerToken(token, 1_000 ether, 1_000 ether, 1_000 ether, 0);

        assertEq(_curveHash(token), hashBefore, "state not reset");
        assertEq(_reserve(token), reserveBefore, "reserve accounting not reset");
    }

    function test_communityVault_swappedFactoryCannotReRegister() public {
        address token = _launch();
        assertTrue(vault.registered(token), "registered at launch");
        uint256 balance0 = vault.balances(token);
        assertGt(balance0, 0, "community allocation funded at launch");

        // A swapped-in factory tries to zero (freeze) the allocation, then to inflate it.
        registry.setTokenFactory(evilFactory);
        vm.startPrank(evilFactory);
        vm.expectRevert(CommunityTokenVault.AlreadyRegistered.selector);
        vault.register(token, 0);
        vm.expectRevert(CommunityTokenVault.AlreadyRegistered.selector);
        vault.register(token, type(uint128).max);
        vm.stopPrank();
        assertEq(vault.balances(token), balance0, "balance untouched");
    }

    /// The guard must not be `balances[token] != 0`: after a full withdraw the balance is
    /// legitimately zero and the allocation must still not be re-creatable.
    function test_communityVault_guardHoldsAfterFullWithdraw() public {
        address token = _launch();
        uint256 balance0 = vault.balances(token);
        vault.setRecipientAllowed(sweepTo, true);
        vault.withdraw(token, sweepTo, balance0);
        assertEq(vault.balances(token), 0, "fully withdrawn");

        registry.setTokenFactory(evilFactory);
        vm.prank(evilFactory);
        vm.expectRevert(CommunityTokenVault.AlreadyRegistered.selector);
        vault.register(token, balance0);
        assertEq(vault.balances(token), 0, "no phantom balance created");
    }

    function test_communityVault_registerStillWorksOncePerToken() public {
        address freshToken = address(0xABCD);
        assertFalse(vault.registered(freshToken));
        vm.prank(address(tokenFactory));
        vault.register(freshToken, 5 ether);
        assertTrue(vault.registered(freshToken));
        assertEq(vault.balances(freshToken), 5 ether);
    }

    function test_curve_registerTokenRejectsNativePplPrecompileAndCodelessTokens() public {
        registry.setTokenFactory(evilFactory);
        vm.startPrank(evilFactory);
        vm.expectRevert(BondingCurveMarket.InvalidToken.selector);
        curve.registerToken(PeopleConstants.NATIVE_PPL_ERC20, 1_000 ether, 1_000 ether, 1_000 ether, 0);
        vm.expectRevert(BondingCurveMarket.InvalidToken.selector);
        curve.registerToken(address(0xBEEF), 1_000 ether, 1_000 ether, 1_000 ether, 0);
        vm.expectRevert(BondingCurveMarket.InvalidToken.selector);
        curve.registerToken(address(0), 1_000 ether, 1_000 ether, 1_000 ether, 0);
        vm.stopPrank();
        assertEq(curve.launchedAt(PeopleConstants.NATIVE_PPL_ERC20), 0, "precompile never registered");
        assertEq(curve.launchedAt(address(0xBEEF)), 0, "EOA never registered");
    }
}

// -------------------------------------------------------------------------------------
// 2 + 3. Deadline and ZeroMinOut on buy / sell
// -------------------------------------------------------------------------------------
contract PocAudit20261019_BuySellGuardsTest is PocCurveBase {
    function test_buy_expiredDeadlineReverts() public {
        address token = _launch();
        vm.warp(1_000_000);
        vm.prank(buyer);
        vm.expectRevert(BondingCurveMarket.Expired.selector);
        curve.buy{value: 1 ether}(token, 1, 999_999);
    }

    function test_buy_deadlineEqualToNowSucceeds() public {
        address token = _launch();
        uint256 t = block.timestamp + 100;
        vm.warp(t);
        vm.prank(buyer);
        curve.buy{value: 1 ether}(token, 1, t);
        assertGt(IERC20(token).balanceOf(buyer), 0);
    }

    function test_sell_expiredDeadlineReverts() public {
        address token = _launch();
        uint256 bought = _buy(buyer, token, 1 ether);
        vm.prank(buyer);
        IERC20(token).approve(address(curve), bought);

        vm.warp(1_000_000);
        vm.prank(buyer);
        vm.expectRevert(BondingCurveMarket.Expired.selector);
        curve.sell(token, bought, 1, 999_999);
    }

    function test_sell_deadlineEqualToNowSucceeds() public {
        address token = _launch();
        uint256 bought = _buy(buyer, token, 1 ether);
        vm.prank(buyer);
        IERC20(token).approve(address(curve), bought);

        uint256 t = block.timestamp + 100;
        vm.warp(t);
        uint256 nativeBefore = buyer.balance;
        vm.prank(buyer);
        curve.sell(token, bought, 1, t);
        assertGt(buyer.balance, nativeBefore, "seller paid");
    }

    function test_deadlineIsCheckedBeforeZeroMinOut() public {
        address token = _launch();
        vm.warp(1_000_000);
        vm.prank(buyer);
        vm.expectRevert(BondingCurveMarket.Expired.selector);
        curve.buy{value: 1 ether}(token, 0, 999_999);
    }

    function test_buy_zeroMinTokensOutReverts() public {
        address token = _launch();
        vm.prank(buyer);
        vm.expectRevert(BondingCurveMarket.ZeroMinOut.selector);
        curve.buy{value: 1 ether}(token, 0, block.timestamp);
    }

    function test_sell_zeroMinNativeOutReverts() public {
        address token = _launch();
        uint256 bought = _buy(buyer, token, 1 ether);
        vm.startPrank(buyer);
        IERC20(token).approve(address(curve), bought);
        vm.expectRevert(BondingCurveMarket.ZeroMinOut.selector);
        curve.sell(token, bought, 0, block.timestamp);
        vm.stopPrank();
        assertEq(IERC20(token).balanceOf(buyer), bought, "nothing sold");
    }
}

// -------------------------------------------------------------------------------------
// 4a. BondingCurveMarket.sweepNativeDust
// -------------------------------------------------------------------------------------
contract PocAudit20261019_SweepTest is PocCurveBase {
    function _finalizeWithBuyer(uint256 value) internal returns (address token, uint256 bought) {
        token = _launch();
        bought = _buy(buyer, token, value);
        vm.warp(block.timestamp + 180 days);
        curve.finalize(token);
        assertTrue(curve.finalized(token));
    }

    function test_sweep_revertsForActiveCurve() public {
        address token = _launch();
        _buy(buyer, token, 1 ether);
        _forceSend(5 ether);
        vm.expectRevert(BondingCurveMarket.CurveNotSettled.selector);
        curve.sweepNativeDust(token, sweepTo);
        // An unknown token is not settled either.
        vm.expectRevert(BondingCurveMarket.CurveNotSettled.selector);
        curve.sweepNativeDust(address(0x1234), sweepTo);
    }

    function test_sweep_onlyOwner() public {
        (address token,) = _finalizeWithBuyer(1 ether);
        _forceSend(5 ether);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, buyer));
        curve.sweepNativeDust(token, buyer);
    }

    function test_sweep_zeroRecipientReverts() public {
        (address token,) = _finalizeWithBuyer(1 ether);
        _forceSend(5 ether);
        vm.expectRevert(BondingCurveMarket.ZeroRecipient.selector);
        curve.sweepNativeDust(token, address(0));
    }

    function test_sweep_migratedCurve_movesOnlySurplus_otherCurveReserveIntact() public {
        address tokenA = _launch();
        address tokenB = _launch();
        uint256 boughtB = _buy(buyer2, tokenB, 10 ether);
        _migrate(tokenA);

        uint256 reserveB = _reserve(tokenB);
        assertGt(reserveB, 0);
        assertEq(curve.totalAccountedNative(), reserveB, "only curve B is still owed");
        assertEq(address(curve).balance, reserveB, "no surplus yet");

        _forceSend(7 ether);
        assertEq(address(curve).balance, reserveB + 7 ether);

        vm.expectEmit(true, true, false, true);
        emit BondingCurveMarket.NativeDustSwept(tokenA, sweepTo, 7 ether);
        curve.sweepNativeDust(tokenA, sweepTo);

        assertEq(sweepTo.balance, 7 ether, "exactly the surplus moved");
        assertEq(address(curve).balance, curve.totalAccountedNative(), "balance == accounted after sweep");
        assertGe(address(curve).balance, reserveB, "curve B reserve intact");

        // Curve B's holder can still sell the full amount.
        vm.startPrank(buyer2);
        IERC20(tokenB).approve(address(curve), boughtB);
        uint256 nativeBefore = buyer2.balance;
        curve.sell(tokenB, boughtB, 1, block.timestamp);
        vm.stopPrank();
        assertGt(buyer2.balance, nativeBefore, "holder of the still-active curve got paid");
        assertEq(IERC20(tokenB).balanceOf(buyer2), 0);
        assertEq(address(curve).balance, curve.totalAccountedNative(), "still in lock-step");
    }

    function test_sweep_finalizedCurve_doesNotTouchSellerReserve() public {
        (address token, uint256 bought) = _finalizeWithBuyer(2 ether);
        uint256 reserve = _reserve(token);
        assertGt(reserve, 0, "finalized curve still owes its seller");

        _forceSend(3 ether);
        curve.sweepNativeDust(token, sweepTo);
        assertEq(sweepTo.balance, 3 ether, "only the surplus moved");
        assertEq(address(curve).balance, reserve, "seller reserve untouched");
        assertEq(address(curve).balance, curve.totalAccountedNative());

        // The seller can still sell everything back after the sweep.
        vm.startPrank(buyer);
        IERC20(token).approve(address(curve), bought);
        uint256 nativeBefore = buyer.balance;
        curve.sell(token, bought, 1, block.timestamp);
        vm.stopPrank();
        assertGt(buyer.balance, nativeBefore, "seller paid after sweep");
        assertEq(address(curve).balance, curve.totalAccountedNative());
    }

    function test_sweep_nothingToSweepWithoutSurplus() public {
        (address token,) = _finalizeWithBuyer(1 ether);
        vm.expectRevert(BondingCurveMarket.NothingToSweep.selector);
        curve.sweepNativeDust(token, sweepTo);

        // Also on a migrated curve with no surplus.
        address tokenA = _launch();
        _migrate(tokenA);
        vm.expectRevert(BondingCurveMarket.NothingToSweep.selector);
        curve.sweepNativeDust(tokenA, sweepTo);
    }

    function test_migration_zeroesCurveReserve_accountingMatchesRemainingCurves() public {
        address tokenA = _launch();
        address tokenB = _launch();
        _buy(buyer2, tokenB, 10 ether);
        uint256 reserveB = _reserve(tokenB);
        assertGt(reserveB, 0);

        _migrate(tokenA);
        assertEq(_reserve(tokenA), 0, "migrated curve reports no reserve");
        assertEq(curve.totalAccountedNative(), reserveB, "accounted == sum over non-migrated curves");
        assertEq(address(curve).balance, reserveB);
    }

    function test_sweep_secondSweepHasNothingLeft() public {
        (address token,) = _finalizeWithBuyer(1 ether);
        _forceSend(2 ether);
        curve.sweepNativeDust(token, sweepTo);
        vm.expectRevert(BondingCurveMarket.NothingToSweep.selector);
        curve.sweepNativeDust(token, sweepTo);
    }
}

// -------------------------------------------------------------------------------------
// 4b. StableFeeGateway.rescueERC20
// -------------------------------------------------------------------------------------
/// Stand-in for the native-PPL ERC-20 precompile: its `transfer` moves the caller's native
/// balance (simulated with the `deal` cheatcode, which works from any address under forge).
contract NativeDrainingToken {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function transfer(address, uint256) external returns (bool) {
        VM.deal(msg.sender, msg.sender.balance - 1 ether);
        return true;
    }
}

contract PocAudit20261019_GatewayRescueTest is Test {
    StableFeeGateway internal gateway;
    TestStablecoin internal stray;

    address internal owner = address(0x1234);
    address internal buyback = address(0xBEEF);
    address internal rescueTo = address(0x7E5C);
    address internal attacker = address(0xBAD);

    uint256 internal constant FLOAT = 50 ether;

    function setUp() public {
        gateway = new StableFeeGateway(owner, buyback, address(0x1), address(0x2), 1_000000, 3_000000);
        vm.deal(address(this), FLOAT);
        (bool sent,) = address(gateway).call{value: FLOAT}("");
        require(sent);
        stray = new TestStablecoin("Stray", "STRAY");
        vm.prank(address(gateway));
        stray.mint(); // 1_000e6 sent to the gateway "by mistake"
    }

    function test_ownerRescuesStrayErc20_floatUntouched() public {
        assertEq(stray.balanceOf(address(gateway)), 1_000e6);

        vm.expectEmit(true, true, false, true);
        emit StableFeeGateway.ERC20Rescued(address(stray), rescueTo, 400e6);
        vm.prank(owner);
        gateway.rescueERC20(address(stray), rescueTo, 400e6);

        assertEq(stray.balanceOf(rescueTo), 400e6);
        assertEq(stray.balanceOf(address(gateway)), 600e6);
        assertEq(address(gateway).balance, FLOAT, "native float unchanged");
    }

    function test_nonOwnerCannotRescue() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        gateway.rescueERC20(address(stray), attacker, 1e6);
        assertEq(stray.balanceOf(address(gateway)), 1_000e6);
    }

    function test_rescueRejectsZeroAddressesAndSelf() public {
        vm.startPrank(owner);
        vm.expectRevert(StableFeeGateway.ZeroAddress.selector);
        gateway.rescueERC20(address(0), rescueTo, 1);
        vm.expectRevert(StableFeeGateway.ZeroAddress.selector);
        gateway.rescueERC20(address(stray), address(0), 1);
        vm.expectRevert(StableFeeGateway.ZeroAddress.selector);
        gateway.rescueERC20(address(gateway), rescueTo, 1);
        vm.stopPrank();
        assertEq(address(gateway).balance, FLOAT);
    }

    function test_rescueRejectsNativePplPrecompile() public {
        vm.prank(owner);
        vm.expectRevert(StableFeeGateway.NativeTokenNotRescuable.selector);
        gateway.rescueERC20(PeopleConstants.NATIVE_PPL_ERC20, rescueTo, FLOAT);
        assertEq(address(gateway).balance, FLOAT, "float unchanged");
        assertEq(rescueTo.balance, 0);
    }

    /// Under forge the precompile does not exist; etch a native-draining "token" at its address
    /// to prove the address is refused before any call is made.
    function test_rescueRejectsNativePplPrecompile_evenWhenItWouldDrainTheFloat() public {
        vm.etch(PeopleConstants.NATIVE_PPL_ERC20, address(new NativeDrainingToken()).code);
        vm.prank(owner);
        vm.expectRevert(StableFeeGateway.NativeTokenNotRescuable.selector);
        gateway.rescueERC20(PeopleConstants.NATIVE_PPL_ERC20, rescueTo, FLOAT);
        assertEq(address(gateway).balance, FLOAT, "float unchanged");
    }

    /// Any other token whose `transfer` moves the gateway's native balance is caught by the
    /// before/after balance check, and the whole rescue reverts.
    function test_rescueRejectsTokenThatChangesNativeBalance() public {
        NativeDrainingToken drainer = new NativeDrainingToken();
        vm.prank(owner);
        vm.expectRevert(StableFeeGateway.NativeBalanceChanged.selector);
        gateway.rescueERC20(address(drainer), rescueTo, 1);
        // No balance assertion afterwards: the mock drains via the `deal` cheatcode, which a
        // revert does not undo (a real precompile transfer is rolled back with the call).
    }

    function test_rescueCannotMoveNativeFloat_withdrawFloatIsTheOnlyWayOut() public {
        // Pointing rescueERC20 at a non-token address cannot move native PPL either.
        vm.prank(owner);
        vm.expectRevert();
        gateway.rescueERC20(address(0xCAFE), rescueTo, FLOAT);
        assertEq(address(gateway).balance, FLOAT, "float unchanged after failed rescue");
        assertEq(rescueTo.balance, 0);

        // Over-asking on a real token reverts and leaves the float alone as well.
        vm.prank(owner);
        vm.expectRevert();
        gateway.rescueERC20(address(stray), rescueTo, 1_001e6);
        assertEq(address(gateway).balance, FLOAT);

        // withdrawFloat is the only path, and it only pays the owner.
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        gateway.withdrawFloat(1 ether);

        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        gateway.withdrawFloat(10 ether);
        assertEq(owner.balance - ownerBefore, 10 ether);
        assertEq(address(gateway).balance, FLOAT - 10 ether);
    }
}

// -------------------------------------------------------------------------------------
// 5. MerchantEscrow.autoCloseDispute is pull-payment
// -------------------------------------------------------------------------------------
contract PocEscrowParty {
    MerchantEscrow public immutable esc;
    bool public accept;
    bool public reenter;
    bool public reentered;
    bool public reentryBlocked;

    constructor(MerchantEscrow esc_) {
        esc = esc_;
    }

    function setAccept(bool a) external {
        accept = a;
    }

    function setReenter(bool r) external {
        reenter = r;
    }

    function create(address merchant, uint64 deadline) external payable returns (uint256) {
        return esc.createEscrow{value: msg.value}(merchant, deadline, bytes32(0));
    }

    function open(uint256 id) external {
        esc.openDispute(id);
    }

    function withdraw() external {
        esc.withdrawPending();
    }

    receive() external payable {
        if (reenter && !reentered) {
            reentered = true;
            try esc.withdrawPending() {}
            catch {
                reentryBlocked = true;
            }
        }
        require(accept, "reject");
    }
}

contract PocAudit20261019_EscrowTest is Test {
    MerchantEscrow internal escrow;
    address internal eoaMerchant = address(0xA11CE);
    address internal eoaCustomer = address(0xC0FFEE);
    uint256 internal minDuration;

    function setUp() public {
        escrow = new MerchantEscrow(address(this));
        vm.deal(eoaCustomer, 10 ether);
        vm.deal(address(this), 100 ether);
        minDuration = escrow.MIN_ESCROW_DURATION();
    }

    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + minDuration);
    }

    function _status(uint256 id) internal view returns (MerchantEscrow.Status s) {
        (,,,, s,,) = escrow.escrows(id);
    }

    function _autoClose(uint256 id) internal {
        uint256 t = block.timestamp + escrow.DISPUTE_AUTO_CLOSE_WINDOW() + 1;
        vm.warp(t);
        // Anyone may trigger it.
        vm.prank(address(0x1111));
        escrow.autoCloseDispute(id);
    }

    function test_rejectingCustomer_doesNotBlockAutoClose_andRecoversAfterToggle() public {
        PocEscrowParty customer = new PocEscrowParty(escrow);
        uint256 id = customer.create{value: 2 ether}(eoaMerchant, _deadline());
        customer.open(id);
        assertEq(address(escrow).balance, 2 ether);

        _autoClose(id);

        assertEq(uint8(_status(id)), uint8(MerchantEscrow.Status.Split));
        assertEq(escrow.pendingWithdrawals(address(customer)), 1 ether);
        assertEq(escrow.pendingWithdrawals(eoaMerchant), 1 ether);
        assertEq(address(escrow).balance, 2 ether, "contract balance == sum of pendings");

        // Honest counterparty is paid in full.
        vm.prank(eoaMerchant);
        escrow.withdrawPending();
        assertEq(eoaMerchant.balance, 1 ether);

        // Rejecting party cannot withdraw yet, and keeps its credit.
        vm.expectRevert(bytes("withdraw"));
        customer.withdraw();
        assertEq(escrow.pendingWithdrawals(address(customer)), 1 ether, "credit kept");
        assertEq(address(escrow).balance, 1 ether);

        customer.setAccept(true);
        customer.withdraw();
        assertEq(address(customer).balance, 1 ether);
        assertEq(escrow.pendingWithdrawals(address(customer)), 0);
        assertEq(address(escrow).balance, 0);
    }

    function test_rejectingMerchant_doesNotBlockAutoClose_andRecoversAfterToggle() public {
        PocEscrowParty merchant = new PocEscrowParty(escrow);
        vm.prank(eoaCustomer);
        uint256 id = escrow.createEscrow{value: 2 ether}(address(merchant), _deadline(), bytes32(0));
        merchant.open(id);

        _autoClose(id);

        assertEq(uint8(_status(id)), uint8(MerchantEscrow.Status.Split));
        assertEq(escrow.pendingWithdrawals(eoaCustomer), 1 ether);
        assertEq(escrow.pendingWithdrawals(address(merchant)), 1 ether);
        assertEq(address(escrow).balance, 2 ether);

        uint256 custBefore = eoaCustomer.balance;
        vm.prank(eoaCustomer);
        escrow.withdrawPending();
        assertEq(eoaCustomer.balance - custBefore, 1 ether, "honest customer gets their half");

        vm.expectRevert(bytes("withdraw"));
        merchant.withdraw();
        assertEq(escrow.pendingWithdrawals(address(merchant)), 1 ether);

        merchant.setAccept(true);
        merchant.withdraw();
        assertEq(address(merchant).balance, 1 ether);
        assertEq(address(escrow).balance, 0);
    }

    function test_withdrawPending_nothingPendingReverts() public {
        vm.prank(address(0x9999));
        vm.expectRevert(MerchantEscrow.NothingPending.selector);
        escrow.withdrawPending();

        // A party cannot withdraw twice.
        vm.prank(eoaCustomer);
        uint256 id = escrow.createEscrow{value: 1 ether}(eoaMerchant, _deadline(), bytes32(0));
        vm.prank(eoaCustomer);
        escrow.openDispute(id);
        _autoClose(id);
        vm.prank(eoaMerchant);
        escrow.withdrawPending();
        vm.prank(eoaMerchant);
        vm.expectRevert(MerchantEscrow.NothingPending.selector);
        escrow.withdrawPending();
        // A stranger cannot claim a party's credit.
        vm.prank(address(0x9999));
        vm.expectRevert(MerchantEscrow.NothingPending.selector);
        escrow.withdrawPending();
    }

    function test_withdrawPending_reentrancyGivesNothingExtra() public {
        PocEscrowParty merchant = new PocEscrowParty(escrow);
        merchant.setAccept(true);
        merchant.setReenter(true);
        vm.prank(eoaCustomer);
        uint256 id = escrow.createEscrow{value: 2 ether}(address(merchant), _deadline(), bytes32(0));
        // A second, unrelated escrow keeps extra funds in the contract for the reentrant party to steal.
        vm.prank(eoaCustomer);
        escrow.createEscrow{value: 3 ether}(eoaMerchant, _deadline(), bytes32(0));
        merchant.open(id);
        _autoClose(id);

        merchant.withdraw();

        assertTrue(merchant.reentered(), "receive() did reenter");
        assertTrue(merchant.reentryBlocked(), "reentrant withdrawPending was rejected");
        assertEq(address(merchant).balance, 1 ether, "exactly its half, once");
        assertEq(escrow.pendingWithdrawals(address(merchant)), 0);
        assertEq(escrow.pendingWithdrawals(eoaCustomer), 1 ether, "counterparty credit intact");
        assertEq(address(escrow).balance, 1 ether + 3 ether, "other funds untouched");
    }

    function test_oddAmountSplit_pendingsSumToAmount() public {
        vm.prank(eoaCustomer);
        uint256 id = escrow.createEscrow{value: 3}(eoaMerchant, _deadline(), bytes32(0));
        vm.prank(eoaCustomer);
        escrow.openDispute(id);
        _autoClose(id);
        uint256 pc = escrow.pendingWithdrawals(eoaCustomer);
        uint256 pm = escrow.pendingWithdrawals(eoaMerchant);
        assertEq(pc, 1);
        assertEq(pm, 2, "dust stays with the merchant");
        assertEq(pc + pm, address(escrow).balance);
    }
}

// -------------------------------------------------------------------------------------
// 6. PeopleAmmFactory fails closed on a broken registry
// -------------------------------------------------------------------------------------
contract PocRevertingRegistry {
    function tokenFactoryAddress() external pure returns (address) {
        revert("registry down");
    }
}

/// Answers every call with 4 bytes: a successful call with malformed (<32 bytes) data.
contract PocShortDataRegistry {
    fallback() external {
        assembly {
            mstore(0, 1)
            return(0x1c, 4)
        }
    }
}

contract PocAudit20261019_AmmFactoryTest is Test {
    address internal tokenA = address(0x1001);
    address internal tokenB = address(0x1002);

    function test_createPair_revertsWhenRegistryReverts() public {
        PeopleAmmFactory f = new PeopleAmmFactory(address(new PocRevertingRegistry()));
        vm.expectRevert(PeopleAmmFactory.RegistryCheckFailed.selector);
        f.createPair(tokenA, tokenB);
        assertEq(f.allPairsLength(), 0);
        assertEq(f.getPair(tokenA, tokenB), address(0));
    }

    function test_createPair_revertsWhenRegistryReturnsShortData() public {
        PeopleAmmFactory f = new PeopleAmmFactory(address(new PocShortDataRegistry()));
        vm.expectRevert(PeopleAmmFactory.RegistryCheckFailed.selector);
        f.createPair(tokenA, tokenB);
        assertEq(f.allPairsLength(), 0);
    }

    function test_createPair_revertsWhenRegistryHasNoCode() public {
        // A staticcall to an address without code "succeeds" with empty return data.
        PeopleAmmFactory f = new PeopleAmmFactory(address(0xDEADBEEF));
        vm.expectRevert(PeopleAmmFactory.RegistryCheckFailed.selector);
        f.createPair(tokenA, tokenB);
        assertEq(f.allPairsLength(), 0);
    }

    function test_createPair_healthyRegistryStillWorks() public {
        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        PeopleAmmFactory f = new PeopleAmmFactory(address(registry));
        // Token Factory not wired yet: no Token Factory tokens exist, so any pair may be created.
        address pair = f.createPair(tokenA, tokenB);
        assertTrue(pair != address(0));
        assertEq(f.getPair(tokenA, tokenB), pair);
        assertEq(f.getPair(tokenB, tokenA), pair);
        assertEq(f.allPairsLength(), 1);
    }
}
