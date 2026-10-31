// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {LiquidityLock} from "../src/sale/LiquidityLock.sol";

contract LockMockLp is ERC20 {
    constructor() ERC20("LP", "LP") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract LockMockFeeToken is ERC20 {
    constructor() ERC20("FEE", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Burns 1% of every transfer.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

contract LockMockPosition is ERC721 {
    constructor() ERC721("POS", "POS") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

/// @dev Tries to re-enter `release` from the token transfer.
contract LockReentrantToken is ERC20 {
    LiquidityLock public lock;
    bool public reentered;

    constructor() ERC20("RE", "RE") {}

    function setLock(LiquidityLock l) external {
        lock = l;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from == address(lock) && address(lock) != address(0)) {
            try lock.release(IERC20(address(this))) {
                reentered = true;
            } catch {}
        }
    }
}

contract LiquidityLockTest is Test {
    address internal beneficiary = makeAddr("beneficiary");
    address internal attacker = makeAddr("attacker");
    LiquidityLock internal lock;
    LockMockLp internal lp;
    LockMockPosition internal pos;
    uint256 internal unlockAt;

    function setUp() public {
        vm.warp(1_800_000_000);
        unlockAt = block.timestamp + 730 days;
        lock = new LiquidityLock(beneficiary, unlockAt);
        lp = new LockMockLp();
        pos = new LockMockPosition();
        lp.mint(address(lock), 1_000e18);
    }

    // ------------------------------------------------------------ constructor

    function test_lock_constructorSetsImmutables() public view {
        assertEq(lock.beneficiary(), beneficiary);
        assertEq(lock.unlockTime(), unlockAt);
        assertEq(lock.MIN_LOCK(), 730 days);
        assertEq(lock.lockedBalance(IERC20(address(lp))), 1_000e18);
    }

    function test_lock_constructorRejectsLessThan730Days() public {
        uint256 tooEarly = block.timestamp + 730 days - 1;
        vm.expectRevert(
            abi.encodeWithSelector(LiquidityLock.LockTooShort.selector, tooEarly, block.timestamp + 730 days)
        );
        new LiquidityLock(beneficiary, tooEarly);
    }

    function test_lock_constructorRejectsZeroBeneficiary() public {
        vm.expectRevert(LiquidityLock.ZeroBeneficiary.selector);
        new LiquidityLock(address(0), unlockAt);
    }

    function test_lock_constructorAcceptsLongerLock() public {
        LiquidityLock l = new LiquidityLock(beneficiary, block.timestamp + 1000 days);
        assertEq(l.unlockTime(), block.timestamp + 1000 days);
    }

    // ------------------------------------------------------------ ERC-20 release

    function test_lock_releaseOneSecondBeforeUnlockReverts() public {
        vm.warp(unlockAt - 1);
        vm.prank(beneficiary);
        vm.expectRevert(abi.encodeWithSelector(LiquidityLock.StillLocked.selector, unlockAt));
        lock.release(IERC20(address(lp)));
    }

    function test_lock_releaseRightAfterDeployReverts() public {
        vm.prank(beneficiary);
        vm.expectRevert(abi.encodeWithSelector(LiquidityLock.StillLocked.selector, unlockAt));
        lock.release(IERC20(address(lp)));
    }

    function test_lock_releaseAtUnlockSendsWholeBalance() public {
        vm.warp(unlockAt);
        vm.prank(beneficiary);
        uint256 amount = lock.release(IERC20(address(lp)));
        assertEq(amount, 1_000e18);
        assertEq(lp.balanceOf(beneficiary), 1_000e18);
        assertEq(lock.lockedBalance(IERC20(address(lp))), 0);
    }

    function test_lock_nonBeneficiaryCannotRelease() public {
        vm.warp(unlockAt + 365 days);
        vm.prank(attacker);
        vm.expectRevert(LiquidityLock.NotBeneficiary.selector);
        lock.release(IERC20(address(lp)));
    }

    function test_lock_repeatedReleaseGivesNothingExtra() public {
        vm.warp(unlockAt);
        vm.startPrank(beneficiary);
        lock.release(IERC20(address(lp)));
        vm.expectRevert(LiquidityLock.NothingToRelease.selector);
        lock.release(IERC20(address(lp)));
        vm.stopPrank();
        assertEq(lp.balanceOf(beneficiary), 1_000e18);
    }

    function test_lock_strayTokenAlsoLockedUntilUnlock() public {
        LockMockLp stray = new LockMockLp();
        stray.mint(address(lock), 5e18);
        vm.warp(unlockAt - 1);
        vm.prank(beneficiary);
        vm.expectRevert(abi.encodeWithSelector(LiquidityLock.StillLocked.selector, unlockAt));
        lock.release(IERC20(address(stray)));
        vm.warp(unlockAt);
        vm.prank(beneficiary);
        lock.release(IERC20(address(stray)));
        assertEq(stray.balanceOf(beneficiary), 5e18);
    }

    function test_lock_feeOnTransferTokenReleasesWholeBalance() public {
        LockMockFeeToken fee = new LockMockFeeToken();
        fee.mint(address(this), 100e18);
        fee.transfer(address(lock), 100e18); // lock receives 99e18
        assertEq(lock.lockedBalance(IERC20(address(fee))), 99e18);
        vm.warp(unlockAt);
        vm.prank(beneficiary);
        assertEq(lock.release(IERC20(address(fee))), 99e18);
        assertEq(lock.lockedBalance(IERC20(address(fee))), 0);
    }

    function test_lock_reentrancyBlocked() public {
        LockReentrantToken re = new LockReentrantToken();
        re.setLock(lock);
        re.mint(address(lock), 10e18);
        vm.warp(unlockAt);
        vm.prank(beneficiary);
        lock.release(IERC20(address(re)));
        assertFalse(re.reentered());
        assertEq(re.balanceOf(beneficiary), 10e18);
    }

    function testFuzz_lock_releaseOnlyAfterUnlock(uint256 t, address caller) public {
        t = bound(t, block.timestamp, unlockAt + 3650 days);
        vm.warp(t);
        vm.prank(caller);
        if (caller != beneficiary) {
            vm.expectRevert(LiquidityLock.NotBeneficiary.selector);
            lock.release(IERC20(address(lp)));
        } else if (t < unlockAt) {
            vm.expectRevert(abi.encodeWithSelector(LiquidityLock.StillLocked.selector, unlockAt));
            lock.release(IERC20(address(lp)));
        } else {
            lock.release(IERC20(address(lp)));
            assertEq(lp.balanceOf(beneficiary), 1_000e18);
        }
    }

    function testFuzz_lock_constructorBound(uint256 delta) public {
        delta = bound(delta, 0, 3650 days);
        if (delta < 730 days) {
            vm.expectRevert();
            new LiquidityLock(beneficiary, block.timestamp + delta);
        } else {
            LiquidityLock l = new LiquidityLock(beneficiary, block.timestamp + delta);
            assertEq(l.unlockTime(), block.timestamp + delta);
        }
    }

    // ------------------------------------------------------------ ERC-721 positions

    function test_lock_nftSafeTransferAcceptedAndLocked() public {
        pos.mint(address(this), 7);
        pos.safeTransferFrom(address(this), address(lock), 7);
        assertEq(pos.ownerOf(7), address(lock));

        vm.warp(unlockAt - 1);
        vm.prank(beneficiary);
        vm.expectRevert(abi.encodeWithSelector(LiquidityLock.StillLocked.selector, unlockAt));
        lock.releaseNft(IERC721(address(pos)), 7);

        vm.warp(unlockAt);
        vm.prank(attacker);
        vm.expectRevert(LiquidityLock.NotBeneficiary.selector);
        lock.releaseNft(IERC721(address(pos)), 7);

        vm.prank(beneficiary);
        lock.releaseNft(IERC721(address(pos)), 7);
        assertEq(pos.ownerOf(7), beneficiary);
    }

    function test_lock_nftPlainTransferAlsoReleasable() public {
        pos.mint(address(this), 9);
        pos.transferFrom(address(this), address(lock), 9);
        vm.warp(unlockAt);
        vm.prank(beneficiary);
        lock.releaseNft(IERC721(address(pos)), 9);
        assertEq(pos.ownerOf(9), beneficiary);
    }

    // ------------------------------------------------------------ immutability

    /// @notice The ABI exposes exactly these functions; the only non-view ones are `release`,
    /// `releaseNft` and `onERC721Received`. No owner, admin, setter, upgrade or withdraw path.
    function test_lock_abiSelectorsOnlyReleaseIsStateChanging() public view {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/out/LiquidityLock.sol/LiquidityLock.json"));
        string[] memory sigs = vm.parseJsonKeys(json, ".methodIdentifiers");

        string[7] memory expected = [
            "MIN_LOCK()",
            "beneficiary()",
            "lockedBalance(address)",
            "onERC721Received(address,address,uint256,bytes)",
            "release(address)",
            "releaseNft(address,uint256)",
            "unlockTime()"
        ];
        assertEq(sigs.length, expected.length, "unexpected function count");
        for (uint256 i; i < expected.length; ++i) {
            assertTrue(_contains(sigs, expected[i]), expected[i]);
        }

        string[] memory mutating = new string[](sigs.length);
        uint256 n;
        for (uint256 i; vm.keyExistsJson(json, string.concat(".abi[", vm.toString(i), "]")); ++i) {
            string memory entry = string.concat(".abi[", vm.toString(i), "]");
            if (keccak256(bytes(vm.parseJsonString(json, string.concat(entry, ".type")))) != keccak256("function")) {
                continue;
            }
            bytes32 m = keccak256(bytes(vm.parseJsonString(json, string.concat(entry, ".stateMutability"))));
            if (m != keccak256("view") && m != keccak256("pure")) {
                mutating[n++] = vm.parseJsonString(json, string.concat(entry, ".name"));
            }
        }
        assembly {
            mstore(mutating, n)
        }
        assertEq(mutating.length, 3, "unexpected state-changing function count");
        assertTrue(_contains(mutating, "release"));
        assertTrue(_contains(mutating, "releaseNft"));
        assertTrue(_contains(mutating, "onERC721Received"));

        assertEq(LiquidityLock.release.selector, bytes4(keccak256("release(address)")));
    }

    /// @notice Runtime bytecode contains no DELEGATECALL, CALLCODE or SELFDESTRUCT opcode, so the
    /// lock cannot be upgraded, proxied or destroyed.
    function test_lock_bytecodeHasNoDelegatecallOrSelfdestruct() public view {
        bytes memory code = address(lock).code;
        // Strip the CBOR metadata: its length is in the last two bytes.
        uint256 metaLen = (uint256(uint8(code[code.length - 2])) << 8) | uint256(uint8(code[code.length - 1]));
        uint256 end = code.length - metaLen - 2;
        for (uint256 i; i < end; ++i) {
            uint8 op = uint8(code[i]);
            assertTrue(op != 0xf4 && op != 0xf2 && op != 0xff, "forbidden opcode");
            if (op >= 0x60 && op <= 0x7f) i += op - 0x5f; // skip PUSH1..PUSH32 data
        }
    }

    function _contains(string[] memory list, string memory item) internal pure returns (bool) {
        for (uint256 i; i < list.length; ++i) {
            if (keccak256(bytes(list[i])) == keccak256(bytes(item))) return true;
        }
        return false;
    }
}
