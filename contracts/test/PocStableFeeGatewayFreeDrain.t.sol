// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StableFeeGateway} from "../src/fees/StableFeeGateway.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {NftFactory} from "../src/nft/NftFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {TestStablecoin} from "../src/samples/TestStablecoin.sol";

/// C-01/S1-02: `StableFeeGateway.payLaunchFee` used to pay the live PPL launch fee straight to
/// `msg.sender` with a raw native transfer — nothing required that a token or NFT was ever
/// created. Since the allow-listed stable (`TestStablecoin`) is itself a public faucet, this was
/// an unconditional, repeatable stable-dust -> real-PPL vending machine: call `mint()` on the
/// faucet, call `payLaunchFee`, keep the PPL, repeat. This PoC proves that path is closed: the
/// PPL leg only ever lands as a non-withdrawable credit on the factory, consumable solely by that
/// same payer's own `createToken`/`mint` call.
contract PocStableFeeGatewayFreeDrainTest is Test {
    StableFeeGateway internal gateway;
    TokenFactory internal tokenFactory;
    NftFactory internal nftFactory;
    TestStablecoin internal usdc;

    address internal owner = address(0x1234);
    address internal buyback = address(0xBEEF);
    address internal attacker = address(0xA11CE);

    uint256 internal constant TOKEN_FEE_USD6 = 1_000000;
    uint256 internal constant NFT_FEE_USD6 = 3_000000;

    receive() external payable {}

    function setUp() public {
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

        gateway = new StableFeeGateway(
            owner, buyback, address(tokenFactory), address(nftFactory), TOKEN_FEE_USD6, NFT_FEE_USD6
        );
        tokenFactory.setGateway(address(gateway));
        nftFactory.setGateway(address(gateway));

        vm.prank(owner);
        gateway.setStableAllowed(address(usdc), true);

        vm.deal(address(this), 1000 ether);
        (bool sent,) = address(gateway).call{value: 500 ether}("");
        require(sent);
    }

    /// Before the fix: the attacker's native balance increases by `pplAmount` with no obligation
    /// to ever create anything. After the fix: the attacker's native balance never moves — the
    /// PPL exists only as `tokenFactory.prepaidCredit(attacker)`.
    function test_payLaunchFeeNeverPaysOutFreeNativePpl() public {
        vm.prank(attacker);
        usdc.mint();
        vm.prank(attacker);
        usdc.approve(address(gateway), type(uint256).max);

        uint256 attackerBalBefore = attacker.balance;

        vm.prank(attacker);
        uint256 pplAmount = gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));

        assertGt(pplAmount, 0);
        assertEq(attacker.balance, attackerBalBefore, "payLaunchFee must never pay native PPL to the caller");
        assertEq(tokenFactory.prepaidCredit(attacker), pplAmount, "PPL must land as a factory credit instead");
    }

    /// Repeating the faucet-mint -> payLaunchFee loop (the actual exploit shape from the audit)
    /// never accumulates spendable native PPL for the attacker — only ever more unspendable
    /// credit, which is worthless without an actual `createToken` call.
    function test_repeatedFaucetLoopNeverExtractsNativePpl() public {
        uint256 attackerBalBefore = attacker.balance;
        for (uint256 i = 0; i < 5; i++) {
            if (i > 0) vm.warp(block.timestamp + 1 days);
            vm.prank(attacker);
            usdc.mint();
            vm.prank(attacker);
            usdc.approve(address(gateway), type(uint256).max);

            vm.prank(attacker);
            gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));
        }
        assertEq(attacker.balance, attackerBalBefore, "no amount of looping may extract native PPL");
        assertGt(tokenFactory.prepaidCredit(attacker), 0);
    }

    /// The credit can only be consumed by the factory's own `createToken`, never withdrawn or
    /// redirected by the payer directly.
    function test_creditIsOnlySpendableViaCreateToken() public {
        vm.prank(attacker);
        usdc.mint();
        vm.prank(attacker);
        usdc.approve(address(gateway), type(uint256).max);
        vm.prank(attacker);
        gateway.payLaunchFee(StableFeeGateway.Kind.TOKEN_LAUNCH, address(usdc));

        uint256 creditBefore = tokenFactory.prepaidCredit(attacker);
        assertGt(creditBefore, 0);

        vm.prank(attacker);
        address token = tokenFactory.createToken("Legit Token", "LGT", 6, 1_000_000, "ipfs://x");
        assertTrue(tokenFactory.isPeopleToken(token));
        assertEq(tokenFactory.prepaidCredit(attacker), 0, "credit must be fully consumed by the matching launch");
    }

    /// Nobody but the registered `gateway` may mint themselves free credit directly.
    function test_randomCallerCannotMintOwnCredit() public {
        vm.expectRevert(TokenFactory.Unauthorized.selector);
        vm.prank(attacker);
        tokenFactory.creditPrepaidFee(attacker);
    }
}
