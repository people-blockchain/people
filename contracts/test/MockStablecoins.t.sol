// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {PplCurveHub} from "../src/sale/PplCurveHub.sol";
import {DeployPplCurveHub} from "../script/DeployPplCurveHub.s.sol";

contract MockStablecoinsTest is Test {
    function test_usdc_metadata() public {
        MockUSDC t = new MockUSDC();
        assertEq(t.name(), "TEST USDC");
        assertEq(t.symbol(), "tUSDC");
        assertEq(t.decimals(), 6);
    }

    function test_usdt_metadata() public {
        MockUSDT t = new MockUSDT();
        assertEq(t.name(), "TEST USDT");
        assertEq(t.symbol(), "tUSDT");
        assertEq(t.decimals(), 6);
    }

    function test_publicMint() public {
        MockUSDC c = new MockUSDC();
        MockUSDT u = new MockUSDT();
        address anyone = makeAddr("anyone");
        vm.startPrank(anyone);
        c.mint(anyone, 5e6);
        u.mint(anyone, 7e6);
        vm.stopPrank();
        assertEq(c.balanceOf(anyone), 5e6);
        assertEq(u.balanceOf(anyone), 7e6);
    }
}

contract DeployPplCurveHubMocksTest is Test {
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant BASE_USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;

    DeployPplCurveHub script;
    DeployPplCurveHub.Config cfg;
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");

    function setUp() public {
        script = new DeployPplCurveHub();
    }

    /// @dev The gating cases drive `script.deploy(cfg)` with an explicit config, NOT the process env:
    /// `vm.setEnv` is process-wide and other suites (e.g. AuditMediumsSimple sets TREASURY) run in
    /// parallel threads, which made this test flaky in a full `forge test`. Env parsing is covered
    /// separately in `test_deployScriptReadsEnv` on keys no other suite writes.
    function test_deployScriptMockGating() public {
        _reset();
        _test_mocksOnMainnetRequireExplicitFlag();
        _reset();
        _test_mocksOnMainnetWithFlagAllowlistOnlyMocks();
        _reset();
        _test_mocksForbidRealTokenAddresses();
        _reset();
        _test_mocksRejectedOnOtherChains();
        _reset();
        _test_nonMockMainnetStillRequiresCanonicalTokens();
        _reset();
        _test_mainnetRolesGuard();
    }

    /// `run()` == `deploy(readConfig())`; check the env -> Config mapping. TREASURY is written by other
    /// suites in parallel, so only its presence (a parseable address) is relied on, not its value.
    function test_deployScriptReadsEnv() public {
        vm.setEnv("TREASURY", vm.toString(treasury));
        vm.setEnv("OWNER", vm.toString(owner));
        vm.setEnv("USDC_ADDRESS", vm.toString(BASE_USDC));
        vm.setEnv("USDT_ADDRESS", "");
        vm.setEnv("DEPLOY_MOCKS", "true");
        vm.setEnv("TEST_DEPLOY_MAINNET", "true");
        vm.setEnv("OPEN_SALE", "false");
        DeployPplCurveHub.Config memory c = script.readConfig();
        assertEq(c.owner, owner);
        assertEq(c.usdc, BASE_USDC);
        assertEq(c.usdt, address(0));
        assertTrue(c.deployMocks);
        assertTrue(c.testDeployMainnet);
        assertFalse(c.openSale);
        vm.setEnv("DEPLOY_MOCKS", "false");
        vm.setEnv("TEST_DEPLOY_MAINNET", "false");
        vm.setEnv("OPEN_SALE", "true");
        vm.setEnv("USDC_ADDRESS", "");
        c = script.readConfig();
        assertEq(c.usdc, address(0));
        assertFalse(c.deployMocks);
        assertFalse(c.testDeployMainnet);
        assertTrue(c.openSale);
    }

    /// @dev Marks `who` as a contract (a Safe stand-in) for the 8453 role checks.
    function _asContract(address who) internal {
        vm.etch(who, hex"00");
    }

    /// L-4: on Base mainnet OWNER and TREASURY must be contracts and TREASURY must not be the broadcaster.
    function _test_mainnetRolesGuard() internal {
        vm.chainId(8453);
        address safeOwner = makeAddr("safeOwner");
        address safeTreasury = makeAddr("safeTreasury");
        cfg.owner = safeOwner;
        cfg.treasury = safeTreasury;

        // EOA owner
        _asContract(safeTreasury);
        vm.expectRevert(bytes("owner: must be a contract (Safe) on Base mainnet"));
        script.deploy(cfg);

        // EOA treasury
        _asContract(safeOwner);
        vm.etch(safeTreasury, "");
        vm.expectRevert(bytes("treasury: must be a contract (Safe) on Base mainnet"));
        script.deploy(cfg);

        // treasury == broadcaster (contract-ish, so only the broadcaster rule can fire)
        _asContract(DEFAULT_SENDER);
        cfg.treasury = DEFAULT_SENDER;
        vm.expectRevert(bytes("treasury: must not be the broadcaster (buyer == treasury reverts TransferMismatch)"));
        script.deploy(cfg);
        vm.stopBroadcast();

        // both Safes, broadcaster is a third party: deploys; the hub is owned by the Safe, nothing is opened
        _asContract(safeTreasury);
        cfg.treasury = safeTreasury;
        PplCurveHub hub = script.deploy(cfg);
        assertEq(hub.owner(), safeOwner);
        assertEq(hub.treasury(), safeTreasury);
        assertEq(hub.openedAt(), 0);

        // the guard is mainnet-only: an EOA owner/treasury is still fine on Base Sepolia
        vm.chainId(84532);
        cfg.owner = makeAddr("eoaOwner");
        cfg.treasury = makeAddr("eoaTreasury");
        assertEq(script.deploy(cfg).openedAt(), 0);
    }

    function _reset() internal {
        delete cfg;
        cfg.owner = owner;
        cfg.treasury = treasury;
    }

    function _test_mocksOnMainnetRequireExplicitFlag() internal {
        vm.chainId(8453);
        cfg.deployMocks = true;
        vm.expectRevert(bytes("mocks: mainnet needs TEST_DEPLOY_MAINNET=true"));
        script.deploy(cfg);
    }

    function _test_mocksOnMainnetWithFlagAllowlistOnlyMocks() internal {
        vm.chainId(8453);
        cfg.deployMocks = true;
        cfg.testDeployMainnet = true;
        cfg.owner = DEFAULT_SENDER;
        cfg.openSale = true;
        // Base mainnet requires contract owner/treasury (L-4)
        _asContract(DEFAULT_SENDER);
        _asContract(treasury);
        vm.recordLogs();
        PplCurveHub hub = script.deploy(cfg);
        assertGt(hub.openedAt(), 0);
        // the allowlist is frozen once the sale is open (setToken before open stays in the script)
        vm.prank(DEFAULT_SENDER);
        vm.expectRevert(PplCurveHub.SaleAlreadyOpened.selector);
        hub.setToken(BASE_USDC, true);
        (bool usdcAllowed,) = hub.tokenInfo(BASE_USDC);
        (bool usdtAllowed,) = hub.tokenInfo(BASE_USDT);
        assertFalse(usdcAllowed);
        assertFalse(usdtAllowed);
        // exactly two tokens allowlisted, both the freshly deployed TEST mocks
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("TokenSet(address,bool,uint8)");
        uint256 n;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter != address(hub) || logs[i].topics[0] != sig) continue;
            address tok = address(uint160(uint256(logs[i].topics[1])));
            assertTrue(tok != BASE_USDC && tok != BASE_USDT);
            string memory sym = MockUSDC(tok).symbol();
            assertTrue(_eq(sym, "tUSDC") || _eq(sym, "tUSDT"));
            n++;
        }
        assertEq(n, 2);
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    function _test_mocksForbidRealTokenAddresses() internal {
        vm.chainId(84532);
        cfg.deployMocks = true;
        cfg.usdc = BASE_USDC;
        vm.expectRevert(bytes("mocks: USDC_ADDRESS/USDT_ADDRESS must be unset"));
        script.deploy(cfg);

        cfg.usdc = address(0);
        cfg.usdt = BASE_USDT;
        vm.expectRevert(bytes("mocks: USDC_ADDRESS/USDT_ADDRESS must be unset"));
        script.deploy(cfg);
    }

    function _test_mocksRejectedOnOtherChains() internal {
        vm.chainId(1);
        cfg.deployMocks = true;
        cfg.testDeployMainnet = true;
        vm.expectRevert(bytes("mocks: testnet only"));
        script.deploy(cfg);
    }

    function _test_nonMockMainnetStillRequiresCanonicalTokens() internal {
        vm.chainId(8453);
        cfg.usdc = makeAddr("fake");
        vm.expectRevert(bytes("usdc: not canonical Base USDC"));
        script.deploy(cfg);
    }
}
