// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NftFactory} from "../src/nft/NftFactory.sol";

contract NftFactoryTest is Test {
    NftFactory factory;
    address feeRecipient = address(0xFEE);
    address creator = address(0xC0DE);
    address attacker = address(0xBAD);

    function setUp() public {
        factory = new NftFactory(feeRecipient, address(this), address(this));
        vm.deal(creator, 10 ether);
        vm.deal(attacker, 10 ether);
    }

    function testCreatorCanMintIntoOwnCollection() public {
        vm.prank(creator);
        address collection = factory.createCollection("Creator Collection", "CC");
        uint256 fee = factory.mintFee();
        vm.prank(creator);
        factory.mint{value: fee}(collection, "ipfs://a");
    }

    function testAttackerCannotMintIntoSomeoneElsesCollection() public {
        vm.prank(creator);
        address collection = factory.createCollection("Creator Collection", "CC");
        uint256 fee = factory.mintFee();
        vm.prank(attacker);
        vm.expectRevert(NftFactory.Unauthorized.selector);
        factory.mint{value: fee}(collection, "ipfs://a");
    }
}
