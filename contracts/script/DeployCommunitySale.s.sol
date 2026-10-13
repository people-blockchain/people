// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {PeopleCommunitySale} from "../src/sale/PeopleCommunitySale.sol";

/// @notice Owner-run mainnet deploy (not executed by CI).
/// Env: SALE_STABLECOIN, SALE_TREASURY (multisig), SALE_DEPLOYMENTS_OUT (optional path)
contract DeployCommunitySale is Script {
    function run() external returns (PeopleCommunitySale sale) {
        address stable = vm.envAddress("SALE_STABLECOIN");
        address treasury = vm.envAddress("SALE_TREASURY");
        // M05-6: BNB Chain stablecoins report 18 decimals, not 6 — log it so the
        // operator can confirm before broadcasting (the constructor also enforces >= 6).
        uint8 stableDecimals = IERC20Metadata(stable).decimals();
        console2.log("stablecoin decimals", stableDecimals);
        vm.startBroadcast();
        // AUD-M8: owner = the same treasury multisig already receiving sale proceeds, so pause
        // and ownership rotation are governed by the same signers as the funds themselves.
        sale = new PeopleCommunitySale(stable, treasury, treasury);
        vm.stopBroadcast();
        console2.log("PeopleCommunitySale", address(sale));
        console2.log("chainId", block.chainid);
    }
}
