// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GenesisLiquidityVault} from "../src/sale/GenesisLiquidityVault.sol";
import {LiquidityLock} from "../src/sale/LiquidityLock.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeoplePair} from "../src/amm/PeoplePair.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Owner decision (open question 6): genesis liquidity can only seed the WPPL/quote pool,
/// and the LP goes straight into a 730-day LiquidityLock. Every other path reverts.
contract GenesisLiquidityVaultTest is Test {
    /// Keyless address the genesis places the vault at (nobody holds its private key).
    address internal constant VAULT = address(uint160(uint256(keccak256("PEOPLE genesis liquidity vault"))));
    uint256 internal constant BUCKET = 50_000_000 ether;
    /// Floor: 0.01 USDC (6 decimals) per PPL.
    uint256 internal constant FLOOR = 10_000;

    GenesisLiquidityVault internal vault;
    WPPL internal wppl;
    PeopleAmmFactory internal factory;
    MockUSDC internal usdc;

    address internal seeder = makeAddr("seeder");
    address internal beneficiary = makeAddr("beneficiary");
    address internal owner = makeAddr("owner");
    address internal attacker = makeAddr("attacker");

    function setUp() public {
        wppl = new WPPL();
        factory = new PeopleAmmFactory(makeAddr("registry"));
        usdc = new MockUSDC();
        _genesisVault(address(wppl), address(factory), address(usdc), beneficiary, seeder, FLOOR);
        usdc.mint(seeder, 10_000_000e6);
        vm.prank(seeder);
        usdc.approve(VAULT, type(uint256).max);
    }

    /// @dev Places the vault the way genesis does: runtime code + storage slots 0..5 + bank
    /// balance, with no constructor run at that address.
    function _genesisVault(address w, address f, address q, address b, address s, uint256 floor) internal {
        GenesisLiquidityVault ref = new GenesisLiquidityVault(address(0), address(0), address(0), address(0), address(0), 0);
        vm.etch(VAULT, address(ref).code);
        vm.store(VAULT, bytes32(uint256(0)), bytes32(uint256(uint160(w))));
        vm.store(VAULT, bytes32(uint256(1)), bytes32(uint256(uint160(f))));
        vm.store(VAULT, bytes32(uint256(2)), bytes32(uint256(uint160(q))));
        vm.store(VAULT, bytes32(uint256(3)), bytes32(uint256(uint160(b))));
        vm.store(VAULT, bytes32(uint256(4)), bytes32(uint256(uint160(s))));
        vm.store(VAULT, bytes32(uint256(5)), bytes32(floor));
        vm.deal(VAULT, BUCKET);
        vault = GenesisLiquidityVault(VAULT);
    }

    function _seed(uint256 ppl, uint256 quote) internal returns (address lock, uint256 liquidity) {
        vm.prank(seeder);
        return vault.seed(ppl, quote, 0, 0);
    }

    function _pair() internal view returns (PeoplePair) {
        return PeoplePair(factory.getPair(address(wppl), address(usdc)));
    }

    // ------------------------------------------------------------ genesis layout

    function test_vault_storageSlotsMatchGenesisLayout() public view {
        assertEq(vault.wppl(), address(wppl));
        assertEq(vault.factory(), address(factory));
        assertEq(vault.quoteToken(), address(usdc));
        assertEq(vault.beneficiary(), beneficiary);
        assertEq(vault.seeder(), seeder);
        assertEq(vault.minQuotePerPpl(), FLOOR);
        assertEq(VAULT.balance, BUCKET);
    }

    /// @notice chain/emission/genesis-liquidity-vault.json is what apply-emission-genesis.py puts
    /// into genesis: it must be this exact runtime code at the keyless address.
    function test_vault_genesisArtifactMatchesBuild() public view {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/../chain/emission/genesis-liquidity-vault.json"));
        assertEq(vm.parseJsonAddress(json, ".address"), VAULT, "address");
        assertEq(
            keccak256(bytes(vm.parseJsonString(json, ".address_preimage"))),
            keccak256("PEOPLE genesis liquidity vault"),
            "preimage"
        );
        bytes memory code = vm.parseBytes(string.concat("0x", vm.parseJsonString(json, ".runtime_code")));
        assertEq(keccak256(code), keccak256(type(GenesisLiquidityVault).runtimeCode), "runtime code");
        assertEq(keccak256(code), keccak256(VAULT.code), "etched code");
        assertEq(vm.parseJsonUint(json, ".slots.wppl"), 0);
        assertEq(vm.parseJsonUint(json, ".slots.factory"), 1);
        assertEq(vm.parseJsonUint(json, ".slots.quote_token"), 2);
        assertEq(vm.parseJsonUint(json, ".slots.beneficiary"), 3);
        assertEq(vm.parseJsonUint(json, ".slots.seeder"), 4);
        assertEq(vm.parseJsonUint(json, ".slots.min_quote_per_ppl"), 5);
    }

    // ------------------------------------------------------------ the one allowed path

    function test_vault_seedLocksAllLpFor730Days() public {
        uint256 ppl = 1_000_000 ether;
        uint256 quote = 10_000e6; // exactly the floor price
        (address lock, uint256 liquidity) = _seed(ppl, quote);

        PeoplePair pair = _pair();
        assertTrue(address(pair) != address(0));
        assertGt(liquidity, 0);
        assertEq(pair.balanceOf(lock), liquidity, "all LP in the lock");
        assertEq(pair.totalSupply(), liquidity + pair.MINIMUM_LIQUIDITY());
        assertEq(pair.balanceOf(VAULT), 0);
        assertEq(pair.balanceOf(seeder), 0);
        assertEq(pair.balanceOf(beneficiary), 0);
        assertEq(LiquidityLock(lock).beneficiary(), beneficiary);
        assertEq(LiquidityLock(lock).unlockTime(), block.timestamp + 730 days);
        assertEq(VAULT.balance, BUCKET - ppl);
        assertEq(wppl.balanceOf(VAULT), 0, "no WPPL left in the vault");
        assertEq(wppl.balanceOf(address(pair)), ppl);
        assertEq(usdc.balanceOf(address(pair)), quote);
    }

    function test_vault_lockReleasesOnlyAfter730DaysToBeneficiary() public {
        (address lock, uint256 liquidity) = _seed(1_000_000 ether, 20_000e6);
        IERC20 lp = IERC20(address(_pair()));

        vm.warp(block.timestamp + 730 days - 1);
        vm.prank(beneficiary);
        vm.expectRevert();
        LiquidityLock(lock).release(lp);
        vm.prank(seeder);
        vm.expectRevert(LiquidityLock.NotBeneficiary.selector);
        LiquidityLock(lock).release(lp);

        vm.warp(block.timestamp + 1);
        vm.prank(beneficiary);
        LiquidityLock(lock).release(lp);
        assertEq(lp.balanceOf(beneficiary), liquidity);
    }

    function test_vault_repeatedSeedEachGetsOwnLock() public {
        (address lock1,) = _seed(1_000_000 ether, 20_000e6);
        vm.warp(block.timestamp + 30 days);
        (address lock2, uint256 liq2) = _seed(1_000_000 ether, 20_000e6);
        assertTrue(lock1 != lock2);
        assertEq(LiquidityLock(lock2).unlockTime(), block.timestamp + 730 days);
        assertEq(_pair().balanceOf(lock2), liq2);
        assertEq(VAULT.balance, BUCKET - 2_000_000 ether);
    }

    function test_vault_existingPoolAboveFloorSeedsAtPoolRatio() public {
        _poolBy(attacker, 100 ether, 3e6); // 0.03 USDC per PPL
        uint256 before = VAULT.balance;
        vm.prank(seeder);
        (address lock, uint256 liquidity) = vault.seed(1_000_000 ether, 15_000e6, 0, 0);
        // quote-limited: 15_000 USDC buys in 500_000 PPL at 0.03
        assertEq(before - VAULT.balance, 500_000 ether);
        assertEq(_pair().balanceOf(lock), liquidity);
    }

    function test_vault_slippageMinsRevert() public {
        _poolBy(attacker, 100 ether, 3e6);
        vm.prank(seeder);
        vm.expectRevert(GenesisLiquidityVault.InsufficientPplAmount.selector);
        vault.seed(1_000_000 ether, 15_000e6, 600_000 ether, 0);
        vm.prank(seeder);
        vm.expectRevert(GenesisLiquidityVault.InsufficientQuoteAmount.selector);
        vault.seed(100 ether, 15_000e6, 0, 1_000e6);
    }

    // ------------------------------------------------------------ every other path reverts

    function testFuzz_vault_onlySeederCanSeed(address caller) public {
        vm.assume(caller != seeder);
        vm.prank(caller);
        vm.expectRevert(GenesisLiquidityVault.NotSeeder.selector);
        vault.seed(1 ether, 1e6, 0, 0);
    }

    function test_vault_beneficiaryOwnerAttackerCannotSeed() public {
        address[3] memory callers = [beneficiary, owner, attacker];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(GenesisLiquidityVault.NotSeeder.selector);
            vault.seed(1 ether, 1e6, 0, 0);
        }
    }

    function test_vault_belowFloorReverts() public {
        vm.prank(seeder);
        vm.expectRevert(GenesisLiquidityVault.BelowPriceFloor.selector);
        vault.seed(1_000_000 ether, 10_000e6 - 1, 0, 0);
    }

    function test_vault_existingPoolBelowFloorReverts() public {
        _poolBy(attacker, 1_000 ether, 5e6); // 0.005 USDC per PPL
        vm.prank(seeder);
        vm.expectRevert(GenesisLiquidityVault.BelowPriceFloor.selector);
        vault.seed(1_000_000 ether, 1_000_000e6, 0, 0);
    }

    /// @notice WPPL donated to the empty pair would make the first mint price PPL below the floor.
    function test_vault_donationPushingPoolBelowFloorReverts() public {
        vm.prank(seeder);
        factory.createPair(address(wppl), address(usdc));
        vm.deal(attacker, 1_000_000 ether);
        vm.startPrank(attacker);
        wppl.deposit{value: 1_000_000 ether}();
        wppl.transfer(address(_pair()), 1_000_000 ether);
        vm.stopPrank();
        vm.prank(seeder);
        vm.expectRevert(GenesisLiquidityVault.BelowPriceFloor.selector);
        vault.seed(1_000_000 ether, 10_000e6, 0, 0);
    }

    function test_vault_cannotSeedMoreThanBucket() public {
        vm.prank(seeder);
        vm.expectRevert(GenesisLiquidityVault.InsufficientPpl.selector);
        vault.seed(BUCKET + 1, 10_000_000e6, 0, 0);
    }

    function test_vault_zeroAmountReverts() public {
        vm.prank(seeder);
        vm.expectRevert(GenesisLiquidityVault.ZeroAmount.selector);
        vault.seed(0, 1e6, 0, 0);
    }

    /// @notice Any zero parameter in genesis seals the liquidity forever (fail-safe).
    function test_vault_unconfiguredIsSealed() public {
        for (uint256 i; i < 6; ++i) {
            address[5] memory p = [address(wppl), address(factory), address(usdc), beneficiary, seeder];
            uint256 floor = FLOOR;
            if (i < 5) p[i] = address(0);
            else floor = 0;
            _genesisVault(p[0], p[1], p[2], p[3], p[4], floor);
            vm.prank(seeder);
            if (i == 4) vm.expectRevert(GenesisLiquidityVault.NotSeeder.selector);
            else vm.expectRevert(GenesisLiquidityVault.NotConfigured.selector);
            vault.seed(1_000_000 ether, 20_000e6, 0, 0);
        }
    }

    function test_vault_plainSendAndUnknownCallsRevert() public {
        address[3] memory callers = [seeder, beneficiary, owner];
        for (uint256 i; i < callers.length; ++i) {
            vm.deal(callers[i], 1 ether);
            vm.startPrank(callers[i]);
            (bool ok,) = VAULT.call{value: 1 ether}("");
            assertFalse(ok, "plain send");
            (ok,) = VAULT.call(abi.encodeWithSignature("withdraw(uint256)", 1 ether));
            assertFalse(ok, "withdraw");
            (ok,) = VAULT.call(abi.encodeWithSignature("transfer(address,uint256)", callers[i], 1 ether));
            assertFalse(ok, "transfer");
            (ok,) = VAULT.call(abi.encodeWithSignature("setSeeder(address)", callers[i]));
            assertFalse(ok, "setSeeder");
            (ok,) = VAULT.call(abi.encodeWithSignature("execute(address,uint256,bytes)", callers[i], 1 ether, ""));
            assertFalse(ok, "execute");
            vm.stopPrank();
        }
        assertEq(VAULT.balance, BUCKET);
        assertEq(vault.seeder(), seeder);
    }

    /// @notice The ABI has exactly one state-changing function, `seed`.
    function test_vault_abiOnlySeedIsStateChanging() public view {
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/out/GenesisLiquidityVault.sol/GenesisLiquidityVault.json")
        );
        string[] memory sigs = vm.parseJsonKeys(json, ".methodIdentifiers");
        assertEq(sigs.length, 8, "unexpected function count");

        uint256 mutating;
        for (uint256 i; vm.keyExistsJson(json, string.concat(".abi[", vm.toString(i), "]")); ++i) {
            string memory entry = string.concat(".abi[", vm.toString(i), "]");
            string memory kind = vm.parseJsonString(json, string.concat(entry, ".type"));
            assertTrue(keccak256(bytes(kind)) != keccak256("receive"), "receive");
            assertTrue(keccak256(bytes(kind)) != keccak256("fallback"), "fallback");
            if (keccak256(bytes(kind)) != keccak256("function")) continue;
            bytes32 m = keccak256(bytes(vm.parseJsonString(json, string.concat(entry, ".stateMutability"))));
            if (m != keccak256("view") && m != keccak256("pure")) {
                ++mutating;
                assertEq(vm.parseJsonString(json, string.concat(entry, ".name")), "seed");
            }
        }
        assertEq(mutating, 1, "unexpected state-changing function count");
    }

    /// @notice No DELEGATECALL, CALLCODE or SELFDESTRUCT in the vault's own code (the embedded
    /// LiquidityLock creation code is checked by LiquidityLock.t.sol), so nothing can swap the
    /// logic or destroy the vault.
    function test_vault_bytecodeHasNoDelegatecallOrSelfdestruct() public view {
        bytes memory code = VAULT.code;
        uint256 end = _indexOf(code, type(LiquidityLock).creationCode);
        if (end == type(uint256).max) {
            uint256 metaLen = (uint256(uint8(code[code.length - 2])) << 8) | uint256(uint8(code[code.length - 1]));
            end = code.length - metaLen - 2;
        }
        for (uint256 i; i < end; ++i) {
            uint8 op = uint8(code[i]);
            assertTrue(op != 0xf4 && op != 0xf2 && op != 0xff, "forbidden opcode");
            if (op >= 0x60 && op <= 0x7f) i += op - 0x5f;
        }
    }

    // ------------------------------------------------------------ helpers

    function _poolBy(address who, uint256 ppl, uint256 quote) internal {
        vm.deal(who, ppl);
        usdc.mint(who, quote);
        vm.startPrank(who);
        address pair = factory.getPair(address(wppl), address(usdc));
        if (pair == address(0)) pair = factory.createPair(address(wppl), address(usdc));
        wppl.deposit{value: ppl}();
        wppl.transfer(pair, ppl);
        usdc.transfer(pair, quote);
        PeoplePair(pair).mint(who);
        vm.stopPrank();
    }

    function _indexOf(bytes memory hay, bytes memory needle) internal pure returns (uint256) {
        if (needle.length == 0 || needle.length > hay.length) return type(uint256).max;
        for (uint256 i; i <= hay.length - needle.length; ++i) {
            if (hay[i] != needle[0]) continue;
            bool found = true;
            for (uint256 j = 1; j < needle.length; ++j) {
                if (hay[i + j] != needle[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return i;
        }
        return type(uint256).max;
    }
}
