// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployFounderNFT} from "../script/DeployFounderNFT.s.sol";
import {PeopleFounderNFT} from "../src/nft/PeopleFounderNFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev `vm.setEnv` mutates process-wide state and forge runs the tests of one contract in parallel,
/// so every scenario lives in a single sequential test instead of one test per case.
contract DeployFounderNFTTest is Test {
    function test_run_envDrivenAndChainGuarded() public {
        vm.warp(1_800_000_000);
        DeployFounderNFT deployScript = new DeployFounderNFT();
        address signer = makeAddr("founder-signer");
        address owner = makeAddr("founder-owner-safe");
        uint256 mintDeadline = block.timestamp + 30 days;
        // Test-only key derived in code; the script reads it from the environment like a real run.
        vm.setEnv("FOUNDER_NFT_DEPLOYER_PK", vm.toString(uint256(keccak256("founder-nft.test.deployer"))));
        vm.setEnv("FOUNDER_NFT_OWNER", vm.toString(owner));
        vm.setEnv("FOUNDER_NFT_SIGNER", vm.toString(signer));
        vm.setEnv("FOUNDER_NFT_MINT_DEADLINE", vm.toString(mintDeadline));

        // wrong chain -> revert before anything is deployed
        vm.chainId(1);
        vm.expectRevert(bytes("wrong chain id"));
        deployScript.run();

        // PEOPLE testnet -> deploys with the env parameters
        vm.chainId(97401);
        PeopleFounderNFT nft = deployScript.run();
        assertEq(nft.owner(), owner);
        assertEq(nft.signer(), signer);
        assertEq(nft.mintDeadline(), mintDeadline);
        assertEq(nft.totalMinted(), 0);

        // bad env values are rejected by the contract constructor
        vm.setEnv("FOUNDER_NFT_MINT_DEADLINE", vm.toString(block.timestamp));
        vm.expectRevert(PeopleFounderNFT.InvalidMintDeadline.selector);
        deployScript.run();
        // a revert inside `run()` skips its `stopBroadcast`; the test must close the broadcast itself
        vm.stopBroadcast();

        vm.setEnv("FOUNDER_NFT_MINT_DEADLINE", vm.toString(mintDeadline));
        vm.setEnv("FOUNDER_NFT_SIGNER", vm.toString(address(0)));
        vm.expectRevert(PeopleFounderNFT.ZeroSigner.selector);
        deployScript.run();
        vm.stopBroadcast();

        vm.setEnv("FOUNDER_NFT_SIGNER", vm.toString(signer));
        vm.setEnv("FOUNDER_NFT_OWNER", vm.toString(address(0)));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        deployScript.run();
    }
}
