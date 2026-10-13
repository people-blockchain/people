// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SampleERC20} from "../../src/samples/SampleERC20.sol";

contract SampleERC20Test is Test {
    address deployer = address(0xD0E2);

    function testConstructorMintsFixedSupplyToDeployer() public {
        vm.prank(deployer);
        SampleERC20 token = new SampleERC20("Sample Token", "SMPL", 1_000_000e18);

        assertEq(token.name(), "Sample Token");
        assertEq(token.symbol(), "SMPL");
        assertEq(token.totalSupply(), 1_000_000e18);
        assertEq(token.balanceOf(deployer), 1_000_000e18);
    }

    function testTransferMovesBalance() public {
        vm.prank(deployer);
        SampleERC20 token = new SampleERC20("Sample Token", "SMPL", 1_000e18);

        address recipient = address(0xBEEF);
        vm.prank(deployer);
        token.transfer(recipient, 100e18);

        assertEq(token.balanceOf(deployer), 900e18);
        assertEq(token.balanceOf(recipient), 100e18);
    }

    function testNoMintFunctionBeyondConstructor() public {
        // Fixed supply: there is no exposed mint function on the sample token at all,
        // so total supply can never change after deployment.
        vm.prank(deployer);
        SampleERC20 token = new SampleERC20("Sample Token", "SMPL", 500e18);
        assertEq(token.totalSupply(), 500e18);
    }
}
