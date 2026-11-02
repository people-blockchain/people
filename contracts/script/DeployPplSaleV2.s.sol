// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {ReserveLiquidityEscrow} from "../src/sale/ReserveLiquidityEscrow.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Base-side deploy of the PPL sale v2: `ReserveLiquidityEscrow` first, then `PplCurveHubV2`
/// with the escrow as its immutable `liquidityReceiver`. Not run by CI.
///
/// Env:
///   OWNER     the 2-of-3 Safe (owner of hub and escrow)
///   TREASURY  the Safe that receives 50% of each purchase (may equal OWNER)
///   VERIFIER  purchase-verification signer address (server key / KMS address)
///   USDC_ADDRESS               optional; on Base mainnet must be Circle USDC (default)
///   REWARD_BUYER_FORBIDDEN     optional; address that may never buy (reward distributor)
///   DEPLOY_MOCK_USDC=true      Base Sepolia / local only: deploy a valueless TEST USDC
///
/// What this script does NOT do (owner = Safe must send these afterwards, in this order):
///   1. queueSetReturnVerifier(server A) and queueSetReturnCosigner(server B); execute both
///      after 48 h. On Base mainnet sell-back reverts (`CosignerRequired`) until the cosigner is set.
///      Sell-back cannot start before 30 days after the first purchase, so queue them at deploy.
///   2. open() on the chosen start date. Nothing can be bought before it.
/// Nothing here opens the sale or moves money.
contract DeployPplSaleV2 is Script {
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external returns (PplCurveHubV2 hub, ReserveLiquidityEscrow escrow) {
        address owner = vm.envAddress("OWNER");
        address treasury = vm.envAddress("TREASURY");
        address verifier = vm.envAddress("VERIFIER");
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        address forbidden = vm.envOr("REWARD_BUYER_FORBIDDEN", address(0));
        bool mock = vm.envOr("DEPLOY_MOCK_USDC", false);

        if (block.chainid == 8453) {
            require(!mock, "mainnet: no mock USDC");
            if (usdc == address(0)) usdc = BASE_USDC;
            require(usdc == BASE_USDC, "mainnet: USDC must be Circle USDC");
            require(owner.code.length > 0, "mainnet: OWNER must be the Safe (a contract)");
            require(treasury.code.length > 0, "mainnet: TREASURY must be the Safe (a contract)");
        } else if (mock) {
            require(block.chainid == 84532 || block.chainid == 31337, "mock USDC: Base Sepolia or local only");
            require(usdc == address(0), "mock USDC: leave USDC_ADDRESS unset");
        } else {
            require(usdc != address(0), "USDC_ADDRESS required");
        }
        require(verifier != address(0), "VERIFIER required");

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        if (block.chainid == 8453) {
            require(broadcaster != owner && broadcaster != treasury, "mainnet: deployer key must not be a Safe");
        }
        if (mock) {
            usdc = address(new MockUSDC());
            console2.log("MockUSDC (TEST, no value)", usdc);
        }
        escrow = new ReserveLiquidityEscrow(IERC20(usdc), owner, treasury);
        hub = new PplCurveHubV2(IERC20(usdc), treasury, address(escrow), owner, verifier, forbidden);
        vm.stopBroadcast();

        // Read-back checks: fail loudly if anything is not what was asked for.
        require(address(hub.usdc()) == usdc, "check: usdc");
        require(hub.treasury() == treasury, "check: treasury");
        require(hub.liquidityReceiver() == address(escrow), "check: receiver");
        require(hub.owner() == owner, "check: hub owner");
        require(hub.verifier() == verifier, "check: verifier");
        require(hub.openedAt() == 0, "check: not open");
        require(escrow.owner() == owner, "check: escrow owner");
        require(escrow.treasury() == treasury, "check: escrow treasury");

        console2.log("chainId", block.chainid);
        console2.log("deployer", broadcaster);
        console2.log("USDC", usdc);
        console2.log("ReserveLiquidityEscrow", address(escrow));
        console2.log("PplCurveHubV2", address(hub));
        console2.log("owner (Safe)", owner);
        console2.log("treasury (Safe)", treasury);
    }
}
