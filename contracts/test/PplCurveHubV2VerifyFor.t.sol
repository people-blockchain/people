// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

/// @dev Minimal stand-in for the LI.FI Executor on Base: it holds the bridged USDC, approves the
/// target, runs the destination calldata, resets the approval and sends whatever is left to the
/// receiver. Like the LI.FI bridge receivers, a reverting call does not revert the delivery: the
/// buyer simply gets all the USDC back.
contract MockLifiExecutor {
    function execute(IERC20 token, address target, uint256 amount, bytes calldata data, address receiver)
        external
        returns (bool ok)
    {
        token.approve(target, amount);
        (ok,) = target.call(data);
        token.approve(target, 0);
        uint256 left = token.balanceOf(address(this));
        if (left != 0) token.transfer(receiver, left);
    }
}

/// @dev `verifyFor` / `verifyAndBuy`: relayed binding with the existing `Verification` attestation.
contract PplCurveHubV2VerifyForTest is HubV2Base {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    MockLifiExecutor internal executor;

    event Verified(address indexed account, bytes32 indexed personId);

    function setUp() public override {
        super.setUp();
        _open();
        executor = new MockLifiExecutor();
    }

    /// @dev Signature over an arbitrary domain (chain id / hub) and nonce.
    function _sigFor(address domainHub, uint256 domainChainId, address account, bytes32 personId, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 domain = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256("PplCurveHubV2"), keccak256("1"), domainChainId, domainHub)
        );
        bytes32 structHash = keccak256(abi.encode(VERIFICATION_TYPEHASH, account, personId, nonce, deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierPk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _deadline() internal view returns (uint256) {
        return vm.getBlockTimestamp() + 1 days;
    }

    // ================================================================ verifyFor

    function test_verifyFor_anyoneCanSubmitForTheNamedAccount() public {
        bytes32 pid = _personIdOf(alice);
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, pid, dl);
        vm.expectEmit(true, true, false, false, address(hub));
        emit Verified(alice, pid);
        vm.prank(carol);
        hub.verifyFor(alice, pid, dl, sig);
        assertEq(hub.personOf(alice), pid);
        assertEq(hub.accountOfPerson(pid), alice);
        assertEq(hub.pinnedAccount(pid), alice);
        assertEq(hub.personOf(carol), bytes32(0), "submitter is not bound");
    }

    function test_verifyFor_idempotentWhenAlreadyBoundToSamePerson() public {
        bytes32 pid = _personIdOf(alice);
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, pid, dl);
        hub.verifyFor(alice, pid, dl, sig);
        // Same attestation again (e.g. front-run copy, or a destination call after a direct verify).
        vm.recordLogs();
        vm.prank(bob);
        hub.verifyFor(alice, pid, dl, sig);
        assertEq(vm.getRecordedLogs().length, 0, "no-op emits nothing");
        // Still a no-op after the deadline and with garbage: nothing changes for a bound account.
        vm.warp(dl + 1);
        hub.verifyFor(alice, pid, dl, hex"00");
        assertEq(hub.personOf(alice), pid);
        assertEq(hub.bindNonce(pid), 0);
    }

    function test_verifyFor_idempotentAfterDirectVerify() public {
        bytes32 pid = _verify(alice);
        hub.verifyFor(alice, pid, _deadline(), hex"00");
        assertEq(hub.personOf(alice), pid);
    }

    function test_verifyFor_wrongAccountReverts() public {
        bytes32 pid = _personIdOf(alice);
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, pid, dl);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verifyFor(bob, pid, dl, sig);
        assertEq(hub.personOf(bob), bytes32(0));
    }

    function test_verifyFor_wrongPersonReverts() public {
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, _personIdOf(alice), dl);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verifyFor(alice, _personIdOf(bob), dl, sig);
    }

    function test_verifyFor_wrongChainReverts() public {
        bytes32 pid = _personIdOf(alice);
        uint256 dl = _deadline();
        bytes memory other = _sigFor(address(hub), block.chainid + 1, alice, pid, 0, dl);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verifyFor(alice, pid, dl, other);

        // A valid attestation for this chain still works here...
        bytes memory sig = _sign(alice, pid, dl);
        uint256 snap = vm.snapshotState();
        hub.verifyFor(alice, pid, dl, sig);
        assertEq(hub.personOf(alice), pid);
        vm.revertToState(snap);
        // ...and stops working on a fork with another chain id (the domain is rebuilt).
        vm.chainId(424242);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verifyFor(alice, pid, dl, sig);
    }

    function test_verifyFor_wrongHubReverts() public {
        HubV2Harness other = new HubV2Harness(address(usdc), treasury, liquidityReceiver, owner, verifier, address(0));
        bytes32 pid = _personIdOf(alice);
        uint256 dl = _deadline();
        bytes memory sigForOther = _sigFor(address(other), block.chainid, alice, pid, 0, dl);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verifyFor(alice, pid, dl, sigForOther);
        other.verifyFor(alice, pid, dl, sigForOther); // valid only on the hub it names
        assertEq(other.personOf(alice), pid);
        assertEq(hub.personOf(alice), bytes32(0));
    }

    function test_verifyFor_wrongSignerReverts() public {
        bytes32 pid = _personIdOf(alice);
        uint256 dl = _deadline();
        bytes memory sig = _signWith(0xBAD, alice, pid, dl);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verifyFor(alice, pid, dl, sig);
    }

    function test_verifyFor_expiredReverts() public {
        bytes32 pid = _personIdOf(alice);
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, pid, dl);
        vm.warp(dl + 1);
        vm.expectRevert(PplCurveHubV2.Expired.selector);
        hub.verifyFor(alice, pid, dl, sig);
    }

    function test_verifyFor_replayAfterUnbindReverts() public {
        bytes32 pid = _personIdOf(alice);
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, pid, dl);
        hub.verifyFor(alice, pid, dl, sig);
        vm.prank(alice);
        hub.unbind(alice);
        assertEq(hub.bindNonce(pid), 1);
        // The old attestation was for nonce 0.
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verifyFor(alice, pid, dl, sig);
        // A fresh attestation (nonce 1) for the pinned account works.
        hub.verifyFor(alice, pid, dl, _sign(alice, pid, dl));
        assertEq(hub.personOf(alice), pid);
    }

    function test_verifyFor_alreadyBoundGuardsHold() public {
        bytes32 pidA = _verify(alice);
        uint256 dl = _deadline();
        // alice bound to A: a different person for alice is refused.
        bytes32 pidB = _personIdOf(bob);
        bytes memory sigAliceB = _sign(alice, pidB, dl);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verifyFor(alice, pidB, dl, sigAliceB);
        // person A is bound to alice: binding A to bob is refused.
        bytes memory sigBobA = _sign(bob, pidA, dl);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verifyFor(bob, pidA, dl, sigBobA);
        // After alice unbinds, A stays pinned to alice: bob still cannot take it.
        vm.prank(alice);
        hub.unbind(alice);
        bytes memory sigBobA2 = _sign(bob, pidA, dl);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verifyFor(bob, pidA, dl, sigBobA2);
    }

    function test_verifyFor_zeroInputsRevert() public {
        uint256 dl = _deadline();
        vm.expectRevert(PplCurveHubV2.ZeroAddress.selector);
        hub.verifyFor(address(0), _personIdOf(alice), dl, hex"00");
        bytes memory sig = _sign(alice, bytes32(0), dl);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verifyFor(alice, bytes32(0), dl, sig);
    }

    function test_verify_unchangedStillRevertsWhenBound() public {
        bytes32 pid = _verify(alice);
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, pid, dl);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verify(pid, dl, sig);
    }

    // ================================================================ verifyAndBuy

    function _verifyAndBuyData(address recipient, uint256 usdcIn, uint256 minOut, bytes memory sig, uint256 dl)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeCall(
            PplCurveHubV2.verifyAndBuy,
            (usdcIn, minOut, recipient, address(0), keccak256(abi.encode("person", recipient)), dl, sig)
        );
    }

    function test_verifyAndBuy_newBuyerViaLifiExecutorInOneCall() public {
        _setTrustedRouter(address(executor), true);
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, _personIdOf(alice), dl);
        (uint256 quoted,) = hub.quoteBuy(100e6);
        uint256 minOut = quoted * 99 / 100;
        // Bridge delivered a bit more than the buy needs: the rest goes back to alice.
        usdc.mint(address(executor), 100.37e6);
        bool ok = executor.execute(
            IERC20(address(usdc)), address(hub), 100e6, _verifyAndBuyData(alice, 100e6, minOut, sig, dl), alice
        );
        assertTrue(ok, "destination call succeeded");
        bytes32 pid = _personIdOf(alice);
        assertEq(hub.personOf(alice), pid, "bound in the same call");
        assertEq(hub.pplOfPerson(pid), quoted, "PPL credited to alice's person");
        assertEq(usdc.balanceOf(alice), 0.37e6, "leftover refunded");
        assertEq(usdc.balanceOf(address(executor)), 0);
        assertEq(usdc.allowance(address(executor), address(hub)), 0);
        assertEq(hub.lastBuyAt(alice), 0, "router buy does not start alice's cooldown");
    }

    function test_verifyAndBuy_untrustedExecutorRevertsAtomicallyAndRefunds() public {
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, _personIdOf(alice), dl);
        usdc.mint(address(executor), 100e6);
        bool ok = executor.execute(
            IERC20(address(usdc)), address(hub), 100e6, _verifyAndBuyData(alice, 100e6, 0, sig, dl), alice
        );
        assertFalse(ok, "UntrustedRouter");
        assertEq(hub.personOf(alice), bytes32(0), "binding rolled back with the buy");
        assertEq(usdc.balanceOf(alice), 100e6, "all USDC back to the buyer");
    }

    function test_verifyAndBuy_badSignatureRefundsBuyer() public {
        _setTrustedRouter(address(executor), true);
        uint256 dl = _deadline();
        bytes memory sigForBob = _sign(bob, _personIdOf(alice), dl);
        usdc.mint(address(executor), 50e6);
        bool ok = executor.execute(
            IERC20(address(usdc)), address(hub), 50e6, _verifyAndBuyData(alice, 50e6, 0, sigForBob, dl), alice
        );
        assertFalse(ok);
        assertEq(hub.personOf(alice), bytes32(0));
        assertEq(usdc.balanceOf(alice), 50e6);
    }

    function test_verifyAndBuy_slippageRevertsWholeCall() public {
        _setTrustedRouter(address(executor), true);
        uint256 dl = _deadline();
        bytes memory sig = _sign(alice, _personIdOf(alice), dl);
        (uint256 quoted,) = hub.quoteBuy(100e6);
        usdc.mint(address(executor), 100e6);
        bool ok = executor.execute(
            IERC20(address(usdc)), address(hub), 100e6, _verifyAndBuyData(alice, 100e6, quoted + 1, sig, dl), alice
        );
        assertFalse(ok);
        assertEq(hub.personOf(alice), bytes32(0));
        assertEq(usdc.balanceOf(alice), 100e6);
    }

    function test_verifyAndBuy_alreadyVerifiedJustBuys() public {
        _setTrustedRouter(address(executor), true);
        bytes32 pid = _verify(alice);
        usdc.mint(address(executor), 50e6);
        // Stale/garbage attestation is ignored for an account already bound to that person.
        bool ok = executor.execute(
            IERC20(address(usdc)), address(hub), 50e6, _verifyAndBuyData(alice, 50e6, 0, hex"00", 0), alice
        );
        assertTrue(ok);
        assertGt(hub.pplOfPerson(pid), 0);
    }

    function test_verifyAndBuy_selfWithoutRouter() public {
        uint256 dl = _deadline();
        bytes32 pid = _personIdOf(alice);
        bytes memory sig = _sign(alice, pid, dl);
        _fund(alice, 10e6);
        vm.prank(alice);
        uint256 out = hub.verifyAndBuy(10e6, 0, alice, address(0), pid, dl, sig);
        assertGt(out, 0);
        assertEq(hub.personOf(alice), pid);
        assertGt(hub.lastBuyAt(alice), 0, "own buy keeps the cooldown rule");
    }

    function test_verifyAndBuy_thirdPartyCannotBuyForOthersWithoutRouter() public {
        uint256 dl = _deadline();
        bytes32 pid = _personIdOf(alice);
        bytes memory sig = _sign(alice, pid, dl);
        _fund(carol, 10e6);
        vm.prank(carol);
        vm.expectRevert(PplCurveHubV2.UntrustedRouter.selector);
        hub.verifyAndBuy(10e6, 0, alice, address(0), pid, dl, sig);
        assertEq(hub.personOf(alice), bytes32(0));
    }

    function test_verifyAndBuy_pausedReverts() public {
        vm.prank(owner);
        hub.pause();
        uint256 dl = _deadline();
        bytes32 pid = _personIdOf(alice);
        bytes memory sig = _sign(alice, pid, dl);
        _fund(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert();
        hub.verifyAndBuy(10e6, 0, alice, address(0), pid, dl, sig);
        assertEq(hub.personOf(alice), bytes32(0));
    }
}
