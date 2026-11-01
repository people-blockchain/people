// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {PplCurveMath} from "../src/sale/PplCurveHub.sol";

/// @dev Minimal state-forcing harness (test only). Reuse from other v2 test files.
contract HubV2Harness is PplCurveHubV2 {
    constructor(
        address usdc_,
        address treasury_,
        address receiver_,
        address owner_,
        address verifier_,
        address rewardBuyerForbidden_
    ) PplCurveHubV2(MockUSDC(usdc_), treasury_, receiver_, owner_, verifier_, rewardBuyerForbidden_) {}

    /// @dev Sets raised and keeps soldPpl consistent with the v1 curve. Does not touch reserve/USDC.
    function forceRaised(uint256 r) external {
        raisedUsd6 = r;
        soldPpl = PplCurveMath.soldForRaised(r);
    }

    function forceReserve(uint256 r) external {
        reserveUsd6 = r;
    }

    /// @dev Test-only fast path; production uses `queueSetTrustedRouter` / `executeSetTrustedRouter`.
    function testSetTrustedRouter(address router, bool trusted) external {
        if (router == address(0)) revert ZeroAddress();
        if (rewardBuyerForbidden != address(0) && router == rewardBuyerForbidden) revert RewardBuyForbidden();
        trustedRouter[router] = trusted;
        emit TrustedRouterSet(router, trusted);
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
    bytes32 internal constant MAINNET_RETURN_TYPEHASH = keccak256(
        "MainnetReturn(bytes32 personId,address hub,address seller,uint256 pplAmount,uint256 sourceChainId,uint256 destChainId,bytes32 returnId,uint256 deadline)"
    );
    uint256 internal constant PEOPLE_CHAIN_ID = 97401;

    MockUSDC internal usdc;
    HubV2Harness internal hub;

    address internal owner;
    address internal treasury;
    address internal liquidityReceiver;
    uint256 internal verifierPk = 0xA11CE5;
    address internal verifier;
    uint256 internal returnVerifierPk = 0xBEEF5;
    address internal returnVerifier;
    uint256 internal _returnNonce;

    function setUp() public virtual {
        vm.warp(START);
        owner = makeAddr("owner");
        treasury = makeAddr("treasury");
        liquidityReceiver = makeAddr("liquidityReceiver");
        verifier = vm.addr(verifierPk);
        usdc = new MockUSDC();
        hub = new HubV2Harness(address(usdc), treasury, liquidityReceiver, owner, verifier, address(0));
        returnVerifier = vm.addr(returnVerifierPk);
        _installReturnVerifier(hub, returnVerifier);
    }

    /// @dev Queue and wait out the 48-hour admin timelock. Leaves time `ADMIN_TIMELOCK` later.
    function _installReturnVerifier(HubV2Harness h, address v) internal {
        vm.prank(owner);
        bytes32 id = h.queueSetReturnVerifier(v);
        vm.warp(vm.getBlockTimestamp() + h.ADMIN_TIMELOCK());
        vm.prank(owner);
        h.executeSetReturnVerifier(id);
    }

    function _rescue(address token, uint256 amount) internal {
        vm.prank(owner);
        bytes32 id = hub.queueRescue(token, amount);
        vm.warp(vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK());
        vm.prank(owner);
        hub.executeRescue(id);
    }

    function _setTrustedRouter(address router, bool trusted) internal {
        vm.prank(owner);
        hub.testSetTrustedRouter(router, trusted);
    }

    /// @dev Real 48-hour timelock path (see `PplCurveHubV2OpusR2Test`).
    function _queueTrustedRouter(address router, bool trusted) internal returns (bytes32 id) {
        vm.prank(owner);
        id = hub.queueSetTrustedRouter(router, trusted);
        vm.warp(vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK());
        vm.prank(owner);
        hub.executeSetTrustedRouter(id);
    }

    // ---- signing / verification

    function _digest(address account, bytes32 personId, uint256 deadline) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256("PplCurveHubV2"), keccak256("1"), block.chainid, address(hub))
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

    // ---- sell-back attestations (A1)

    /// @dev Raw MainnetReturn signature. `domainHub`/`domainChainId` are the EIP-712 domain;
    /// `structHub` and `destChainId` are fields the hub checks against `address(this)` and `block.chainid`.
    function _signReturnRaw(
        uint256 pk,
        address domainHub,
        uint256 domainChainId,
        bytes32 personId,
        address structHub,
        address seller,
        uint256 ppl,
        uint256 sourceChainId,
        uint256 destChainId,
        bytes32 returnId,
        uint256 deadline
    ) internal pure returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256("PplCurveHubV2"), keccak256("1"), domainChainId, domainHub)
        );
        bytes32 structHash = keccak256(
            abi.encode(
                MAINNET_RETURN_TYPEHASH,
                personId,
                structHub,
                seller,
                ppl,
                sourceChainId,
                destChainId,
                returnId,
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    /// @dev Valid attestation by the configured return verifier for `seller`'s current person.
    function _signReturn(address seller, uint256 ppl, bytes32 returnId, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _signReturnRaw(
            returnVerifierPk,
            address(hub),
            block.chainid,
            hub.personOf(seller),
            address(hub),
            seller,
            ppl,
            PEOPLE_CHAIN_ID,
            block.chainid,
            returnId,
            deadline
        );
    }

    function _freshReturnId() internal returns (bytes32) {
        return keccak256(abi.encode("returnId", ++_returnNonce));
    }

    /// @dev `who` sells `ppl` with a fresh returnId and a valid attestation (deadline = now + 1h).
    function _sellBack(address who, uint256 ppl, uint256 minOut) internal returns (uint256) {
        bytes32 id = _freshReturnId();
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _signReturn(who, ppl, id, deadline);
        vm.prank(who);
        return hub.sellBack(ppl, minOut, id, deadline, ppl, sig);
    }

    /// @dev Same call with a valid attestation, expecting `sellBack` to revert with `err`.
    function _expectSellBackRevert(address who, uint256 ppl, uint256 minOut, bytes4 err) internal {
        bytes32 id = _freshReturnId();
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _signReturn(who, ppl, id, deadline);
        vm.expectRevert(err);
        vm.prank(who);
        hub.sellBack(ppl, minOut, id, deadline, ppl, sig);
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
