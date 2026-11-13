// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {DeployMainnet} from "../script/DeployMainnet.s.sol";
import {PeopleMultisig} from "../src/governance/PeopleMultisig.sol";
import {PeopleTimelock} from "../src/governance/PeopleTimelock.sol";
import {StableFeeGateway} from "../src/fees/StableFeeGateway.sol";

contract Stable6 is ERC20 {
    constructor(string memory n) ERC20(n, n) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// Runs the `DeployMainnet` logic in-process (no RPC, no env: the script's `deploy(Config)` entry
/// point takes the config struct, so parallel tests never race on `vm.setEnv`) and asserts the
/// ownership model: every Ownable owned by the MAIN timelock, timelock its own sole admin, the
/// multisig only proposer/canceller, the deployer left with nothing.
contract DeployMainnetConfigTest is Test {
    uint256 internal constant CHAIN_ID = 424242;

    address internal deployer = address(0xD3919);
    address internal ownerA = address(0x0001);
    address internal ownerB = address(0x0002);
    address internal ownerC = address(0x0003);
    address internal feeRecipient = address(0xFEE);
    address internal agentExecutor = address(0xA9E7);
    address internal alice = address(0xA11CE);

    DeployMainnet internal script;
    PeopleMultisig internal multisig;
    Stable6 internal usdc;
    Stable6 internal usdt;

    DeployMainnet.Deployment internal d;

    function setUp() public {
        vm.chainId(CHAIN_ID);
        script = new DeployMainnet();
        multisig = new PeopleMultisig([ownerA, ownerB, ownerC]);
        usdc = new Stable6("USDC");
        usdt = new Stable6("USDT");
        d = script.deploy(_cfg());
    }

    function _cfg() internal view returns (DeployMainnet.Config memory c) {
        c.expectedChainId = CHAIN_ID;
        c.deployer = deployer;
        c.treasuryMultisig = address(multisig);
        c.feeRecipient = feeRecipient;
        c.agentExecutor = agentExecutor;
        c.wppl = address(0);
        c.stableUsdc = address(usdc);
        c.stableUsdt = address(usdt);
        c.tokenFeeUsd6 = 1_000000;
        c.nftFeeUsd6 = 2_000000;
        c.minDelay = 2 days;
        c.lavkaTreasury = address(0x1001);
        c.lavkaValidators = address(0x1002);
        c.lavkaGrowthPool = address(0x1003);
        c.lavkaLiquidityEcosystem = address(0x1004);
    }

    // ------------------------------------------------------------------ ownership

    function test_everyOwnableIsOwnedByTheMainTimelock() public view {
        address tl = address(d.timelock);
        assertEq(d.registry.owner(), tl, "registry");
        assertEq(d.bondingCurve.owner(), tl, "bondingCurve");
        assertEq(d.communityVault.owner(), tl, "communityVault");
        assertEq(d.tokenFactory.owner(), tl, "tokenFactory");
        assertEq(d.nftFactory.owner(), tl, "nftFactory");
        assertEq(d.gateway.owner(), tl, "gateway");
        assertEq(d.gateway.pendingOwner(), address(0), "gateway has nothing pending (ctor-owned)");
        // One timelock for everything, including Lavka: no separate LAVKA_TIMELOCK.
        assertEq(d.lavkaPass.owner(), tl, "lavkaPass");
        assertEq(d.merchantEscrow.owner(), tl, "merchantEscrow");
        assertEq(d.lavkaPayments.owner(), tl, "lavkaPayments");
    }

    function test_wiringIsComplete() public view {
        assertEq(d.registry.tokenFactoryAddress(), address(d.tokenFactory));
        assertEq(d.tokenFactory.promoVault(), address(d.promoVault));
        assertEq(d.tokenFactory.gateway(), address(d.gateway));
        assertEq(d.nftFactory.gateway(), address(d.gateway));
    }

    function test_timelockIsItsOwnSoleAdmin() public view {
        PeopleTimelock t = d.timelock;
        bytes32 admin = t.DEFAULT_ADMIN_ROLE();
        assertTrue(t.hasRole(admin, address(t)), "self admin");
        assertFalse(t.hasRole(admin, deployer), "deployer");
        assertFalse(t.hasRole(admin, address(script)), "script contract");
        assertFalse(t.hasRole(admin, address(multisig)), "multisig");
        assertFalse(t.hasRole(admin, address(d.governor)), "governor");
        assertEq(t.getMinDelay(), 2 days);
    }

    function test_multisigIsProposerAndCancellerButNotAdmin() public view {
        PeopleTimelock t = d.timelock;
        assertTrue(t.hasRole(t.PROPOSER_ROLE(), address(multisig)));
        assertTrue(t.hasRole(t.CANCELLER_ROLE(), address(multisig)));
        assertFalse(t.hasRole(t.DEFAULT_ADMIN_ROLE(), address(multisig)));
        assertTrue(t.hasRole(t.PROPOSER_ROLE(), address(d.governor)));
        assertTrue(t.hasRole(t.CANCELLER_ROLE(), address(d.governor)));
        assertTrue(t.hasRole(t.EXECUTOR_ROLE(), address(0)), "open executor");
    }

    function test_deployerKeepsNoRoleOrOwnership() public view {
        PeopleTimelock t = d.timelock;
        assertFalse(t.hasRole(t.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(t.hasRole(t.PROPOSER_ROLE(), deployer), "temporary proposer renounced");
        assertFalse(t.hasRole(t.CANCELLER_ROLE(), deployer));
        assertFalse(t.hasRole(t.EXECUTOR_ROLE(), deployer));
        assertTrue(d.registry.owner() != deployer);
        assertTrue(d.tokenFactory.owner() != deployer);
        assertTrue(d.nftFactory.owner() != deployer);
        assertTrue(d.bondingCurve.owner() != deployer);
        assertTrue(d.communityVault.owner() != deployer);
        assertTrue(d.gateway.owner() != deployer);
        assertTrue(d.lavkaPass.owner() != deployer);
        assertTrue(d.merchantEscrow.owner() != deployer);
        assertTrue(d.lavkaPayments.owner() != deployer);
        bytes32 wAdmin = d.agentWallet.DEFAULT_ADMIN_ROLE();
        assertFalse(d.agentWallet.hasRole(wAdmin, deployer));
        assertFalse(d.agentWallet.hasRole(d.agentWallet.EXECUTOR_ROLE(), deployer));
        assertFalse(d.agentWallet.hasRole(d.agentWallet.GUARDIAN_ROLE(), deployer));
    }

    /// Documented exception 1: the multisig is a freeze-only guardian of the agent wallet.
    function test_agentWalletRolesAndGuardianException() public {
        assertTrue(d.agentWallet.hasRole(d.agentWallet.DEFAULT_ADMIN_ROLE(), address(d.timelock)));
        assertFalse(d.agentWallet.hasRole(d.agentWallet.DEFAULT_ADMIN_ROLE(), address(multisig)));
        assertTrue(d.agentWallet.hasRole(d.agentWallet.GUARDIAN_ROLE(), address(multisig)));
        assertTrue(d.agentWallet.hasRole(d.agentWallet.EXECUTOR_ROLE(), agentExecutor));

        vm.prank(address(multisig));
        d.agentWallet.setEmergencyFreeze(true);
        // Unfreezing stays timelock-only.
        vm.prank(address(multisig));
        vm.expectRevert();
        d.agentWallet.setEmergencyFreeze(false);
    }

    // ------------------------------------------- timelock-gated paths (the delay is real)

    function test_multisigCannotGrantRolesInstantly() public {
        bytes32 proposer = d.timelock.PROPOSER_ROLE();
        vm.prank(address(multisig));
        vm.expectRevert();
        d.timelock.grantRole(proposer, alice);
    }

    function test_deployerCannotGrantRolesOrTouchOwnables() public {
        bytes32 proposer = d.timelock.PROPOSER_ROLE();
        vm.startPrank(deployer);
        vm.expectRevert();
        d.timelock.grantRole(proposer, deployer);
        vm.expectRevert();
        d.registry.setTokenFactory(alice);
        vm.expectRevert();
        d.gateway.pause();
        vm.stopPrank();
    }

    /// The stablecoin allowlist is queued by the script and only lands after the delay.
    function test_stableOpsExecuteOnlyAfterTheDelay() public {
        assertFalse(d.gateway.isAcceptedStable(address(usdc)), "closed until the op runs");
        assertFalse(d.gateway.isAcceptedStable(address(usdt)));

        bytes memory callUsdc = script.stableCall(address(usdc));
        bytes32 saltUsdc = script.stableSalt(address(usdc));
        vm.expectRevert();
        d.timelock.execute(address(d.gateway), 0, callUsdc, bytes32(0), saltUsdc);

        vm.warp(block.timestamp + 2 days);
        // EXECUTOR is open: any account runs the queued op.
        vm.prank(alice);
        d.timelock.execute(address(d.gateway), 0, callUsdc, bytes32(0), saltUsdc);
        vm.prank(alice);
        d.timelock.execute(
            address(d.gateway), 0, script.stableCall(address(usdt)), bytes32(0), script.stableSalt(address(usdt))
        );
        assertTrue(d.gateway.isAcceptedStable(address(usdc)));
        assertTrue(d.gateway.isAcceptedStable(address(usdt)));
    }

    /// Documented exception 2 / trade-off: `pause()` is `onlyOwner`, so it is timelock-delayed.
    function test_gatewayPauseNeedsTheTimelockDelay() public {
        bytes memory pauseCall = abi.encodeCall(StableFeeGateway.pause, ());
        vm.prank(address(multisig));
        d.timelock.schedule(address(d.gateway), 0, pauseCall, bytes32(0), bytes32(0), 2 days);
        vm.expectRevert();
        d.timelock.execute(address(d.gateway), 0, pauseCall, bytes32(0), bytes32(0));
        vm.warp(block.timestamp + 2 days);
        d.timelock.execute(address(d.gateway), 0, pauseCall, bytes32(0), bytes32(0));
        assertTrue(d.gateway.paused());
    }

    /// Ownable2Step handoff recipe: a gateway still owned by an EOA is offered to the timelock
    /// (`pendingOwner`), the multisig schedules `acceptOwnership`, and the timelock executes it.
    function test_ownable2StepAcceptViaTimelockProposal() public {
        StableFeeGateway g =
            new StableFeeGateway(alice, feeRecipient, address(0x1111), address(0x2222), 1_000000, 2_000000);
        vm.prank(alice);
        g.transferOwnership(address(d.timelock));
        assertEq(g.owner(), alice, "still alice until accepted");
        assertEq(g.pendingOwner(), address(d.timelock));

        bytes memory acceptCall = abi.encodeWithSignature("acceptOwnership()");
        vm.prank(address(multisig));
        d.timelock.schedule(address(g), 0, acceptCall, bytes32(0), bytes32(0), 2 days);
        vm.warp(block.timestamp + 2 days);
        d.timelock.execute(address(g), 0, acceptCall, bytes32(0), bytes32(0));
        assertEq(g.owner(), address(d.timelock));
        assertEq(g.pendingOwner(), address(0));
    }

    // ------------------------------------------------------------ config guards (fail closed)

    function test_revertsOnWrongChainId() public {
        DeployMainnet.Config memory c = _cfg();
        vm.chainId(CHAIN_ID + 1);
        vm.expectRevert(bytes("wrong chain id"));
        script.deploy(c);
    }

    function test_revertsWhenMinDelayBelowOneDay() public {
        DeployMainnet.Config memory c = _cfg();
        c.minDelay = 1 days - 1;
        vm.expectRevert(bytes("timelock minDelay < 1 day"));
        script.deploy(c);
        c.minDelay = 1 days; // boundary is allowed
        script.deploy(c);
    }

    function test_revertsWhenAGovernedAddressIsTheDeployer() public {
        DeployMainnet.Config memory c = _cfg();
        c.feeRecipient = deployer;
        vm.expectRevert(bytes("governed address == deployer"));
        script.deploy(c);

        c = _cfg();
        c.agentExecutor = deployer;
        vm.expectRevert(bytes("governed address == deployer"));
        script.deploy(c);

        c = _cfg();
        c.lavkaTreasury = deployer;
        vm.expectRevert(bytes("governed address == deployer"));
        script.deploy(c);
    }

    function test_revertsWhenMultisigIsNotATwoOfThree() public {
        DeployMainnet.Config memory c = _cfg();
        c.treasuryMultisig = address(usdc); // has code, but no threshold()
        vm.expectRevert(bytes("multisig threshold != 2"));
        script.deploy(c);

        c = _cfg();
        c.treasuryMultisig = address(0xBEEF); // EOA
        vm.expectRevert(bytes("multisig has no code"));
        script.deploy(c);
    }

    function test_revertsWhenStableHasNoCode() public {
        DeployMainnet.Config memory c = _cfg();
        c.stableUsdt = address(0x7777);
        vm.expectRevert(bytes("stable has no code"));
        script.deploy(c);
    }

    // --------------------------------------------------------------------- JSON config

    function test_parseConfigJson() public view {
        string memory json = string.concat(
            '{"note":"x","chainId":424242,"deployer":"',
            vm.toString(deployer),
            '","treasuryMultisig":"',
            vm.toString(address(multisig)),
            '","feeRecipient":"',
            vm.toString(feeRecipient),
            '","agentExecutor":"',
            vm.toString(agentExecutor),
            '","wppl":"","stableUsdc":"',
            vm.toString(address(usdc)),
            '","stableUsdt":"',
            vm.toString(address(usdt)),
            '","lavka":{"treasury":"',
            vm.toString(address(0x1001)),
            '","validators":"',
            vm.toString(address(0x1002)),
            '","growthPool":"',
            vm.toString(address(0x1003)),
            '","liquidityEcosystem":"',
            vm.toString(address(0x1004)),
            '"}}'
        );
        DeployMainnet.Config memory c = script.parseConfigJson(json);
        assertEq(c.expectedChainId, CHAIN_ID);
        assertEq(c.deployer, deployer);
        assertEq(c.treasuryMultisig, address(multisig));
        assertEq(c.wppl, address(0), "empty wppl => deploy fresh");
        assertEq(c.minDelay, 2 days, "default delay");
        assertEq(c.tokenFeeUsd6, 1_000000, "default token fee");
        assertEq(c.nftFeeUsd6, 2_000000, "default nft fee");
        assertEq(c.lavkaLiquidityEcosystem, address(0x1004));
    }

    function test_parseConfigJsonRejectsEmptyRequiredAddress() public {
        string memory json = string.concat(
            '{"chainId":1,"deployer":"","treasuryMultisig":"',
            vm.toString(address(multisig)),
            '"}'
        );
        vm.expectRevert(bytes(".deployer is empty"));
        script.parseConfigJson(json);
    }
}
