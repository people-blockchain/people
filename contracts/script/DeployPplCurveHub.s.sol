// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PplCurveHub} from "../src/sale/PplCurveHub.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

/// @notice Deploy of the PPL curve hub (not executed by CI).
/// Env: OWNER (Safe), TREASURY, USDC_ADDRESS, USDT_ADDRESS (real tokens; must NOT be set when
/// DEPLOY_MOCKS=true), DEPLOY_MOCKS (default false), TEST_DEPLOY_MAINNET (default false),
/// OPEN_SALE (default false).
/// DEPLOY_MOCKS=true deploys the valueless TEST mocks (tUSDC/tUSDT, public mint) and allowlists ONLY them.
/// Mocks are allowed on Base Sepolia (84532) and local (31337); on Base mainnet (8453) they are an
/// explicit TEST deployment that additionally requires TEST_DEPLOY_MAINNET=true.
/// Non-mock deploys on 8453 must use the canonical Base USDC/USDT.
/// On Base mainnet (8453) OWNER and TREASURY must be contracts (Safe), and TREASURY must not be the
/// broadcaster: the hub measures the treasury balance delta, so a buyer equal to the treasury can never
/// complete a purchase (`TransferMismatch`), and an EOA owner/treasury defeats the multisig custody model.
/// `setToken` and `open` are owner-only: they run here only when the broadcaster is the OWNER;
/// otherwise the owner (a Safe) must send them after the deploy.
/// After `open()` the hub only lets the owner disable tokens (`setToken(token, true)` reverts), so every
/// enabling `setToken` must be sent BEFORE `open()`; the script keeps that order.
contract DeployPplCurveHub is Script {
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant BASE_USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;

    /// @dev Base mainnet guard, part 1: owner and treasury must be contracts (Safe). Runs before the broadcast starts.
    function _checkMainnetContracts(address owner, address treasury) internal view {
        if (block.chainid != 8453) return;
        require(owner.code.length > 0, "owner: must be a contract (Safe) on Base mainnet");
        require(treasury.code.length > 0, "treasury: must be a contract (Safe) on Base mainnet");
    }

    /// @dev Base mainnet guard, part 2: the broadcaster is only known once the broadcast has started; the check
    /// still runs before anything is deployed, so a revert aborts the script with nothing sent.
    function _checkMainnetBroadcaster(address treasury, address broadcaster) internal view {
        if (block.chainid != 8453) return;
        require(treasury != broadcaster, "treasury: must not be the broadcaster (buyer == treasury reverts TransferMismatch)");
    }

    function run() external returns (PplCurveHub hub) {
        address owner = vm.envAddress("OWNER");
        address treasury = vm.envAddress("TREASURY");
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        address usdt = vm.envOr("USDT_ADDRESS", address(0));
        bool deployMocks = vm.envOr("DEPLOY_MOCKS", false);
        bool openSale = vm.envOr("OPEN_SALE", false);

        if (deployMocks) {
            require(usdc == address(0) && usdt == address(0), "mocks: USDC_ADDRESS/USDT_ADDRESS must be unset");
            if (block.chainid == 8453) {
                require(vm.envOr("TEST_DEPLOY_MAINNET", false), "mocks: mainnet needs TEST_DEPLOY_MAINNET=true");
            } else {
                require(block.chainid == 84532 || block.chainid == 31337, "mocks: testnet only");
            }
        } else if (block.chainid == 8453) {
            require(usdc == address(0) || usdc == BASE_USDC, "usdc: not canonical Base USDC");
            require(usdt == address(0) || usdt == BASE_USDT, "usdt: not canonical Base USDT");
        }

        _checkMainnetContracts(owner, treasury);

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        _checkMainnetBroadcaster(treasury, broadcaster);

        if (deployMocks) {
            usdc = address(new MockUSDC());
            usdt = address(new MockUSDT());
            console2.log("MockUSDC", usdc);
            console2.log("MockUSDT", usdt);
        }

        hub = new PplCurveHub(owner, treasury);

        bool isOwner = broadcaster == owner;
        if (isOwner) {
            if (usdc != address(0)) hub.setToken(usdc, true);
            if (usdt != address(0)) hub.setToken(usdt, true);
            if (openSale) hub.open();
        }
        vm.stopBroadcast();

        console2.log("PplCurveHub", address(hub));
        console2.log("owner", owner);
        console2.log("treasury", treasury);
        console2.log("chainId", block.chainid);
        if (!isOwner) {
            console2.log("WARNING: broadcaster is not OWNER; tokens are NOT allowlisted and the sale is NOT open.");
            console2.log("The owner must call setToken for USDC/USDT first and only then open() (tokens cannot be enabled after open).");
            if (usdc != address(0)) console2.log("allowlist USDC", usdc);
            if (usdt != address(0)) console2.log("allowlist USDT", usdt);
            if (openSale) console2.log("OPEN_SALE requested: owner must call open()");
        }
    }
}
