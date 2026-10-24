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
import {PeoplePair} from "../src/amm/PeoplePair.sol";
import {CommunityAgentWallet} from "../src/agent/CommunityAgentWallet.sol";
import {PeopleTimelock} from "../src/governance/PeopleTimelock.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleProjectToken} from "../src/token/PeopleProjectToken.sol";

contract ProtocolIntegrationTest is Test {
    PeopleProtocolRegistry internal registry;
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal bondingCurve;
    PeopleRouter internal router;
    WPPL internal wppl;
    PeopleAmmFactory internal ammFactory;
    CommunityAgentWallet internal agentWallet;

    address internal creator = address(0xC0FFEE);
    address internal feeRecipient = address(0xFEE);
    address internal agentExec = address(0xA11CE);
    address internal treasury = address(0x7EA5);

    function setUp() public {
        registry = new PeopleProtocolRegistry();
        wppl = new WPPL();
        ammFactory = new PeopleAmmFactory(address(registry));
        router = new PeopleRouter(address(ammFactory), wppl);
        bondingCurve =
            new BondingCurveMarket(address(registry), feeRecipient, router, ammFactory, address(this), treasury);
        CreatorVesting vesting = new CreatorVesting(address(registry));
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(feeRecipient, bondingCurve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));
        PeopleTimelock timelock = new PeopleTimelock(2 days);
        agentWallet = new CommunityAgentWallet(agentExec, address(timelock), feeRecipient, address(this));
        vm.deal(creator, 1_000_000 ether);
    }

    function test_create_token_and_curve_buy() public {
        vm.startPrank(creator);
        address token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "People Test", "PTST", 6, 1_000_000_000, "ipfs://meta"
        );
        vm.stopPrank();

        uint256 buyAmount = 5 ether;
        vm.deal(creator, buyAmount + 1 ether);
        vm.prank(creator);
        bondingCurve.buy{value: buyAmount}(token, 1, block.timestamp);
        assertGt(PeopleProjectToken(token).balanceOf(creator), 0);
    }

    function test_add_liquidity_and_swap() public {
        vm.startPrank(creator);
        address token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Swap Test", "SWAP", 6, 1_000_000_000, ""
        );
        // The AMM pair of a Token Factory token is created by its curve at migration (M07-2).
        bondingCurve.buy{value: 200 ether}(token, 1, block.timestamp);
        address pair = ammFactory.getPair(token, address(wppl));
        assertTrue(pair != address(0));
        uint256 tokenAmt = PeopleProjectToken(token).balanceOf(creator) / 2;
        uint256 nativeAmt = 5 ether;
        PeopleProjectToken(token).approve(address(router), tokenAmt);
        router.addLiquidityETH{value: nativeAmt}(token, tokenAmt, 0, 0, creator, block.timestamp + 60);
        assertGt(PeoplePair(pair).balanceOf(creator), 0);

        address[] memory path = new address[](2);
        path[0] = address(wppl);
        path[1] = token;
        router.swapExactETHForTokens{value: 1 ether}(0, path, creator, block.timestamp + 60);
        vm.stopPrank();
        assertGt(PeopleProjectToken(token).balanceOf(creator), 0);
    }

    function test_agent_wallet_limits() public {
        vm.deal(address(agentWallet), 10 ether);
        vm.prank(agentExec);
        agentWallet.spend(payable(feeRecipient), 0.5 ether);

        vm.prank(agentExec);
        vm.expectRevert(CommunityAgentWallet.OverLimit.selector);
        agentWallet.spend(payable(feeRecipient), 2 ether);
    }
}
