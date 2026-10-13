// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StableFeeGateway} from "../src/fees/StableFeeGateway.sol";

/// @notice Owner-run deploy for `StableFeeGateway` (not executed by CI).
///
/// Env (required): GATEWAY_OWNER (PeopleMultisig), GATEWAY_BUYBACK_RECIPIENT (treasury
/// multisig's EVM-mapped address per docs/design/buyback.md §3), GATEWAY_TOKEN_FACTORY,
/// GATEWAY_NFT_FACTORY (the already-deployed, unchanged factories).
///
/// Env (optional, owner-approved pricing — see docs/design/buyback.md §8):
/// GATEWAY_TOKEN_STABLE_FEE_USD6 (default 5_000000 = 5.00 USD for a token launch),
/// GATEWAY_NFT_STABLE_FEE_USD6 (default 10_000000 = 10.00 USD for an NFT mint).
///
/// C-01/S1-02 fix: after this script runs, the factories' owner (the multisig/timelock) must
/// separately call `tokenFactory.setGateway(address(gateway))` and
/// `nftFactory.setGateway(address(gateway))` — this script cannot do it directly, since the
/// factories are owned by a multisig and this script only broadcasts as a single deployer EOA.
/// `payLaunchFee` is unreachable (every `creditPrepaidFee` call reverts `Unauthorized`) until
/// both are wired.
contract DeployStableFeeGateway is Script {
    uint256 internal constant APPROVED_TOKEN_STABLE_FEE_USD6 = 5_000000; // 5.00 USD — owner-approved
    uint256 internal constant APPROVED_NFT_STABLE_FEE_USD6 = 10_000000; // 10.00 USD — owner-approved

    function run() external returns (StableFeeGateway gateway) {
        address owner = vm.envAddress("GATEWAY_OWNER");
        address buybackRecipient = vm.envAddress("GATEWAY_BUYBACK_RECIPIENT");
        address tokenFactory = vm.envAddress("GATEWAY_TOKEN_FACTORY");
        address nftFactory = vm.envAddress("GATEWAY_NFT_FACTORY");
        uint256 tokenStableFeeUsd6 =
            vm.envOr("GATEWAY_TOKEN_STABLE_FEE_USD6", APPROVED_TOKEN_STABLE_FEE_USD6);
        uint256 nftStableFeeUsd6 = vm.envOr("GATEWAY_NFT_STABLE_FEE_USD6", APPROVED_NFT_STABLE_FEE_USD6);

        console2.log("token stable fee (USD, 6dp)", tokenStableFeeUsd6);
        console2.log("nft stable fee (USD, 6dp)", nftStableFeeUsd6);

        vm.startBroadcast();
        gateway = new StableFeeGateway(owner, buybackRecipient, tokenFactory, nftFactory, tokenStableFeeUsd6, nftStableFeeUsd6);
        vm.stopBroadcast();

        console2.log("StableFeeGateway", address(gateway));
        console2.log("chainId", block.chainid);
    }
}
