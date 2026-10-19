// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {GovernanceToken} from "../src/governance/GovernanceToken.sol";
import {PeopleTimelock} from "../src/governance/PeopleTimelock.sol";
import {PeopleGovernor} from "../src/governance/PeopleGovernor.sol";
import {PeopleMultisig} from "../src/governance/PeopleMultisig.sol";

/// AUD-H1 regression: the governance stack must be bootstrappable.
///
/// `GovernanceToken` mints its whole 1,000,000 gPPL supply to the timelock, which never
/// delegates, so total voting power at deploy is zero: nobody can meet `PeopleGovernor`'s
/// 100,000 gPPL proposal threshold, let alone its 4% quorum. Before the fix the governor was
/// also the timelock's only proposer and the deployer renounced `DEFAULT_ADMIN_ROLE` to nobody,
/// so the first proposal could never pass — the supply was locked and every timelock-gated
/// control (including `CommunityAgentWallet`'s freeze) was dead. `Deploy.s.sol` now also gives
/// the approved 2-of-3 `PeopleMultisig` the proposer/canceller roles as bootstrap authority.
/// The multisig is deliberately NOT the timelock's `DEFAULT_ADMIN_ROLE` (pre-mainnet audit): an
/// admin can `grantRole` instantly and so bypass the delay; the timelock is its own sole admin.
/// This test mirrors that wiring and drives it end to end.
contract GovernanceBootstrapTest is Test {
    address internal deployer = address(0xD3919);
    address internal ownerKey = address(0x0001);
    address internal cofounder = address(0x0002);
    address internal cold = address(0x0003);
    address internal community = address(0xC0FFEE);

    GovernanceToken internal gov;
    PeopleTimelock internal timelock;
    PeopleGovernor internal governor;
    PeopleMultisig internal multisig;

    /// Mirrors `Deploy.s.sol` (`run`), which executes these calls as the deployer EOA.
    function setUp() public {
        address[3] memory owners = [ownerKey, cofounder, cold];
        vm.startPrank(deployer);
        multisig = new PeopleMultisig(owners);
        timelock = new PeopleTimelock(2 days);
        gov = new GovernanceToken(address(timelock));
        governor = new PeopleGovernor(gov, timelock);
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(multisig));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(multisig));
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);
        vm.stopPrank();
    }

    /// The deployer EOA keeps no standing control (M07-5 still holds).
    function test_deployerKeepsNoRole() public view {
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(timelock.hasRole(timelock.PROPOSER_ROLE(), deployer));
        assertFalse(timelock.hasRole(timelock.CANCELLER_ROLE(), deployer));
        assertFalse(multisig.isOwner(deployer), "deployer is not a multisig owner either");
    }

    /// The timelock is its own sole admin: neither the multisig nor the governor can grant roles
    /// instantly, so every role change has to pass through schedule -> delay -> execute.
    function test_timelockIsSelfAdminOnly() public {
        bytes32 admin = timelock.DEFAULT_ADMIN_ROLE();
        assertTrue(timelock.hasRole(admin, address(timelock)), "timelock is its own admin");
        assertFalse(timelock.hasRole(admin, address(multisig)), "multisig is not admin");
        assertFalse(timelock.hasRole(admin, address(governor)), "governor is not admin");
        assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), address(multisig)));
        assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), address(multisig)));

        bytes32 proposer = timelock.PROPOSER_ROLE();
        vm.prank(address(multisig));
        vm.expectRevert();
        timelock.grantRole(proposer, community);
    }

    /// A single multisig owner cannot act alone: the 2-of-3 threshold still applies.
    function test_singleMultisigOwnerCannotSchedule() public {
        bytes memory call = abi.encodeWithSignature("transfer(address,uint256)", community, uint256(1 ether));
        bytes memory schedule = abi.encodeWithSignature(
            "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
            address(gov),
            uint256(0),
            call,
            bytes32(0),
            bytes32(0),
            uint256(2 days)
        );
        vm.prank(ownerKey);
        uint256 txId = multisig.submit(address(timelock), 0, schedule);
        vm.prank(ownerKey);
        vm.expectRevert(PeopleMultisig.NotEnoughConfirmations.selector);
        multisig.execute(txId);
    }

    /// No outside address can schedule on the timelock.
    function test_strangerCannotSchedule() public {
        vm.prank(community);
        vm.expectRevert();
        timelock.schedule(address(gov), 0, hex"", bytes32(0), bytes32(0), 2 days);
    }

    /// The bootstrap path end to end: 2-of-3 schedules a gPPL distribution, the 2-day delay
    /// elapses, anyone executes it, the recipient delegates, and the governor can now carry a
    /// proposal of its own — which is what was impossible before.
    function test_multisigBootstrapsGovernance() public {
        uint256 grantAmount = 200_000 ether;
        bytes memory call = abi.encodeWithSignature("transfer(address,uint256)", community, grantAmount);

        uint256 txId = _multisigCall(
            abi.encodeWithSignature(
                "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
                address(gov),
                uint256(0),
                call,
                bytes32(0),
                bytes32(0),
                uint256(2 days)
            )
        );
        assertTrue(txId == 0);

        // Nothing moves before the delay.
        vm.expectRevert();
        timelock.execute(address(gov), 0, call, bytes32(0), bytes32(0));
        vm.warp(block.timestamp + 2 days + 1);
        // EXECUTOR_ROLE is open, so anyone may execute once the delay has passed.
        vm.prank(community);
        timelock.execute(address(gov), 0, call, bytes32(0), bytes32(0));
        assertEq(gov.balanceOf(community), grantAmount, "distribution executed");

        // With votes delegated the governor is live: above threshold, and a vote reaches quorum.
        vm.prank(community);
        gov.delegate(community);
        vm.warp(block.timestamp + 1);
        assertEq(gov.getVotes(community), grantAmount);
        assertGe(gov.getVotes(community), governor.proposalThreshold(), "proposal threshold reachable");

        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        targets[0] = address(gov);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", address(0xBEEF), uint256(1 ether));
        vm.prank(community);
        uint256 proposalId = governor.propose(targets, values, calldatas, "first real proposal");

        // AUD-M11: votingDelay/votingPeriod are now seconds (the token's clock is timestamp),
        // not blocks — advance wall-clock time, not block number.
        vm.warp(block.timestamp + governor.votingDelay() + 1);
        vm.prank(community);
        governor.castVote(proposalId, 1);
        vm.warp(block.timestamp + governor.votingPeriod() + 1);
        assertGe(gov.getVotes(community), governor.quorum(block.timestamp - 1), "quorum reachable");
        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Succeeded));
    }

    /// The emergency path the deadlock had removed: the multisig can still reach a
    /// timelock-gated control (here, revoking its own bootstrap roles once the DAO is live).
    function test_multisigCanHandOffToTheDao() public {
        // Revoking is itself a timelock self-call, so it carries the delay like everything else.
        bytes memory revokeProposer =
            abi.encodeWithSignature("revokeRole(bytes32,address)", timelock.PROPOSER_ROLE(), address(multisig));
        _multisigCall(
            abi.encodeWithSignature(
                "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
                address(timelock),
                uint256(0),
                revokeProposer,
                bytes32(0),
                bytes32(0),
                uint256(2 days)
            )
        );
        vm.warp(block.timestamp + 2 days + 1);
        timelock.execute(address(timelock), 0, revokeProposer, bytes32(0), bytes32(0));
        assertFalse(timelock.hasRole(timelock.PROPOSER_ROLE(), address(multisig)), "handoff is one proposal");
    }

    /// `Deploy.s.sol` used to default all three owners to the deployer, which `PeopleMultisig`
    /// rejects — so `target: all` could never complete. The guard is now explicit.
    function test_multisigOwnerGuardRejectsBadConfig() public {
        Deploy d = new Deploy();
        vm.expectRevert(bytes("TREASURY_MULTISIG_* must be three distinct addresses"));
        d.checkedMultisigOwners([deployer, deployer, deployer]);
        vm.expectRevert(bytes("TREASURY_MULTISIG_{OWNER,COFOUNDER,COLD} must be non-zero"));
        d.checkedMultisigOwners([ownerKey, address(0), cold]);
        address[3] memory ok = d.checkedMultisigOwners([ownerKey, cofounder, cold]);
        assertEq(ok[0], ownerKey);
        assertEq(ok[2], cold);
    }

    function _multisigCall(bytes memory data) internal returns (uint256 txId) {
        vm.prank(ownerKey);
        txId = multisig.submit(address(timelock), 0, data);
        vm.prank(cofounder);
        multisig.confirm(txId);
        vm.prank(cold);
        multisig.execute(txId);
    }
}
