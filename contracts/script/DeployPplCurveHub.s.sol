// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PplCurveHub} from "../src/sale/PplCurveHub.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

/// @notice Deploy of the PPL curve hub (not executed by CI).
/// Env: OWNER (Safe), TREASURY, USDC_ADDRESS, USDT_ADDRESS (optional when DEPLOY_MOCKS=true),
/// DEPLOY_MOCKS (default false, test networks only), OPEN_SALE (default false).
/// `setToken` and `open` are owner-only: they run here only when the broadcaster is the OWNER;
/// otherwise the owner (a Safe) must send them after the deploy.
contract DeployPplCurveHub is Script {
    function run() external returns (PplCurveHub hub) {
        address owner = vm.envAddress("OWNER");
        address treasury = vm.envAddress("TREASURY");
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        address usdt = vm.envOr("USDT_ADDRESS", address(0));
        bool deployMocks = vm.envOr("DEPLOY_MOCKS", false);
        bool openSale = vm.envOr("OPEN_SALE", false);

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();

        if (deployMocks) {
            usdc = address(new MockUSDC());
            usdt = address(new MockUSDT());
            console2.log("MockUSDC", usdc);
            console2.log("MockUSDT", usdt);
        }

        hub = new PplCurveHub(owner, treasury);

        bool isOwner = broadcaster == owner;
        if (isOwner) {
            if (usdc != address(0)) hub.setToken(usdc, true);
            if (usdt != address(0)) hub.setToken(usdt, true);
            if (openSale) hub.open();
        }
        vm.stopBroadcast();

        console2.log("PplCurveHub", address(hub));
        console2.log("owner", owner);
        console2.log("treasury", treasury);
        console2.log("chainId", block.chainid);
        if (!isOwner) {
            console2.log("WARNING: broadcaster is not OWNER; tokens are NOT allowlisted and the sale is NOT open.");
            console2.log("The owner must call setToken for USDC/USDT and then open().");
            if (usdc != address(0)) console2.log("allowlist USDC", usdc);
            if (usdt != address(0)) console2.log("allowlist USDT", usdt);
            if (openSale) console2.log("OPEN_SALE requested: owner must call open()");
        }
    }
}
