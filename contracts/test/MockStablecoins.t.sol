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
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");

    function setUp() public {
        script = new DeployPplCurveHub();
    }

    /// @dev Process env is global and forge runs tests in parallel, so all script cases run in ONE test.
    function test_deployScriptMockGating() public {
        _resetEnv();
        _test_mocksOnMainnetRequireExplicitFlag();
        _resetEnv();
        _test_mocksOnMainnetWithFlagAllowlistOnlyMocks();
        _resetEnv();
        _test_mocksForbidRealTokenAddresses();
        _resetEnv();
        _test_mocksRejectedOnOtherChains();
        _resetEnv();
        _test_nonMockMainnetStillRequiresCanonicalTokens();
    }

    function _resetEnv() internal {
        vm.setEnv("OWNER", vm.toString(owner));
        vm.setEnv("TREASURY", vm.toString(treasury));
        vm.setEnv("USDC_ADDRESS", "");
        vm.setEnv("USDT_ADDRESS", "");
        vm.setEnv("DEPLOY_MOCKS", "false");
        vm.setEnv("TEST_DEPLOY_MAINNET", "false");
        vm.setEnv("OPEN_SALE", "false");
    }

    function _test_mocksOnMainnetRequireExplicitFlag() internal {
        vm.chainId(8453);
        vm.setEnv("DEPLOY_MOCKS", "true");
        vm.expectRevert(bytes("mocks: mainnet needs TEST_DEPLOY_MAINNET=true"));
        script.run();
    }

    function _test_mocksOnMainnetWithFlagAllowlistOnlyMocks() internal {
        vm.chainId(8453);
        vm.setEnv("DEPLOY_MOCKS", "true");
        vm.setEnv("TEST_DEPLOY_MAINNET", "true");
        vm.setEnv("OWNER", vm.toString(DEFAULT_SENDER));
        vm.setEnv("OPEN_SALE", "true");
        vm.recordLogs();
        PplCurveHub hub = script.run();
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
        vm.setEnv("DEPLOY_MOCKS", "true");
        vm.setEnv("USDC_ADDRESS", vm.toString(BASE_USDC));
        vm.expectRevert(bytes("mocks: USDC_ADDRESS/USDT_ADDRESS must be unset"));
        script.run();

        vm.setEnv("USDC_ADDRESS", "");
        vm.setEnv("USDT_ADDRESS", vm.toString(BASE_USDT));
        vm.expectRevert(bytes("mocks: USDC_ADDRESS/USDT_ADDRESS must be unset"));
        script.run();
    }

    function _test_mocksRejectedOnOtherChains() internal {
        vm.chainId(1);
        vm.setEnv("DEPLOY_MOCKS", "true");
        vm.setEnv("TEST_DEPLOY_MAINNET", "true");
        vm.expectRevert(bytes("mocks: testnet only"));
        script.run();
    }

    function _test_nonMockMainnetStillRequiresCanonicalTokens() internal {
        vm.chainId(8453);
        vm.setEnv("USDC_ADDRESS", vm.toString(makeAddr("fake")));
        vm.expectRevert(bytes("usdc: not canonical Base USDC"));
        script.run();
    }
}
