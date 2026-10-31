// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PplReturnBurn} from "../src/sale/PplReturnBurn.sol";

/// @notice Owner decision A1: PPL sold back to the hub are burned on the PEOPLE network.
contract PplReturnBurnTest is Test {
    PplReturnBurn internal burner;

    address internal constant HUB = address(0x4B0B);
    address internal constant SELLER = address(0x5E11);
    bytes32 internal constant PERSON = keccak256("person");
    address internal alice = makeAddr("alice");

    event ReturnBurned(
        bytes32 indexed returnId,
        address indexed from,
        address indexed hub,
        bytes32 personId,
        address seller,
        uint256 amount
    );

    function setUp() public {
        burner = new PplReturnBurn();
        vm.deal(alice, 100 ether);
    }

    function test_burn_emitsAndCounts() public {
        bytes32 expectedId = keccak256(abi.encode(block.chainid, address(burner), uint256(0)));
        vm.expectEmit(address(burner));
        emit ReturnBurned(expectedId, alice, HUB, PERSON, SELLER, 3 ether);
        vm.prank(alice);
        bytes32 id = burner.burnForReturn{value: 3 ether}(HUB, PERSON, SELLER);

        assertEq(id, expectedId);
        assertEq(burner.totalBurned(), 3 ether);
        assertEq(burner.returnCount(), 1);
        assertEq(address(burner).balance, 3 ether);
        assertEq(alice.balance, 97 ether);
    }

    function test_burn_returnIdsUnique() public {
        vm.startPrank(alice);
        bytes32 a = burner.burnForReturn{value: 1 ether}(HUB, PERSON, SELLER);
        bytes32 b = burner.burnForReturn{value: 1 ether}(HUB, PERSON, SELLER);
        vm.stopPrank();
        assertTrue(a != b);
        assertEq(burner.totalBurned(), 2 ether);
    }

    function test_burn_zeroValueReverts() public {
        vm.prank(alice);
        vm.expectRevert(PplReturnBurn.ZeroAmount.selector);
        burner.burnForReturn(HUB, PERSON, SELLER);
    }

    function test_burn_zeroParamsRevert() public {
        vm.startPrank(alice);
        vm.expectRevert(PplReturnBurn.ZeroAddress.selector);
        burner.burnForReturn{value: 1}(address(0), PERSON, SELLER);
        vm.expectRevert(PplReturnBurn.ZeroAddress.selector);
        burner.burnForReturn{value: 1}(HUB, bytes32(0), SELLER);
        vm.expectRevert(PplReturnBurn.ZeroAddress.selector);
        burner.burnForReturn{value: 1}(HUB, PERSON, address(0));
        vm.stopPrank();
    }

    /// @notice No receive/fallback: plain sends and unknown calls revert, so PPL only enter via
    /// `burnForReturn` (and always with a `ReturnBurned` event).
    function test_burn_plainSendAndUnknownCallRevert() public {
        vm.startPrank(alice);
        (bool ok,) = address(burner).call{value: 1 ether}("");
        assertFalse(ok, "plain send");
        (ok,) = address(burner).call(abi.encodeWithSignature("withdraw()"));
        assertFalse(ok, "withdraw");
        (ok,) = address(burner).call{value: 1 ether}(hex"deadbeef");
        assertFalse(ok, "unknown selector");
        vm.stopPrank();
        assertEq(address(burner).balance, 0);
    }

    /// @notice Burned PPL never leave: the only state-changing function is `burnForReturn`.
    function test_burn_abiOnlyBurnIsStateChanging() public view {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/out/PplReturnBurn.sol/PplReturnBurn.json"));
        string[] memory sigs = vm.parseJsonKeys(json, ".methodIdentifiers");
        assertEq(sigs.length, 3, "unexpected function count");
        assertTrue(_contains(sigs, "burnForReturn(address,bytes32,address)"));
        assertTrue(_contains(sigs, "totalBurned()"));
        assertTrue(_contains(sigs, "returnCount()"));

        uint256 mutating;
        for (uint256 i; vm.keyExistsJson(json, string.concat(".abi[", vm.toString(i), "]")); ++i) {
            string memory entry = string.concat(".abi[", vm.toString(i), "]");
            if (keccak256(bytes(vm.parseJsonString(json, string.concat(entry, ".type")))) != keccak256("function")) {
                continue;
            }
            bytes32 m = keccak256(bytes(vm.parseJsonString(json, string.concat(entry, ".stateMutability"))));
            if (m != keccak256("view") && m != keccak256("pure")) {
                ++mutating;
                assertEq(vm.parseJsonString(json, string.concat(entry, ".name")), "burnForReturn");
            }
        }
        assertEq(mutating, 1, "unexpected state-changing function count");
    }

    /// @notice Runtime bytecode has no DELEGATECALL, CALLCODE, SELFDESTRUCT or CALL, so nothing
    /// can move the burned balance out.
    function test_burn_bytecodeHasNoValueExit() public view {
        bytes memory code = address(burner).code;
        uint256 metaLen = (uint256(uint8(code[code.length - 2])) << 8) | uint256(uint8(code[code.length - 1]));
        uint256 end = code.length - metaLen - 2;
        for (uint256 i; i < end; ++i) {
            uint8 op = uint8(code[i]);
            assertTrue(op != 0xf1 && op != 0xf2 && op != 0xf4 && op != 0xff, "forbidden opcode");
            if (op >= 0x60 && op <= 0x7f) i += op - 0x5f;
        }
    }

    function testFuzz_burn_balanceEqualsTotal(uint96 a, uint96 b) public {
        vm.assume(a > 0 && b > 0);
        vm.deal(alice, uint256(a) + b);
        vm.startPrank(alice);
        burner.burnForReturn{value: a}(HUB, PERSON, SELLER);
        burner.burnForReturn{value: b}(HUB, PERSON, alice);
        vm.stopPrank();
        assertEq(burner.totalBurned(), uint256(a) + b);
        assertEq(address(burner).balance, burner.totalBurned());
    }

    function _contains(string[] memory list, string memory item) internal pure returns (bool) {
        for (uint256 i; i < list.length; ++i) {
            if (keccak256(bytes(list[i])) == keccak256(bytes(item))) return true;
        }
        return false;
    }
}
