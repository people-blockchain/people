// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleFounderNFT} from "../src/nft/PeopleFounderNFT.sol";

/// @notice Deploys `PeopleFounderNFT` to the PEOPLE testnet. Every input comes from the environment:
///   FOUNDER_NFT_DEPLOYER_PK    - deployer private key (never committed; read only at run time)
///   FOUNDER_NFT_OWNER          - admin (intended: a Safe multisig) that may rotate/revoke the signer only
///   FOUNDER_NFT_SIGNER         - backend address whose EIP-712 signatures authorise mint/rebind
///   FOUNDER_NFT_MINT_DEADLINE  - unix timestamp after which `mint` is closed (must be in the future)
/// `vm.envUint`/`vm.envAddress` revert if a variable is absent, so nothing falls back to a default.
contract DeployFounderNFT is Script {
    /// @dev Returns the deployed contract so tests can assert the wiring; `forge script` ignores it.
    function run() external returns (PeopleFounderNFT nft) {
        require(block.chainid == PeopleConstants.PEOPLE_EVM_CHAIN_ID, "wrong chain id");
        uint256 deployerKey = vm.envUint("FOUNDER_NFT_DEPLOYER_PK");
        address owner = vm.envAddress("FOUNDER_NFT_OWNER");
        address signer = vm.envAddress("FOUNDER_NFT_SIGNER");
        uint256 mintDeadline = vm.envUint("FOUNDER_NFT_MINT_DEADLINE");

        vm.startBroadcast(deployerKey);
        nft = new PeopleFounderNFT(owner, signer, mintDeadline);
        vm.stopBroadcast();

        console2.log("PeopleFounderNFT:", address(nft));
        console2.log("owner:", owner);
        console2.log("signer:", signer);
        console2.log("mintDeadline:", mintDeadline);
    }
}
