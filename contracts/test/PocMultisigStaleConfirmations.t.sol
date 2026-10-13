// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PeopleMultisig} from "../src/governance/PeopleMultisig.sol";

/// H-02/S1-03: `PeopleMultisig` hardening.
///
/// (a) The threshold floor of 2 can never be bypassed — `changeThreshold` always reverts
/// `InvalidThreshold` for any value below 2, closing the self-downgrade-to-a-single-key path
/// (every owner, including a majority of compromised ones, conspiring to drop a 2-of-3 down to
/// 1-of-N).
///
/// (b) The audit's exact compromise scenario (audit-opus-2026-10-12.md, S1-03): a compromised
/// owner submits a malicious transaction, which `submit` auto-confirms as that owner's single
/// confirmation. The team notices and rotates the compromised owner out via `replaceOwner`
/// (equally, `removeOwner`). Pre-fix, a second, honest confirmation on the *original* transaction
/// id was still enough to `execute` it — the compromised owner's now-revoked confirmation kept
/// counting toward the threshold forever. Post-fix, every owner/threshold change bumps
/// `configNonce`, and `execute` reverts `StaleConfirmations` unless the transaction's
/// `configNonceAtSubmit` still matches the live `configNonce` — rotating the compromised owner
/// out invalidates every confirmation placed before the rotation, including the attacker's own.
contract PocMultisigStaleConfirmationsTest is Test {
    PeopleMultisig internal multisig;

    address internal owner1 = address(0x1); // honest
    address internal owner2 = address(0x2); // honest
    address internal compromised = address(0x3); // owner3, later rotated out
    address internal replacement = address(0x4);
    address internal drainTo = address(0xBAD);

    function setUp() public {
        multisig = new PeopleMultisig([owner1, owner2, compromised]);
        vm.deal(address(multisig), 10 ether);
    }

    // ------------------------------------------------------------------ (a) threshold floor

    function test_changeThresholdBelowTwoAlwaysReverts() public {
        // Pranking as the multisig itself isolates exactly the floor check in `changeThreshold`,
        // independent of the submit/confirm/execute wrapping exercised in (b)/elsewhere.
        vm.prank(address(multisig));
        vm.expectRevert(PeopleMultisig.InvalidThreshold.selector);
        multisig.changeThreshold(1);

        vm.prank(address(multisig));
        vm.expectRevert(PeopleMultisig.InvalidThreshold.selector);
        multisig.changeThreshold(0);
    }

    function test_changeThresholdBelowTwoRevertsEvenViaFullExecutionPath() public {
        bytes memory data = abi.encodeWithSelector(PeopleMultisig.changeThreshold.selector, uint256(1));
        vm.prank(owner1);
        uint256 txId = multisig.submit(address(multisig), 0, data);
        vm.prank(owner2);
        multisig.confirm(txId);
        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.CallFailed.selector);
        multisig.execute(txId);
        assertEq(multisig.threshold(), 2, "threshold is unchanged");
    }

    // ------------------------------------------------------------------ (b) stale confirmations

    function test_rotatingACompromisedOwnerInvalidatesItsPreStagedConfirmation() public {
        // The compromised owner submits a malicious drain; `submit` auto-confirms it, so this
        // single call already carries 1 of the 2 confirmations needed to execute.
        vm.prank(compromised);
        uint256 evilTxId = multisig.submit(drainTo, 5 ether, "");
        assertTrue(multisig.confirmedBy(evilTxId, compromised));

        // Not yet executable — only 1 confirmation.
        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.NotEnoughConfirmations.selector);
        multisig.execute(evilTxId);

        // The team notices and rotates the compromised owner out via the normal
        // submit/confirm/execute path (2 honest confirmations).
        bytes memory rotate = abi.encodeWithSelector(PeopleMultisig.replaceOwner.selector, compromised, replacement);
        vm.prank(owner1);
        uint256 rotateTxId = multisig.submit(address(multisig), 0, rotate);
        vm.prank(owner2);
        multisig.confirm(rotateTxId);
        vm.prank(owner1);
        multisig.execute(rotateTxId);

        assertFalse(multisig.isOwner(compromised));
        assertTrue(multisig.isOwner(replacement));

        // An honest owner supplies the "second" confirmation the drain tx was only ever one
        // confirmation short of.
        vm.prank(owner2);
        multisig.confirm(evilTxId);

        // Pre-fix this confirmation count (2, meeting the threshold) would have been enough to
        // execute. Post-fix, the rotation bumped `configNonce`, so the stale pre-rotation
        // transaction can never execute again, no matter who confirms it now.
        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.StaleConfirmations.selector);
        multisig.execute(evilTxId);

        assertEq(drainTo.balance, 0, "the drain never executes");
    }

    function test_removeOwnerAlsoInvalidatesStaleConfirmations() public {
        vm.prank(compromised);
        uint256 evilTxId = multisig.submit(drainTo, 1 ether, "");

        bytes memory remove = abi.encodeWithSelector(PeopleMultisig.removeOwner.selector, compromised);
        vm.prank(owner1);
        uint256 removeTxId = multisig.submit(address(multisig), 0, remove);
        vm.prank(owner2);
        multisig.confirm(removeTxId);
        vm.prank(owner1);
        multisig.execute(removeTxId);
        assertFalse(multisig.isOwner(compromised));

        vm.prank(owner2);
        multisig.confirm(evilTxId);
        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.StaleConfirmations.selector);
        multisig.execute(evilTxId);

        assertEq(drainTo.balance, 0, "the drain never executes");
    }
}
