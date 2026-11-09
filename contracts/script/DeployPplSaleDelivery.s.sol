// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PplReturnBurn} from "../src/sale/PplReturnBurn.sol";
import {PplSaleDistributor, IPplReturnBurnCredit} from "../src/sale/PplSaleDistributor.sol";

/// @notice PEOPLE-mainnet side of the PPL sale: `PplReturnBurn` (returns for sell-back) and
/// `PplSaleDistributor` (pays Base purchases). Returned PPL go back into the distributor, so the
/// distributor address is predicted and passed to `PplReturnBurn` as its immutable recipient.
/// Not run by CI.
///
/// Env:
///   OWNER             the 2-of-3 Safe on the PEOPLE mainnet
///   RELAYER           address of the delivery relayer key
///   BASE_HUB          PplCurveHubV2 address on Base
///   BASE_CHAIN_ID     8453 for the real sale
///   COMMUNITY_POOL    where unsold PPL go at the end
///
/// Refuses to run on the PEOPLE testnet (97401) unless ALLOW_TEST_CHAIN=true.
///
/// What the Safe must send afterwards (in this order):
///   1. PplReturnBurn.queueSetPurchaseReporter(distributor) and queueSetReporterCreditCap(limit, 1 days);
///      execute both after 48 h. Deliveries revert until both are set, so do this right after deploy.
///   2. Send the sale PPL to the distributor (plain transfer).
///   3. Start the relayer (contracts/scripts/sale-delivery-relayer.mjs) with RELAYER's key.
contract DeployPplSaleDelivery is Script {
    uint256 internal constant PEOPLE_TESTNET = 97401;

    function run() external returns (PplReturnBurn burn, PplSaleDistributor dist) {
        address owner = vm.envAddress("OWNER");
        address relayer = vm.envAddress("RELAYER");
        address hub = vm.envAddress("BASE_HUB");
        uint256 baseChainId = vm.envUint("BASE_CHAIN_ID");
        address pool = vm.envAddress("COMMUNITY_POOL");
        if (block.chainid == PEOPLE_TESTNET) require(vm.envOr("ALLOW_TEST_CHAIN", false), "refusing: PEOPLE testnet");
        require(owner.code.length > 0 || block.chainid == 31337 || block.chainid == PEOPLE_TESTNET, "OWNER must be the Safe (a contract)");
        require(relayer != owner, "RELAYER must not be the Safe");

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        require(broadcaster != owner, "deployer key must not be the Safe");
        address predicted = vm.computeCreateAddress(broadcaster, vm.getNonce(broadcaster) + 1);
        burn = new PplReturnBurn(owner, predicted);
        dist = new PplSaleDistributor(owner, relayer, IPplReturnBurnCredit(address(burn)), baseChainId, hub, pool);
        vm.stopBroadcast();

        require(address(dist) == predicted, "check: predicted distributor");
        require(burn.returnRecipient() == address(dist), "check: return recipient");
        require(burn.owner() == owner && dist.owner() == owner, "check: owner");
        require(dist.relayer() == relayer, "check: relayer");
        require(dist.baseHub() == hub && dist.baseChainId() == baseChainId, "check: hub");
        require(dist.communityPool() == pool, "check: pool");

        console2.log("chainId", block.chainid);
        console2.log("PplReturnBurn", address(burn));
        console2.log("PplSaleDistributor", address(dist));
    }
}
