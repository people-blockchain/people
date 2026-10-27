// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {PplLiquidityEscrow} from "../src/sale/PplLiquidityEscrow.sol";

/// @notice TEST deploy of PplCurveHubV2 + PplLiquidityEscrow. Base Sepolia (84532) and local/fork (31337, 84532) only.
/// Env: SEPOLIA_DEPLOYER_PK, SEPOLIA_VERIFIER_ADDR (required); USDC (default tUSDC); V2_TREASURY (default 0xdEaD).
/// The deployer is owner of both contracts and calls `open()`.
contract DeployPplCurveHubV2 is Script {
    address internal constant TUSDC_BASE_SEPOLIA = 0xd5066Db05658b3AEa4cB1AcdEdAcb80a4B9a7505;
    address internal constant DEFAULT_TREASURY = 0x000000000000000000000000000000000000dEaD;

    function run() external returns (PplCurveHubV2 hub, PplLiquidityEscrow escrow) {
        require(block.chainid == 84532 || block.chainid == 31337, "DeployPplCurveHubV2: only 84532 or 31337");

        uint256 pk = vm.envUint("SEPOLIA_DEPLOYER_PK");
        address verifier = vm.envAddress("SEPOLIA_VERIFIER_ADDR");
        address usdc = vm.envOr("USDC", TUSDC_BASE_SEPOLIA);
        address treasury = vm.envOr("V2_TREASURY", DEFAULT_TREASURY);
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        escrow = new PplLiquidityEscrow(IERC20(usdc), deployer, treasury);
        hub = new PplCurveHubV2(IERC20(usdc), treasury, address(escrow), deployer, verifier);
        hub.open();
        vm.stopBroadcast();

        console2.log("chainid", block.chainid);
        console2.log("deployer/owner", deployer);
        console2.log("usdc", usdc);
        console2.log("treasury", treasury);
        console2.log("verifier", verifier);
        console2.log("escrow", address(escrow));
        console2.log("hub", address(hub));
    }
}
