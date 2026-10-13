// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AmmMath} from "../src/libs/AmmMath.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";

contract AmmMathTest is Test {
    function test_swap_increases_k() public pure {
        (uint256 out, uint256 rIn, uint256 rOut) = AmmMath.swapExactIn(1_000_000 ether, 1_000_000 ether, 1 ether, PeopleConstants.AMM_FEE_BPS, 0);
        assertGt(out, 0);
        assertGt(rIn * rOut, 1_000_000 ether * 1_000_000 ether);
    }

    function testFuzz_swap_reserves(uint256 reserve, uint256 amountIn) public pure {
        reserve = bound(reserve, 1_000_000 ether, 1_000_000_000 ether);
        amountIn = bound(amountIn, 1_000 wei, reserve / 1_000);
        (uint256 out, uint256 rIn, uint256 rOut) = AmmMath.swapExactIn(reserve, reserve, amountIn, PeopleConstants.AMM_FEE_BPS, 0);
        assertGt(out, 0);
        assertLt(out, reserve);
        assertGe(rIn * rOut, reserve * reserve);
    }

    function test_initial_mint_locks_minimum() public pure {
        (uint256 minted, uint256 locked) = AmmMath.mintInitial(100_000 ether, 100_000 ether);
        assertEq(locked, PeopleConstants.AMM_MINIMUM_LIQUIDITY);
        assertGt(minted, 0);
    }
}
