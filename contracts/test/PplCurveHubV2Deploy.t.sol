// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";

/// @dev Base mainnet deploy guards: only Circle USDC, and the money-receiving roles must be
/// contracts (the 2-of-3 Safe and the liquidity escrow), never a plain key.
contract PplCurveHubV2DeployTest is Test {
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    address internal treasury = makeAddr("treasury");
    address internal owner = makeAddr("owner");
    address internal receiver = makeAddr("liquidityReceiver");
    address internal verifier = makeAddr("verifier");

    function _etchUsdcAtCanonicalAddress() internal {
        MockUSDC mock = new MockUSDC();
        vm.etch(BASE_USDC, address(mock).code);
    }

    function _etchRoles() internal {
        vm.etch(treasury, hex"00");
        vm.etch(owner, hex"00");
        vm.etch(receiver, hex"00");
    }

    function _deploy(address token) internal returns (PplCurveHubV2) {
        return new PplCurveHubV2(IERC20(token), treasury, receiver, owner, verifier, address(0));
    }

    function test_baseMainnetConstantsMatchCircleUsdc() public {
        PplCurveHubV2 hub = _deploy(address(new MockUSDC()));
        assertEq(hub.BASE_MAINNET_USDC(), BASE_USDC);
        assertEq(hub.BASE_MAINNET_CHAIN_ID(), 8453);
    }

    function test_baseMainnetRejectsAnyTokenButCircleUsdc() public {
        MockUSDC other = new MockUSDC();
        _etchRoles();
        vm.chainId(8453);
        vm.expectRevert(PplCurveHubV2.NotBaseUsdc.selector);
        _deploy(address(other));
    }

    function test_baseMainnetRejectsPlainKeyTreasury() public {
        _etchUsdcAtCanonicalAddress();
        vm.etch(owner, hex"00");
        vm.etch(receiver, hex"00");
        vm.chainId(8453);
        vm.expectRevert(PplCurveHubV2.NotContract.selector);
        _deploy(BASE_USDC);
    }

    function test_baseMainnetRejectsPlainKeyOwner() public {
        _etchUsdcAtCanonicalAddress();
        vm.etch(treasury, hex"00");
        vm.etch(receiver, hex"00");
        vm.chainId(8453);
        vm.expectRevert(PplCurveHubV2.NotContract.selector);
        _deploy(BASE_USDC);
    }

    function test_baseMainnetRejectsPlainKeyLiquidityReceiver() public {
        _etchUsdcAtCanonicalAddress();
        vm.etch(treasury, hex"00");
        vm.etch(owner, hex"00");
        vm.chainId(8453);
        vm.expectRevert(PplCurveHubV2.NotContract.selector);
        _deploy(BASE_USDC);
    }

    function test_baseMainnetDeploysWithCircleUsdcAndContractRoles() public {
        _etchUsdcAtCanonicalAddress();
        _etchRoles();
        vm.chainId(8453);
        PplCurveHubV2 hub = _deploy(BASE_USDC);
        assertEq(address(hub.usdc()), BASE_USDC);
        assertEq(hub.treasury(), treasury);
        assertEq(hub.liquidityReceiver(), receiver);
    }

    function test_testnetStillAcceptsMockTokenAndPlainKeys() public {
        vm.chainId(84532);
        PplCurveHubV2 hub = _deploy(address(new MockUSDC()));
        assertEq(hub.treasury(), treasury);
    }
}
