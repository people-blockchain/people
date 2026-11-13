// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {PeopleProjectToken} from "../src/token/PeopleProjectToken.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {LavkaPass} from "../src/lavka/LavkaPass.sol";
import {LavkaPayments} from "../src/lavka/LavkaPayments.sol";
import {MerchantEscrow} from "../src/lavka/MerchantEscrow.sol";
import {PeopleTimelock} from "../src/governance/PeopleTimelock.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {DeployLavka} from "../script/DeployLavka.s.sol";

/// A contract with no `receive`/`fallback`: a native-PPL transfer to it fails.
contract NativeRejector {}

contract MedPlainToken is ERC20 {
    constructor() ERC20("Plain", "PLN") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

/// @notice Regression tests for the Simple-branch contract Mediums: AUD-M2 (TokenFactory),
/// AUD-M5 / AUD-M6 (deploy scripts), AUD-M10 (`LavkaPass.createProgram` bounds) and AUD-M13
/// (`PeopleRouter.swapExactTokensForETH` check order).
///
/// AUD-M5 / AUD-M6 are deploy-script bugs, so their tests drive the real `run()` of each script
/// with the forge env plumbing (`vm.setEnv` + `vm.chainId`) rather than a hand-copied mirror.
contract AuditMediumsSimpleTest is Test {
    uint256 internal constant DEPLOYER_PK = 0xA11CE;

    address internal multisig = address(0x5117);
    address internal agentExecutor = address(0xA9E7);
    address internal feeRecipient = address(0xFEE);
    address internal ownerKey = address(0x1111);
    address internal cofounder = address(0x2222);
    address internal cold = address(0x3333);

    address internal merchant = address(0xA11CE0);
    address internal alice = address(0xA11CE1);

    PeopleRouter internal _ammRouter;
    MedPlainToken internal _ammPlain;

    // ------------------------------------------------------------------ helpers

    function _setEnvAddress(string memory key, address value) internal {
        vm.setEnv(key, vm.toString(value));
    }

    /// Runs `Deploy.s.sol` end to end with a fresh env, returning its deployment struct.
    function _runProtocolDeploy() internal returns (Deploy.Deployment memory d) {
        vm.chainId(PeopleConstants.PEOPLE_EVM_CHAIN_ID);
        vm.setEnv("DEPLOYER_PRIVATE_KEY", vm.toString(bytes32(DEPLOYER_PK)));
        _setEnvAddress("FEE_RECIPIENT", feeRecipient);
        _setEnvAddress("AGENT_EXECUTOR", agentExecutor);
        _setEnvAddress("TREASURY_MULTISIG_OWNER", ownerKey);
        _setEnvAddress("TREASURY_MULTISIG_COFOUNDER", cofounder);
        _setEnvAddress("TREASURY_MULTISIG_COLD", cold);
        Deploy deploy = new Deploy();
        d = deploy.run();
    }

    function _setLavkaEnv(address peopleMultisig, address existingTimelock) internal {
        vm.chainId(PeopleConstants.PEOPLE_EVM_CHAIN_ID);
        vm.setEnv("DEPLOYER_PRIVATE_KEY", vm.toString(bytes32(DEPLOYER_PK)));
        _setEnvAddress("TREASURY", address(0x1001));
        _setEnvAddress("VALIDATORS", address(0x1002));
        _setEnvAddress("GROWTH_POOL", address(0x1003));
        _setEnvAddress("LIQUIDITY_ECOSYSTEM", address(0x1004));
        _setEnvAddress("PEOPLE_MULTISIG", peopleMultisig);
        _setEnvAddress("LAVKA_TIMELOCK", existingTimelock);
    }

    // ------------------------------------------------------------------ AUD-M2

    /// AUD-M2 removed the dead `SymbolTaken` error instead of enforcing ticker uniqueness
    /// (uniqueness invites squatting). Two creators may still launch the same symbol; the UI is
    /// expected to disambiguate by contract address.
    function test_duplicateSymbolsAreAllowed() public {
        Deploy.Deployment memory d = _runProtocolDeploy();
        address c1 = address(0xC1);
        address c2 = address(0xC2);
        vm.deal(c1, 2 ether);
        vm.deal(c2, 2 ether);

        vm.prank(c1);
        address t1 = d.tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Real One", "real", 6, 1_000_000_000, ""
        );
        vm.prank(c2);
        address t2 = d.tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Real Two", "REAL", 6, 1_000_000_000, ""
        );

        assertTrue(t1 != t2, "both launches succeed");
        assertEq(PeopleProjectToken(t1).symbol(), "REAL", "symbol is uppercased, not rejected");
        assertEq(PeopleProjectToken(t2).symbol(), "REAL");
    }

    // ------------------------------------------------------------------ AUD-M5

    function test_agentExecutorGuardRejectsZero() public {
        Deploy deploy = new Deploy();
        vm.expectRevert(bytes("AGENT_EXECUTOR must be a non-zero address"));
        deploy.configuredAddress(address(0), "AGENT_EXECUTOR");
    }

    /// With AGENT_EXECUTOR configured, the deploy grant goes there and never to the deploy key.
    function test_deployGrantsExecutorRoleToConfiguredAddressOnly() public {
        Deploy.Deployment memory d = _runProtocolDeploy();
        address deployer = vm.addr(DEPLOYER_PK);
        assertTrue(d.agentWallet.hasRole(d.agentWallet.EXECUTOR_ROLE(), agentExecutor), "configured executor");
        assertFalse(d.agentWallet.hasRole(d.agentWallet.EXECUTOR_ROLE(), deployer), "not the deploy key");
    }

    /// Pre-mainnet audit: `Deploy.s.sol` used to make the multisig `DEFAULT_ADMIN_ROLE` of the
    /// timelock; an admin can `grantRole` instantly and so bypass the delay. The real `run()` must
    /// leave the timelock as its own sole admin, with the multisig only proposer + canceller.
    function test_deployTimelockIsSelfAdminAndMultisigIsNotAdmin() public {
        Deploy.Deployment memory d = _runProtocolDeploy();
        address deployer = vm.addr(DEPLOYER_PK);
        PeopleTimelock tl = d.timelock;
        bytes32 admin = tl.DEFAULT_ADMIN_ROLE();
        assertTrue(tl.hasRole(admin, address(tl)), "timelock is its own admin");
        assertFalse(tl.hasRole(admin, address(d.treasuryMultisig)), "multisig is not admin");
        assertFalse(tl.hasRole(admin, deployer), "deployer is not admin");
        assertFalse(tl.hasRole(admin, address(d.governor)), "governor is not admin");
        assertTrue(tl.hasRole(tl.PROPOSER_ROLE(), address(d.treasuryMultisig)), "multisig proposer");
        assertTrue(tl.hasRole(tl.CANCELLER_ROLE(), address(d.treasuryMultisig)), "multisig canceller");
        assertTrue(tl.hasRole(tl.PROPOSER_ROLE(), address(d.governor)), "governor proposer");
        assertTrue(tl.hasRole(tl.EXECUTOR_ROLE(), address(0)), "open executor");

        // The multisig can no longer mint itself roles without the delay.
        bytes32 proposer = tl.PROPOSER_ROLE();
        vm.prank(address(d.treasuryMultisig));
        vm.expectRevert();
        tl.grantRole(proposer, address(0xBAD));
    }

    // ------------------------------------------------------------------ AUD-M6

    /// The multisig is required, never defaulted to the deployer EOA. This exercises the same
    /// `configuredBucket` guard `requiredMultisig()` applies, without writing a process-wide env
    /// key: `vm.setEnv` is global and forge runs tests in parallel threads, so a test that sets a
    /// key another test also reads (let alone to a different value) races.
    function test_requiredMultisigRejectsZero() public {
        DeployLavka script = new DeployLavka();
        vm.expectRevert(bytes("PEOPLE_MULTISIG must be a non-zero address"));
        script.configuredBucket(address(0), "PEOPLE_MULTISIG");
    }

    /// Both Lavka bootstrap paths live in one test on purpose. Forge runs tests in parallel
    /// threads and `vm.setEnv` is process-wide, so two tests needing different values for
    /// `PEOPLE_MULTISIG` / `LAVKA_TIMELOCK` would race; one test is the only writer of those keys.
    ///
    /// Fresh path: a new `PeopleTimelock` must not keep DEFAULT_ADMIN_ROLE on the deployer or give
    /// it to the multisig (the timelock is its own admin; the multisig is only proposer/canceller)
    /// and `LavkaPass` must be owned by the multisig — mirroring the protocol's AUD-H1 bootstrap.
    /// Existing path: an explicitly supplied `LAVKA_TIMELOCK` is already wired; its roles must be
    /// left alone (in particular not granted to a multisig that does not control it).
    function test_deployLavkaWiresGovernanceToTheMultisig() public {
        address deployer = vm.addr(DEPLOYER_PK);

        // ------------------------------------------------------------- fresh timelock
        _setLavkaEnv(multisig, address(0));
        DeployLavka script = new DeployLavka();
        (LavkaPass pass, address timelockAddr,, LavkaPayments payments) = script.run();
        PeopleTimelock timelock = PeopleTimelock(payable(timelockAddr));

        assertEq(pass.owner(), multisig, "LavkaPass owner is the multisig");
        assertEq(payments.owner(), address(timelock), "timelock owns LavkaPayments");
        // The timelock is its own sole admin; the multisig must not be able to grantRole instantly.
        assertTrue(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(timelock)), "timelock self-admin");
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), multisig), "multisig is not admin");
        assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), multisig), "multisig proposer");
        assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), multisig), "multisig canceller");
        assertTrue(timelock.hasRole(timelock.EXECUTOR_ROLE(), address(0)), "executor role open");
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer), "deployer renounced admin");
        assertFalse(timelock.hasRole(timelock.PROPOSER_ROLE(), deployer), "deployer cannot propose");

        // The deploy key can no longer reach the timelock...
        bytes memory call = abi.encodeWithSelector(
            LavkaPayments.setBuckets.selector,
            address(0x2000),
            address(0x2001),
            address(0x2002),
            address(0x2003),
            address(0x2004)
        );
        vm.prank(deployer);
        vm.expectRevert();
        timelock.schedule(address(payments), 0, call, bytes32(0), bytes32("m6-deployer"), 2 days);

        // ...but the multisig can, and a timelocked owner action (payments owner = timelock) runs.
        vm.prank(multisig);
        timelock.schedule(address(payments), 0, call, bytes32(0), bytes32("m6-multisig"), 2 days);
        vm.warp(block.timestamp + 2 days + 1);
        timelock.execute(address(payments), 0, call, bytes32(0), bytes32("m6-multisig"));
        assertEq(payments.treasury(), address(0x2001), "governance action executed");

        // ------------------------------------------------------------- existing timelock
        PeopleTimelock existing = new PeopleTimelock(2 days); // this test contract is its admin
        _setLavkaEnv(multisig, address(existing));
        (LavkaPass pass2,, MerchantEscrow escrow, LavkaPayments payments2) = script.run();

        assertEq(pass2.owner(), multisig, "LavkaPass still handed to the multisig");
        assertEq(escrow.owner(), address(existing), "existing timelock owns the escrow");
        assertEq(payments2.owner(), address(existing), "existing timelock owns payments");
        assertTrue(existing.hasRole(existing.DEFAULT_ADMIN_ROLE(), address(this)), "admin untouched");
        assertFalse(existing.hasRole(existing.DEFAULT_ADMIN_ROLE(), multisig), "no new grant");
    }

    // ------------------------------------------------------------------ AUD-M10

    function test_createProgramRejectsZeroPrice() public {
        LavkaPass pass = new LavkaPass(address(this));
        vm.prank(merchant);
        vm.expectRevert(LavkaPass.ZeroPrice.selector);
        pass.createProgram(5, 0, false, 0);
    }

    function test_createProgramRejectsTooManyVisits() public {
        LavkaPass pass = new LavkaPass(address(this));
        uint16 max = pass.MAX_VISITS_PER_PURCHASE();
        assertEq(max, 100);
        vm.prank(merchant);
        vm.expectRevert(LavkaPass.TooManyVisits.selector);
        pass.createProgram(max + 1, 0, false, 1);
    }

    function test_createProgramAcceptsTheMaximum() public {
        LavkaPass pass = new LavkaPass(address(this));
        vm.prank(merchant);
        uint256 id = pass.createProgram(pass.MAX_VISITS_PER_PURCHASE(), 0, false, 1);
        assertEq(id, 1);
        (, uint16 visits, , , uint256 price,) = pass.programs(id);
        assertEq(visits, pass.MAX_VISITS_PER_PURCHASE());
        assertEq(price, 1);
    }

    // ------------------------------------------------------------------ AUD-M13

    function _ammSetup() internal {
        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        WPPL wppl = new WPPL();
        PeopleAmmFactory ammFactory = new PeopleAmmFactory(address(registry));
        PeopleRouter router = new PeopleRouter(address(ammFactory), wppl);
        MedPlainToken plain = new MedPlainToken();

        plain.transfer(alice, 100 ether);
        vm.deal(alice, 100 ether);
        vm.startPrank(alice);
        plain.approve(address(router), 100 ether);
        router.addLiquidityETH{value: 10 ether}(address(plain), 10 ether, 0, 0, alice, block.timestamp);
        vm.stopPrank();

        // Stash for the tests.
        _ammRouter = router;
        _ammPlain = plain;
    }

    /// The slippage check must run before the router pays native PPL. `to` here cannot receive
    /// native PPL, so the pre-fix order reverted with the `"eth"` transfer failure first; the new
    /// order reverts with `Slippage`.
    function test_swapExactTokensForETH_checksSlippageBeforePayingNative() public {
        _ammSetup();
        NativeRejector rejector = new NativeRejector();
        address[] memory path = new address[](2);
        path[0] = address(_ammPlain);
        path[1] = address(_ammRouter.WETH());

        vm.startPrank(alice);
        _ammPlain.approve(address(_ammRouter), 1 ether);
        vm.expectRevert(PeopleRouter.Slippage.selector);
        _ammRouter.swapExactTokensForETH(1 ether, 100 ether, path, address(rejector), block.timestamp);
        vm.stopPrank();
    }

    /// Within the minimum, the swap still pays the receiver in native PPL and leaves no wrapped
    /// dust in the router.
    function test_swapExactTokensForETH_paysNativeWithinSlippage() public {
        _ammSetup();
        address receiver = address(0xBEEF);
        address[] memory path = new address[](2);
        path[0] = address(_ammPlain);
        path[1] = address(_ammRouter.WETH());

        vm.startPrank(alice);
        _ammPlain.approve(address(_ammRouter), 1 ether);
        uint256[] memory amounts = _ammRouter.swapExactTokensForETH(1 ether, 0, path, receiver, block.timestamp);
        vm.stopPrank();

        assertGt(amounts[1], 0);
        assertEq(receiver.balance, amounts[1], "receiver paid in native PPL");
        assertEq(WPPL(payable(_ammRouter.WETH())).balanceOf(address(_ammRouter)), 0, "no wrapped dust");
    }
}
