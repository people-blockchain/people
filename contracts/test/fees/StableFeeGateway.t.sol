// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {StableFeeGateway} from "../../src/fees/StableFeeGateway.sol";
import {PeopleProtocolRegistry} from "../../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../../src/factory/TokenFactory.sol";
import {NftFactory} from "../../src/nft/NftFactory.sol";
import {BondingCurveMarket} from "../../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../../src/vesting/CreatorVesting.sol";
import {WPPL} from "../../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../../src/amm/PeopleRouter.sol";
import {PeopleConstants} from "../../src/PeopleConstants.sol";
import {TestStablecoin} from "../../src/samples/TestStablecoin.sol";

/// @dev An 18-decimal token, used to confirm the gateway rejects non-6-decimal stables.
contract Mock18DecimalStable is ERC20 {
    constructor() ERC20("Mock 18dp", "M18") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev `transfer`/`transferFrom` return `false` instead of reverting — the classic
/// non-reverting-failure ERC-20 footgun `SafeERC20` exists to catch.
contract FalseReturningStable is ERC20 {
    constructor() ERC20("False Return", "FR") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @dev Burns 10% of every transfer — the gateway must pull exactly `stableFeeUsd6` via
/// `transferFrom`; what the recipient actually receives is the token's own business, not
/// something the gateway double-pays for.
contract FeeOnTransferStable is ERC20 {
    constructor() ERC20("Fee On Transfer", "FOT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 burned = value / 10;
        super._update(from, to, value - burned);
        super._update(from, address(0), burned);
    }
}

/// @dev Stands in for `TokenFactory` as the gateway's `tokenFactory`, reentering `payLaunchFee`
/// from inside `creditPrepaidFee` — the payout leg of the flow post-fix.
contract ReentrantFactory {
    StableFeeGateway public gateway;
    IERC20 public stable;
    bool public attacked;
    // solhint-disable-next-line
    uint256 public tokenCreateFee = 1 ether;

    constructor(IERC20 stable_) {
        stable = stable_;
    }

    function setGateway(StableFeeGateway gateway_) external {
        gateway = gateway_;
    }

    function creditPrepaidFee(address) external payable {
        if (!attacked) {
            attacked = true;
            gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(stable));
        }
    }
}

contract StableFeeGatewayTest is Test {
    StableFeeGateway internal gateway;
    TokenFactory internal tokenFactory;
    NftFactory internal nftFactory;
    TestStablecoin internal usdc;
    TestStablecoin internal usdt;

    address internal owner;
    address internal buyback;
    address internal payer;

    uint256 internal constant TOKEN_FEE_USD6 = 1_000000;
    uint256 internal constant NFT_FEE_USD6 = 3_000000;

    /// `TokenFactory`/`NftFactory` pay their fee to `feeRecipient` with a plain call, and this
    /// test contract is that recipient.
    receive() external payable {}

    function setUp() public {
        owner = address(0x1234);
        buyback = address(0xBEEF);
        payer = address(0xCAFE);

        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        WPPL wppl = new WPPL();
        PeopleAmmFactory ammFactory = new PeopleAmmFactory(address(registry));
        PeopleRouter router = new PeopleRouter(address(ammFactory), wppl);
        BondingCurveMarket bondingCurve =
            new BondingCurveMarket(address(registry), address(this), router, ammFactory, address(this), address(this));
        CreatorVesting vesting = new CreatorVesting(address(registry));
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(address(this), bondingCurve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));
        nftFactory = new NftFactory(address(this), address(registry), address(this));

        usdc = new TestStablecoin("Test USD Coin", "tUSDC");
        usdt = new TestStablecoin("Test Tether", "tUSDT");

        gateway = new StableFeeGateway(
            owner, buyback, address(tokenFactory), address(nftFactory), TOKEN_FEE_USD6, NFT_FEE_USD6
        );
        tokenFactory.setGateway(address(gateway));
        nftFactory.setGateway(address(gateway));

        vm.prank(owner);
        gateway.setStableAllowed(address(usdc), true);
        vm.prank(owner);
        gateway.setStableAllowed(address(usdt), true);

        // Float the gateway with enough PPL for many payouts.
        vm.deal(address(this), 1000 ether);
        (bool sent,) = address(gateway).call{value: 500 ether}("");
        require(sent);

        vm.prank(payer);
        usdc.mint();
        vm.prank(payer);
        usdt.mint();
        vm.prank(payer);
        usdc.approve(address(gateway), type(uint256).max);
        vm.prank(payer);
        usdt.approve(address(gateway), type(uint256).max);
    }

    // ---------------------------------------------------------------------
    // Happy path, both kinds, both stables
    // ---------------------------------------------------------------------

    function test_payLaunchFee_tokenLaunch_usdc() public {
        uint256 buybackBefore = usdc.balanceOf(buyback);
        uint256 payerPplBefore = payer.balance;
        uint256 expectedPpl = tokenFactory.tokenCreateFee();

        vm.prank(payer);
        uint256 pplAmount = gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));

        assertEq(pplAmount, expectedPpl);
        assertEq(usdc.balanceOf(buyback) - buybackBefore, TOKEN_FEE_USD6);
        // C-01: the PPL never lands in the payer's wallet — it's a non-withdrawable credit on
        // the factory, consumable only by that same payer's createToken call.
        assertEq(payer.balance, payerPplBefore);
        assertEq(tokenFactory.prepaidCredit(payer), expectedPpl);
    }

    function test_payLaunchFee_nftMint_usdt() public {
        uint256 buybackBefore = usdt.balanceOf(buyback);
        uint256 payerPplBefore = payer.balance;
        uint256 expectedPpl = nftFactory.mintFee();

        vm.prank(payer);
        uint256 pplAmount = gateway.payLaunchFee(StableFeeGateway.Kind.NFT_MINT, address(usdt));

        assertEq(pplAmount, expectedPpl);
        assertEq(usdt.balanceOf(buyback) - buybackBefore, NFT_FEE_USD6);
        assertEq(payer.balance, payerPplBefore);
        assertEq(nftFactory.prepaidCredit(payer), expectedPpl);
    }

    /// The gateway caller can then call the unchanged factory itself; the prepaid credit covers
    /// the fee so no new `msg.value` is actually required, and the factory still records the
    /// caller (not the gateway) as creator.
    function test_payerCanThenCreateTokenAsThemselves() public {
        uint256 payerPplBefore = payer.balance;

        vm.prank(payer);
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));

        vm.prank(payer);
        address token = tokenFactory.createToken("Gateway Test", "GWT", 6, 1_000_000, "ipfs://x");
        assertTrue(tokenFactory.isPeopleToken(token));
        assertEq(tokenFactory.prepaidCredit(payer), 0);
        assertEq(payer.balance, payerPplBefore);
    }

    function test_pplFee_readsLiveFromFactory() public view {
        assertEq(gateway.pplFee(StableFeeGateway.Kind.TOKEN_LAUNCH), tokenFactory.tokenCreateFee());
        assertEq(gateway.pplFee(StableFeeGateway.Kind.NFT_MINT), nftFactory.mintFee());
    }

    function test_stableFeePaidEventEmitted() public {
        uint256 expectedPpl = tokenFactory.tokenCreateFee();
        vm.expectEmit(true, true, true, true);
        emit StableFeeGateway.StableFeePaid(payer, StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc), TOKEN_FEE_USD6, expectedPpl);
        vm.prank(payer);
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));
    }

    // ---------------------------------------------------------------------
    // Caps / min / max
    // ---------------------------------------------------------------------

    function test_setStableFee_rejectsBelowMin() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(StableFeeGateway.FeeOutOfBounds.selector, 1));
        gateway.setStableFee(StableFeeGateway.Kind.TOKEN_LAUNCH, 1);
    }

    function test_setStableFee_rejectsAboveMax() public {
        uint256 tooHigh = gateway.MAX_STABLE_FEE_USD6() + 1;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(StableFeeGateway.FeeOutOfBounds.selector, tooHigh));
        gateway.setStableFee(StableFeeGateway.Kind.TOKEN_LAUNCH, tooHigh);
    }

    function test_setStableFee_acceptsWithinBounds() public {
        vm.prank(owner);
        gateway.setStableFee(StableFeeGateway.Kind.TOKEN_LAUNCH, 5_000000);
        assertEq(gateway.stableFeeUsd6(StableFeeGateway.Kind.TOKEN_LAUNCH), 5_000000);
    }

    // ---------------------------------------------------------------------
    // Unauthorized setters
    // ---------------------------------------------------------------------

    function test_nonOwnerCannotSetStableFee() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        vm.prank(payer);
        gateway.setStableFee(StableFeeGateway.Kind.TOKEN_LAUNCH, 2_000000);
    }

    function test_nonOwnerCannotSetStableAllowed() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        vm.prank(payer);
        gateway.setStableAllowed(address(usdc), false);
    }

    function test_nonOwnerCannotSetBuybackRecipient() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        vm.prank(payer);
        gateway.setBuybackRecipient(payer);
    }

    function test_nonOwnerCannotPause() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        vm.prank(payer);
        gateway.pause();
    }

    function test_nonOwnerCannotWithdrawFloat() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        vm.prank(payer);
        gateway.withdrawFloat(1 ether);
    }

    function test_nonOwnerCannotSetDailyCallCap() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        vm.prank(payer);
        gateway.setDailyCallCap(10);
    }

    // ---------------------------------------------------------------------
    // Pause
    // ---------------------------------------------------------------------

    function test_pausedBlocksPayLaunchFee() public {
        vm.prank(owner);
        gateway.pause();
        vm.prank(payer);
        vm.expectRevert();
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));
    }

    function test_unpauseRestoresFlow() public {
        vm.prank(owner);
        gateway.pause();
        vm.prank(owner);
        gateway.unpause();
        vm.prank(payer);
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));
    }

    // ---------------------------------------------------------------------
    // Daily cap reset
    // ---------------------------------------------------------------------

    function test_dailyCapExceededThenResetsNextDay() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(payer);
            gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));
        }
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(StableFeeGateway.DailyCapExceeded.selector, payer));
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));

        vm.warp(block.timestamp + 1 days);
        vm.prank(payer);
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));
    }

    function test_ownerCanRaiseDailyCallCap() public {
        vm.prank(owner);
        gateway.setDailyCallCap(10);
        for (uint256 i = 0; i < 6; i++) {
            vm.prank(payer);
            gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));
        }
    }

    // ---------------------------------------------------------------------
    // Insufficient float
    // ---------------------------------------------------------------------

    function test_insufficientFloatReverts() public {
        StableFeeGateway thin = new StableFeeGateway(
            owner, buyback, address(tokenFactory), address(nftFactory), TOKEN_FEE_USD6, NFT_FEE_USD6
        );
        vm.prank(owner);
        thin.setStableAllowed(address(usdc), true);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(StableFeeGateway.InsufficientFloat.selector, tokenFactory.tokenCreateFee(), 0)
        );
        thin.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));
    }

    // ---------------------------------------------------------------------
    // Non-allowlisted / wrong-decimals stable
    // ---------------------------------------------------------------------

    function test_nonAllowlistedStableReverts() public {
        TestStablecoin other = new TestStablecoin("Other", "OTH");
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(StableFeeGateway.StableNotAccepted.selector, address(other)));
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(other));
    }

    function test_setStableAllowed_rejectsNonSixDecimalToken() public {
        Mock18DecimalStable bad = new Mock18DecimalStable();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(StableFeeGateway.NonSixDecimals.selector, 18));
        gateway.setStableAllowed(address(bad), true);
    }

    // ---------------------------------------------------------------------
    // False-returning / fee-on-transfer tokens
    // ---------------------------------------------------------------------

    function test_falseReturningStableReverts() public {
        FalseReturningStable bad = new FalseReturningStable();
        bad.mint(payer, 1_000e6);
        vm.prank(owner);
        gateway.setStableAllowed(address(bad), true);
        vm.prank(payer);
        bad.approve(address(gateway), type(uint256).max);
        vm.prank(payer);
        vm.expectRevert();
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(bad));
    }

    /// `safeTransferFrom` pulls exactly `stableFeeUsd6` from the payer regardless of what a
    /// fee-on-transfer token actually delivers to the recipient — the gateway is not shorted.
    function test_feeOnTransferStable_pullsFullAmountFromPayer() public {
        FeeOnTransferStable fot = new FeeOnTransferStable();
        fot.mint(payer, 1_000e6);
        vm.prank(owner);
        gateway.setStableAllowed(address(fot), true);
        vm.prank(payer);
        fot.approve(address(gateway), type(uint256).max);

        uint256 payerBalBefore = fot.balanceOf(payer);
        vm.prank(payer);
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(fot));
        assertEq(payerBalBefore - fot.balanceOf(payer), TOKEN_FEE_USD6);
    }

    // ---------------------------------------------------------------------
    // Reentrancy
    // ---------------------------------------------------------------------

    /// Post-fix, the only reentrant call surface left is `creditPrepaidFee` on the factory
    /// calling back into `payLaunchFee`. `nonReentrant` must still block it.
    function test_reentrancyViaMaliciousFactoryCreditPrepaidFeeIsBlocked() public {
        ReentrantFactory maliciousFactory = new ReentrantFactory(usdc);
        StableFeeGateway gateway2 = new StableFeeGateway(
            owner, buyback, address(maliciousFactory), address(nftFactory), TOKEN_FEE_USD6, NFT_FEE_USD6
        );
        maliciousFactory.setGateway(gateway2);
        vm.prank(owner);
        gateway2.setStableAllowed(address(usdc), true);
        (bool sent,) = address(gateway2).call{value: 500 ether}("");
        require(sent);

        vm.prank(payer);
        usdc.approve(address(gateway2), type(uint256).max);

        vm.prank(payer);
        vm.expectRevert();
        gateway2.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));
    }

    // ---------------------------------------------------------------------
    // Ownable2Step
    // ---------------------------------------------------------------------

    function test_ownable2Step_requiresAcceptance() public {
        address newOwner = address(0xD00D);
        vm.prank(owner);
        gateway.transferOwnership(newOwner);
        assertEq(gateway.owner(), owner);

        vm.prank(newOwner);
        gateway.acceptOwnership();
        assertEq(gateway.owner(), newOwner);
    }

    function test_ownable2Step_nonPendingCannotAccept() public {
        address newOwner = address(0xD00D);
        vm.prank(owner);
        gateway.transferOwnership(newOwner);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        vm.prank(payer);
        gateway.acceptOwnership();
    }

    // ---------------------------------------------------------------------
    // Constructor validation / withdraw / top-up
    // ---------------------------------------------------------------------

    function test_constructorRejectsZeroBuybackRecipient() public {
        vm.expectRevert(StableFeeGateway.ZeroAddress.selector);
        new StableFeeGateway(owner, address(0), address(tokenFactory), address(nftFactory), TOKEN_FEE_USD6, NFT_FEE_USD6);
    }

    function test_ownerCanWithdrawFloatToSelfOnly() public {
        uint256 before = owner.balance;
        vm.prank(owner);
        gateway.withdrawFloat(10 ether);
        assertEq(owner.balance - before, 10 ether);
    }

    function test_receiveAcceptsPplTopUp() public {
        uint256 before = address(gateway).balance;
        (bool sent,) = address(gateway).call{value: 1 ether}("");
        require(sent);
        assertEq(address(gateway).balance - before, 1 ether);
    }
}
