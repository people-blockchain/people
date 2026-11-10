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
///   OWNER                  the 2-of-3 PeopleMultisig contract on the PEOPLE mainnet (docs/MAINNET-LAUNCH.md)
///   RELAYER                address of the delivery relayer key
///   BASE_HUB               PplCurveHubV2 address on Base
///   BASE_CHAIN_ID          8453 for the real sale
///   COMMUNITY_POOL         where unsold PPL go at the end
///   REPORTER_CREDIT_LIMIT  initial reporter credit cap in PPL wei (required, 1,000..100,000,000 PPL)
///   REPORTER_CREDIT_PERIOD initial reporter credit window, seconds (optional, default 86400 = 1 day;
///                          1 hour..7 days)
///
/// Broadcast with `--slow` from a fresh deployer key with no pending transactions: the reporter is
/// the predicted address (deployer nonce + 1), so nothing else may be sent from that key in between.
///
/// Refuses to run on the PEOPLE testnet (97401) unless ALLOW_TEST_CHAIN=true.
///
/// The distributor address is predicted and passed to `PplReturnBurn` as both its immutable
/// `returnRecipient` and its initial `purchaseReporter`, with the reporter credit cap set from the
/// env vars above. Delivery therefore works immediately after deploy: no queue/48 h wait is needed
/// before the first `deliver`.
///
/// What the owners must do afterwards (in this order):
///   1. Send the sale PPL to the distributor (plain transfer).
///   2. Start the relayer (contracts/scripts/sale-delivery-relayer.mjs) with RELAYER's key.
///
/// Later changes to the reporter or the credit cap still take the 48 h `ADMIN_TIMELOCK`
/// (queue/execute/cancel), via `PplReturnBurn.queueSetPurchaseReporter` and
/// `queueSetReporterCreditCap`.
contract DeployPplSaleDelivery is Script {
    uint256 internal constant PEOPLE_TESTNET = 97401;
    uint256 internal constant MIN_CREDIT_LIMIT = 1_000 ether;
    uint256 internal constant MAX_CREDIT_LIMIT = 100_000_000 ether; // the whole sale bucket

    function run() external returns (PplReturnBurn burn, PplSaleDistributor dist) {
        address owner = vm.envAddress("OWNER");
        address relayer = vm.envAddress("RELAYER");
        address hub = vm.envAddress("BASE_HUB");
        uint256 baseChainId = vm.envUint("BASE_CHAIN_ID");
        address pool = vm.envAddress("COMMUNITY_POOL");
        uint256 reporterCreditLimit = vm.envUint("REPORTER_CREDIT_LIMIT");
        uint256 reporterCreditPeriod = vm.envOr("REPORTER_CREDIT_PERIOD", uint256(86400));
        if (block.chainid == PEOPLE_TESTNET) require(vm.envOr("ALLOW_TEST_CHAIN", false), "refusing: PEOPLE testnet");
        require(owner.code.length > 0 || block.chainid == 31337 || block.chainid == PEOPLE_TESTNET, "OWNER must be the Safe (a contract)");
        require(relayer != owner, "RELAYER must not be the Safe");
        // Sanity bounds: a unit mistake (PPL instead of wei) would stall every delivery until a 48 h
        // cap change, and an unbounded cap would no longer limit a stolen relayer key.
        require(reporterCreditLimit > 0, "REPORTER_CREDIT_LIMIT must be > 0");
        require(
            reporterCreditLimit >= MIN_CREDIT_LIMIT && reporterCreditLimit <= MAX_CREDIT_LIMIT,
            "REPORTER_CREDIT_LIMIT must be 1,000..100,000,000 PPL in wei"
        );
        require(reporterCreditPeriod > 0, "REPORTER_CREDIT_PERIOD must be > 0");
        require(
            reporterCreditPeriod >= 1 hours && reporterCreditPeriod <= 7 days,
            "REPORTER_CREDIT_PERIOD must be 1 hour..7 days"
        );
        require(pool != address(0), "COMMUNITY_POOL required");

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        require(broadcaster != owner, "deployer key must not be the Safe");
        require(broadcaster != relayer, "deployer key must not be the relayer");
        address predicted = vm.computeCreateAddress(broadcaster, vm.getNonce(broadcaster) + 1);
        burn = new PplReturnBurn(owner, predicted, predicted, reporterCreditLimit, reporterCreditPeriod);
        dist = new PplSaleDistributor(owner, relayer, IPplReturnBurnCredit(address(burn)), baseChainId, hub, pool);
        vm.stopBroadcast();

        // These checks run against the local simulation. After broadcasting, repeat them against
        // the live RPC (docs/MAINNET-LAUNCH.md) before funding the distributor or opening the sale.
        require(address(dist) == predicted, "check: predicted distributor");
        require(address(dist.returnBurn()) == address(burn), "check: distributor returnBurn");
        require(pool != address(burn) && pool != address(dist), "check: pool is not a sale contract");
        require(burn.returnRecipient() == address(dist), "check: return recipient");
        require(burn.purchaseReporter() == address(dist), "check: reporter");
        require(burn.reporterCreditLimit() == reporterCreditLimit, "check: credit limit");
        require(burn.reporterCreditPeriod() == reporterCreditPeriod, "check: credit period");
        require(burn.owner() == owner && dist.owner() == owner, "check: owner");
        require(dist.relayer() == relayer, "check: relayer");
        require(dist.baseHub() == hub && dist.baseChainId() == baseChainId, "check: hub");
        require(dist.communityPool() == pool, "check: pool");

        console2.log("chainId", block.chainid);
        console2.log("PplReturnBurn", address(burn));
        console2.log("PplSaleDistributor", address(dist));
        console2.log("reporter credit limit (whole PPL)", reporterCreditLimit / 1 ether);
        console2.log("reporter credit period (seconds)", reporterCreditPeriod);
    }
}
