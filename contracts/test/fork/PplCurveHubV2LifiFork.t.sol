// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PplCurveHubV2} from "../../src/sale/PplCurveHubV2.sol";

interface IAcrossReceiver {
    function handleV3AcrossMessage(address tokenSent, uint256 amount, address relayer, bytes memory message) external;
}

contract ForkSafe {} // stands in for the Safe / escrow (the Base mainnet constructor only requires contracts)

/// @notice Base mainnet fork rehearsal of the one-signature path with REAL LI.FI contracts and a REAL
/// captured LI.FI message: Across SpokePool -> LI.FI ReceiverAcrossV4 -> LI.FI Executor -> hub.verifyAndBuy.
/// Local only (no transaction is broadcast). Skipped unless BASE_RPC_URL is set:
///   BASE_RPC_URL=https://mainnet.base.org forge test --match-path test/fork/PplCurveHubV2LifiFork.t.sol -vv
/// The message below is the destination payload of a live LI.FI /v1/quote/contractCalls response
/// (Polygon USDT -> Base USDC via Across, 18 Nov 2026), built by the site's buildContractCallsRequest with
/// hub = HUB (placeholder; the test deploys the hub there), buyer = BUYER and a verification signed by
/// the local anvil key #0 as verifier. Nothing in it is a real secret.
contract PplCurveHubV2LifiForkTest is Test {
    uint256 constant FORK_BLOCK = 59_109_516;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant LIFI_EXECUTOR = 0x4DaC9d1769b9b304cb04741DCDEb2FC14aBdF110;
    address constant LIFI_RECEIVER_ACROSS = 0x33b255b5db44A78c34381f89f1a454bc0Ef49871;
    address constant ACROSS_SPOKE_POOL = 0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64;
    address constant HUB = 0xC0FFEe0000000000000000000000000000000001;
    address constant BUYER = 0xF977814e90dA44bFA03b6295A0616a897441aceC;
    bytes32 constant PERSON = 0x4d724335aeee17d3c76ddc934027d5a17bfce58f07a65b93e9c73e3d7ceb5bdd;
    uint256 constant VERIFIER_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant DELIVERED = 41_201_302; // Across output = SwapData.fromAmount
    uint256 constant USDC_IN = 41_000_000; // verifyAndBuy usdcIn (>= ROUTER_MIN_BUY_USD6; site: typed amount <= quote minimum)

    bytes constant MESSAGE = hex"8046fc4392dab8070daacb5ae43f822b3d8dff501b9177a932b479df07bd0e7f0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000f977814e90da44bfa03b6295a0616a897441acec00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000c0ffee0000000000000000000000000000000001000000000000000000000000c0ffee0000000000000000000000000000000001000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000000274ae9600000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000001649a23f9b70000000000000000000000000000000000000000000000000000000002719c400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000f977814e90da44bfa03b6295a0616a897441acec00000000000000000000000000000000000000000000000000000000000000004d724335aeee17d3c76ddc934027d5a17bfce58f07a65b93e9c73e3d7ceb5bdd0000000000000000000000000000000000000000000000000000000070dbd88000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000412687b26d9bbba4baa5b348b0eae4445404ea858946dcdf323d734eb59b21e5f1176c5c6c0024f562b0e5b985d2a22f5faa4b5b0b19e9f168dcb80f98052269291c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

    PplCurveHubV2 hub;
    address owner;
    address treasury;
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc, FORK_BLOCK);
        forked = true;
        owner = address(new ForkSafe());
        treasury = address(new ForkSafe());
        address escrow = address(new ForkSafe());
        deployCodeTo(
            "PplCurveHubV2.sol:PplCurveHubV2",
            abi.encode(USDC, treasury, escrow, owner, vm.addr(VERIFIER_PK), address(0)),
            HUB
        );
        hub = PplCurveHubV2(HUB);
        vm.prank(owner);
        hub.open();
    }

    function _trustExecutor() internal {
        vm.startPrank(owner);
        bytes32 id = hub.queueSetTrustedRouter(LIFI_EXECUTOR, true);
        vm.warp(block.timestamp + hub.ADMIN_TIMELOCK());
        hub.executeSetTrustedRouter(id);
        vm.stopPrank();
        assertTrue(hub.trustedRouter(LIFI_EXECUTOR));
    }

    function _deliver(bytes memory message) internal {
        deal(USDC, LIFI_RECEIVER_ACROSS, IERC20(USDC).balanceOf(LIFI_RECEIVER_ACROSS) + DELIVERED);
        vm.prank(ACROSS_SPOKE_POOL);
        IAcrossReceiver(LIFI_RECEIVER_ACROSS).handleV3AcrossMessage(USDC, DELIVERED, address(0xBEEF), message);
    }

    function _withCallData(bytes memory callData) internal pure returns (bytes memory) {
        (bytes32 txId, LibSwapData[] memory swaps, address receiver) = abi.decode(MESSAGE, (bytes32, LibSwapData[], address));
        swaps[0].callData = callData;
        return abi.encode(txId, swaps, receiver);
    }

    function test_fork_capturedMessageShape() public view {
        if (!forked) return;
        (, LibSwapData[] memory swaps, address receiver) = abi.decode(MESSAGE, (bytes32, LibSwapData[], address));
        assertEq(swaps.length, 1);
        assertEq(swaps[0].callTo, HUB);
        assertEq(swaps[0].approveTo, HUB);
        assertEq(swaps[0].sendingAssetId, USDC);
        assertEq(swaps[0].fromAmount, DELIVERED);
        assertEq(bytes4(swaps[0].callData), PplCurveHubV2.verifyAndBuy.selector);
        assertEq(receiver, BUYER);
    }

    function test_fork_newBuyerVerifyAndBuyThroughRealLifiContracts() public {
        if (!forked) return;
        _trustExecutor();
        (uint256 expectedPpl,) = hub.quoteBuy(USDC_IN);
        uint256 buyerBefore = IERC20(USDC).balanceOf(BUYER);
        vm.recordLogs();
        _deliver(MESSAGE);

        assertEq(hub.personOf(BUYER), PERSON, "bound");
        assertEq(IERC20(USDC).balanceOf(BUYER) - buyerBefore, DELIVERED - USDC_IN, "leftover refunded to buyer");
        assertEq(IERC20(USDC).balanceOf(LIFI_EXECUTOR), 0, "nothing stuck in Executor");
        // LI.FI's Executor leaves a max USDC allowance to the hub (LibAsset.maxApproveERC20). Harmless: the hub
        // only pulls from msg.sender inside a call the Executor makes, and the Executor holds no USDC between txs.
        assertEq(IERC20(USDC).balanceOf(HUB) + IERC20(USDC).balanceOf(treasury), USDC_IN, "hub charged exactly usdcIn");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool verified;
        bool bought;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != HUB) continue;
            if (logs[i].topics[0] == PplCurveHubV2.Verified.selector) verified = true;
            if (logs[i].topics[0] == PplCurveHubV2.Bought.selector) {
                bought = true;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), LIFI_EXECUTOR, "buyer = Executor");
                assertEq(address(uint160(uint256(logs[i].topics[2]))), BUYER, "recipient = buyer");
            }
        }
        assertTrue(verified && bought, "Verified + Bought emitted");
        assertGt(expectedPpl, 0);
        emit log_named_uint("pplOut expected (wei)", expectedPpl);
    }

    function test_fork_untrustedExecutorRefundsAllUsdcToBuyer() public {
        if (!forked) return;
        uint256 buyerBefore = IERC20(USDC).balanceOf(BUYER);
        _deliver(MESSAGE);
        assertEq(hub.personOf(BUYER), bytes32(0), "bind rolled back");
        assertEq(IERC20(USDC).balanceOf(BUYER) - buyerBefore, DELIVERED, "full refund");
        assertEq(IERC20(USDC).balanceOf(HUB), 0);
    }

    function test_fork_slippageRevertRefundsAllUsdcToBuyer() public {
        if (!forked) return;
        _trustExecutor();
        (, LibSwapData[] memory swaps,) = abi.decode(MESSAGE, (bytes32, LibSwapData[], address));
        (,,,, bytes32 pid, uint256 dl, bytes memory sig) =
            abi.decode(_args(swaps[0].callData), (uint256, uint256, address, address, bytes32, uint256, bytes));
        bytes memory tooGreedy =
            abi.encodeCall(PplCurveHubV2.verifyAndBuy, (USDC_IN, type(uint128).max, BUYER, address(0), pid, dl, sig));
        uint256 buyerBefore = IERC20(USDC).balanceOf(BUYER);
        _deliver(_withCallData(tooGreedy));
        assertEq(hub.personOf(BUYER), bytes32(0), "bind rolled back");
        assertEq(IERC20(USDC).balanceOf(BUYER) - buyerBefore, DELIVERED, "full refund");
    }

    function _args(bytes memory callData) internal pure returns (bytes memory out) {
        out = new bytes(callData.length - 4);
        for (uint256 i; i < out.length; ++i) out[i] = callData[i + 4];
    }
}

struct LibSwapData {
    address callTo;
    address approveTo;
    address sendingAssetId;
    address receivingAssetId;
    uint256 fromAmount;
    bytes callData;
    bool requiresDeposit;
}
