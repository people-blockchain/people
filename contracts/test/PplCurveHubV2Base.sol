// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {PplCurveMath} from "../src/sale/PplCurveHub.sol";

/// @dev Minimal state-forcing harness (test only). Reuse from other v2 test files.
contract HubV2Harness is PplCurveHubV2 {
    constructor(address usdc_, address treasury_, address receiver_, address owner_, address verifier_)
        PplCurveHubV2(MockUSDC(usdc_), treasury_, receiver_, owner_, verifier_)
    {}

    /// @dev Sets raised and keeps soldPpl consistent with the v1 curve. Does not touch reserve/USDC.
    function forceRaised(uint256 r) external {
        raisedUsd6 = r;
        soldPpl = PplCurveMath.soldForRaised(r);
    }

    function forceReserve(uint256 r) external {
        reserveUsd6 = r;
    }

    /// @dev Defensive-branch access: `delivered` cannot be set while the sale is open via the real API.
    function forceDelivered(address a, bool v) external {
        delivered[a] = v;
    }
}

/// @dev Shared setup + helpers for PplCurveHubV2 tests.
abstract contract HubV2Base is Test {
    uint256 internal constant CAP = 4_000_000e6;
    uint256 internal constant MIN_BUY = 10e6;
    uint256 internal constant MAX_BUY = 500e6;
    uint256 internal constant DAY_CAP = 2_000e6;
    uint256 internal constant START = 20_000 days + 1 hours; // early in a UTC day

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant VERIFICATION_TYPEHASH =
        keccak256("Verification(address account,bytes32 personId,uint256 nonce,uint256 deadline)");

    MockUSDC internal usdc;
    HubV2Harness internal hub;

    address internal owner;
    address internal treasury;
    address internal liquidityReceiver;
    uint256 internal verifierPk = 0xA11CE5;
    address internal verifier;

    function setUp() public virtual {
        vm.warp(START);
        owner = makeAddr("owner");
        treasury = makeAddr("treasury");
        liquidityReceiver = makeAddr("liquidityReceiver");
        verifier = vm.addr(verifierPk);
        usdc = new MockUSDC();
        hub = new HubV2Harness(address(usdc), treasury, liquidityReceiver, owner, verifier);
    }

    // ---- signing / verification

    function _digest(address account, bytes32 personId, uint256 deadline) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256("PplCurveHubV2"), keccak256("1"), block.chainid, address(hub)
            )
        );
        bytes32 structHash =
            keccak256(abi.encode(VERIFICATION_TYPEHASH, account, personId, hub.bindNonce(personId), deadline));
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _signWith(uint256 pk, address account, bytes32 personId, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(account, personId, deadline));
        return abi.encodePacked(r, s, v);
    }

    /// @dev Signature by the configured verifier with the current bindNonce(personId).
    function _sign(address account, bytes32 personId, uint256 deadline) internal view returns (bytes memory) {
        return _signWith(verifierPk, account, personId, deadline);
    }

    function _personIdOf(address account) internal pure returns (bytes32) {
        return keccak256(abi.encode("person", account));
    }

    /// @dev Binds `account` to a unique personId (deadline = now + 1 day). Returns the personId.
    function _verify(address account) internal returns (bytes32 personId) {
        personId = _personIdOf(account);
        uint256 deadline = vm.getBlockTimestamp() + 1 days;
        bytes memory sig = _sign(account, personId, deadline);
        vm.prank(account);
        hub.verify(personId, deadline, sig);
    }

    // ---- lifecycle / funds

    function _open() internal {
        vm.prank(owner);
        hub.open();
    }

    /// @dev Mint `amt` USDC to `who` and approve the hub.
    function _fund(address who, uint256 amt) internal {
        usdc.mint(who, amt);
        vm.prank(who);
        usdc.approve(address(hub), type(uint256).max);
    }

    /// @dev verify + fund (generous balance).
    function _prepare(address who) internal {
        _verify(who);
        _fund(who, 1_000_000e6);
    }

    /// @dev `who` buys for itself, no referrer, no slippage guard.
    function _buy(address who, uint256 usdcIn) internal returns (uint256 pplOut) {
        vm.prank(who);
        pplOut = hub.buy(usdcIn, 0, who, address(0));
    }

    /// @dev Make raised/sold/reserve/hub-balance mutually consistent (reserve = ceil(r/2)).
    function _seedRaised(uint256 r) internal {
        hub.forceRaised(r);
        uint256 res = r - r / 2;
        hub.forceReserve(res);
        usdc.mint(address(hub), res);
    }

    // ---- time

    function _skipToNextUtcDay() internal {
        vm.warp((vm.getBlockTimestamp() / 1 days + 1) * 1 days);
    }

    /// @dev Warp to exactly openedAt + WHITELIST_PERIOD (first instant the whitelist is over).
    function _skipPastWhitelist() internal {
        vm.warp(uint256(hub.openedAt()) + hub.WHITELIST_PERIOD());
    }
}
