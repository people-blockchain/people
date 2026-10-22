// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";

/// MF-11: `TokenFactory` had no upper bound on `totalSupply`. A launch with an absurd supply
/// (e.g. 1e57 units) passed, traded and migrated, but the AMM pair it graduated into overflowed on
/// the first swap, so the token was untradeable after graduation. The factory now rejects a supply
/// above the technical ceiling `PeopleConstants.MAX_TOKEN_TOTAL_SUPPLY`. The economic value of that
/// ceiling is TBD (founders); these tests pin only the technical overflow bound.
contract SupplyCeilingTest is Test {
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal curve;
    PeopleRouter internal router;

    function setUp() public {
        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        WPPL wppl = new WPPL();
        PeopleAmmFactory ammFactory = new PeopleAmmFactory(address(registry));
        router = new PeopleRouter(address(ammFactory), wppl);
        curve = new BondingCurveMarket(address(registry), address(0xFEE), router, ammFactory, address(this), address(0x7EA5));
        CreatorVesting vesting = new CreatorVesting(address(registry));
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(address(0xFEE), curve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));
    }

    function _launch(address creator, uint256 supply) internal returns (address token) {
        vm.deal(creator, creator.balance + PeopleConstants.TOKEN_CREATE_FEE);
        vm.prank(creator);
        token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Cap", "CAP", 18, supply, "");
    }

    function test_hugeSupplyLaunchReverts() public {
        uint256 fee = PeopleConstants.TOKEN_CREATE_FEE;
        address creator = address(0xC2);
        vm.deal(creator, 4 * fee);
        vm.startPrank(creator);
        vm.expectRevert(TokenFactory.SupplyTooLarge.selector);
        tokenFactory.createToken{value: fee}("Cap", "CAP", 18, PeopleConstants.MAX_TOKEN_TOTAL_SUPPLY + 1, "");
        vm.expectRevert(TokenFactory.SupplyTooLarge.selector);
        tokenFactory.createToken{value: fee}("Cap", "CAP", 18, 1e57, "");
        vm.expectRevert(TokenFactory.SupplyTooLarge.selector);
        tokenFactory.createToken{value: fee}("Cap", "CAP", 18, type(uint256).max, "");
        // exactly at the ceiling is accepted
        address token =
            tokenFactory.createToken{value: fee}("Cap", "CAP", 18, PeopleConstants.MAX_TOKEN_TOTAL_SUPPLY, "");
        vm.stopPrank();
        assertEq(IERC20(token).totalSupply(), PeopleConstants.MAX_TOKEN_TOTAL_SUPPLY);
    }

    /// The ceiling is derived from the pair's K-check: `T * N * 1e8 < 2^256` with `N` at most the
    /// fixed native supply (1e27 wei). Guards the derivation against edits.
    function test_supplyCeilingKeepsKCheckInRange() public pure {
        uint256 nativeSupplyWei = 1_000_000_000 ether;
        uint256 t = PeopleConstants.MAX_TOKEN_TOTAL_SUPPLY;
        assertLt(t, type(uint256).max / (nativeSupplyWei * 1e8), "ceiling within overflow bound");
        uint256 worst = (t * 1e4) * (nativeSupplyWei * 1e4);
        assertGt(worst, 0);
    }

    /// A token at any supply up to the ceiling runs curve -> migration -> AMM, and swaps in both
    /// directions (including one moving a very large share of the native supply) do not overflow.
    /// forge-config: default.fuzz.runs = 64
    function testFuzz_supplyUpToCeilingSurvivesMigrationAndSwaps(uint256 supply, uint256 swapNative, uint256 sellFrac)
        public
    {
        supply = bound(supply, 1e21, PeopleConstants.MAX_TOKEN_TOTAL_SUPPLY);
        swapNative = bound(swapNative, 1 ether, 500_000_000 ether);
        sellFrac = bound(sellFrac, 1, 1_000);
        _runCycle(supply, swapNative, sellFrac);
    }

    function test_ceilingSupplyFullCycle() public {
        _runCycle(PeopleConstants.MAX_TOKEN_TOTAL_SUPPLY, 500_000_000 ether, 1_000);
        _runCycle(1e21, 500_000_000 ether, 1_000);
    }

    function _runCycle(uint256 supply, uint256 swapNative, uint256 sellFrac) internal {
        address token = _launch(address(uint160(0xC200 + supply % 1000)), supply);
        address buyer = address(0xB0B);
        vm.deal(buyer, 600_000_000 ether);
        vm.prank(buyer);
        curve.buy{value: 200 ether}(token, 1, block.timestamp);
        (CurveMath.State memory s,,,) = curve.curves(token);
        assertTrue(s.migrated, "graduated");
        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = token;
        vm.startPrank(buyer);
        uint256 before = IERC20(token).balanceOf(buyer);
        router.swapExactETHForTokens{value: swapNative}(0, path, buyer, block.timestamp);
        uint256 got = IERC20(token).balanceOf(buyer) - before;
        assertGt(got, 0, "bought tokens after migration");
        uint256 sellAmt = (IERC20(token).balanceOf(buyer) * sellFrac) / 1_000;
        if (sellAmt == 0) sellAmt = 1;
        IERC20(token).approve(address(router), sellAmt);
        path[0] = token;
        path[1] = router.WETH();
        uint256 ethBefore = buyer.balance;
        router.swapExactTokensForETH(sellAmt, 0, path, buyer, block.timestamp);
        vm.stopPrank();
        assertGt(buyer.balance, ethBefore, "sold tokens after migration");
    }
}
