// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {NftFactory} from "../src/nft/NftFactory.sol";
import {StableFeeGateway} from "../src/fees/StableFeeGateway.sol";
import {PromoRewardsVault} from "../src/promo/PromoRewardsVault.sol";
import {IPeopleRouter, IPeopleAmmFactory} from "../src/interfaces/ICreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {PeopleTimelock} from "../src/governance/PeopleTimelock.sol";
import {GovernanceToken} from "../src/governance/GovernanceToken.sol";
import {PeopleGovernor} from "../src/governance/PeopleGovernor.sol";
import {CommunityAgentWallet} from "../src/agent/CommunityAgentWallet.sol";
import {LavkaPass} from "../src/lavka/LavkaPass.sol";
import {MerchantEscrow} from "../src/lavka/MerchantEscrow.sol";
import {LavkaPayments} from "../src/lavka/LavkaPayments.sol";

/// @notice Mainnet launch-stack deploy with governed ownership from the first block.
///
/// Ownership model (every deviation is listed in the "Exceptions" block below and in
/// `contracts/README.md`):
///  * One MAIN `PeopleTimelock` (`minDelay` >= 1 day, default 2 days). It is its own and only
///    DEFAULT_ADMIN_ROLE holder: OZ's constructor always grants that role to the timelock, the
///    deployer is the temporary constructor admin and renounces it before `deploy` returns.
///  * The existing 2-of-3 `PeopleMultisig` is only PROPOSER + CANCELLER on the timelock (never
///    admin, never executor-only). EXECUTOR is open (address(0)). The governor is PROPOSER +
///    CANCELLER as in `Deploy.s.sol`.
///  * Every Ownable contract ends owned by the timelock: registry, bonding curve, community
///    vault, token factory, NFT factory, StableFeeGateway (Ownable2Step), LavkaPass,
///    MerchantEscrow, LavkaPayments. Where the constructor takes the owner the timelock is passed
///    directly (no pending/accept step, deployer never owns the contract); the registry and the
///    two factories are deployer-owned only until their one-off wiring is finished, then
///    handed over with single-step `transferOwnership`.
///  * StableFeeGateway is constructed with the timelock as owner, so the stablecoin allowlist
///    can only be set by the deployer's temporary PROPOSER role scheduling `setStableAllowed`
///    behind the timelock delay (anyone executes after `minDelay`; EXECUTOR is open). Until then
///    the gateway accepts no stablecoin, which fails closed. The deployer renounces PROPOSER
///    and ADMIN before returning.
///
/// Exceptions (documented, not hidden):
///  1. `CommunityAgentWallet.GUARDIAN_ROLE` = treasury multisig. The guardian can only FREEZE the
///     wallet instantly (`setEmergencyFreeze`); unfreeze, limits and allowlists remain
///     timelock-only. DEFAULT_ADMIN_ROLE of the wallet is the timelock. `EXECUTOR_ROLE` is the
///     configured agent executor (an operational spender key bounded by the wallet's limits).
///  2. `StableFeeGateway.pause()/unpause()` are `onlyOwner` and the gateway has no separate
///     pauser role, so pausing is delayed by `minDelay` (trade-off: no instant kill switch for
///     stablecoin fees; the timelock CANCELLER cannot pause either).
///  3. The 2-of-3 multisig owner set is validated here (threshold 2, three owners) but is not
///     controlled by this script.
///
/// Signing: pass `DEPLOYER_ADDRESS` and sign with the forge CLI (`--account`, `--ledger`, ...).
/// No private key is read from env or files.
contract DeployMainnet is Script {
    uint256 internal constant MIN_DELAY_FLOOR = 1 days;
    uint256 internal constant DEFAULT_MIN_DELAY = 2 days;
    uint256 internal constant DEFAULT_TOKEN_FEE_USD6 = 1_000000;
    uint256 internal constant DEFAULT_NFT_FEE_USD6 = 2_000000;

    struct Config {
        uint256 expectedChainId;
        address deployer;
        address treasuryMultisig; // existing 2-of-3 PeopleMultisig
        address feeRecipient;
        address agentExecutor;
        address wppl; // address(0) => deploy a fresh WPPL
        address stableUsdc;
        address stableUsdt;
        uint256 tokenFeeUsd6;
        uint256 nftFeeUsd6;
        uint256 minDelay;
        address lavkaTreasury;
        address lavkaValidators;
        address lavkaGrowthPool;
        address lavkaLiquidityEcosystem;
    }

    struct Deployment {
        PeopleTimelock timelock;
        GovernanceToken governanceToken;
        PeopleGovernor governor;
        PeopleProtocolRegistry registry;
        WPPL wppl;
        PeopleAmmFactory ammFactory;
        PeopleRouter router;
        CreatorVesting creatorVesting;
        CommunityTokenVault communityVault;
        BondingCurveMarket bondingCurve;
        TokenFactory tokenFactory;
        PromoRewardsVault promoVault;
        NftFactory nftFactory;
        StableFeeGateway gateway;
        CommunityAgentWallet agentWallet;
        LavkaPass lavkaPass;
        MerchantEscrow merchantEscrow;
        LavkaPayments lavkaPayments;
    }

    // ------------------------------------------------------------------ config loading

    /// @dev `DEPLOY_CONFIG=deployments/mainnet.config.json` selects the JSON file; otherwise
    /// every field is read from its env var (see `deployments/mainnet.config.example.json`).
    function run() external returns (Deployment memory d) {
        string memory path = vm.envOr("DEPLOY_CONFIG", string(""));
        Config memory cfg;
        if (bytes(path).length > 0) {
            cfg = parseConfigJson(vm.readFile(string.concat(vm.projectRoot(), "/", path)));
        } else {
            cfg = configFromEnv();
        }
        d = deploy(cfg);
    }

    function configFromEnv() public view returns (Config memory cfg) {
        cfg.expectedChainId = vm.envUint("MAINNET_CHAIN_ID");
        cfg.deployer = requiredAddress(vm.envAddress("DEPLOYER_ADDRESS"), "DEPLOYER_ADDRESS");
        cfg.treasuryMultisig = requiredAddress(vm.envAddress("TREASURY_MULTISIG"), "TREASURY_MULTISIG");
        cfg.feeRecipient = requiredAddress(vm.envAddress("FEE_RECIPIENT"), "FEE_RECIPIENT");
        cfg.agentExecutor = requiredAddress(vm.envAddress("AGENT_EXECUTOR"), "AGENT_EXECUTOR");
        cfg.wppl = vm.envOr("WPPL", address(0));
        cfg.stableUsdc = requiredAddress(vm.envAddress("STABLE_USDC"), "STABLE_USDC");
        cfg.stableUsdt = requiredAddress(vm.envAddress("STABLE_USDT"), "STABLE_USDT");
        cfg.tokenFeeUsd6 = vm.envOr("TOKEN_FEE_USD6", DEFAULT_TOKEN_FEE_USD6);
        cfg.nftFeeUsd6 = vm.envOr("NFT_FEE_USD6", DEFAULT_NFT_FEE_USD6);
        cfg.minDelay = vm.envOr("TIMELOCK_MIN_DELAY", DEFAULT_MIN_DELAY);
        cfg.lavkaTreasury = requiredAddress(vm.envAddress("LAVKA_TREASURY"), "LAVKA_TREASURY");
        cfg.lavkaValidators = requiredAddress(vm.envAddress("LAVKA_VALIDATORS"), "LAVKA_VALIDATORS");
        cfg.lavkaGrowthPool = requiredAddress(vm.envAddress("LAVKA_GROWTH_POOL"), "LAVKA_GROWTH_POOL");
        cfg.lavkaLiquidityEcosystem =
            requiredAddress(vm.envAddress("LAVKA_LIQUIDITY_ECOSYSTEM"), "LAVKA_LIQUIDITY_ECOSYSTEM");
    }

    /// @dev Pure-string parse so it is unit-testable. Address fields are JSON strings; an empty
    /// string for a required field reverts, `wppl` may be empty (deploy fresh), the three
    /// numeric fields fall back to their defaults when absent.
    function parseConfigJson(string memory json) public view returns (Config memory cfg) {
        cfg.expectedChainId = vm.parseJsonUint(json, ".chainId");
        cfg.deployer = _jsonAddress(json, ".deployer", true);
        cfg.treasuryMultisig = _jsonAddress(json, ".treasuryMultisig", true);
        cfg.feeRecipient = _jsonAddress(json, ".feeRecipient", true);
        cfg.agentExecutor = _jsonAddress(json, ".agentExecutor", true);
        cfg.wppl = _jsonAddress(json, ".wppl", false);
        cfg.stableUsdc = _jsonAddress(json, ".stableUsdc", true);
        cfg.stableUsdt = _jsonAddress(json, ".stableUsdt", true);
        cfg.tokenFeeUsd6 = vm.keyExistsJson(json, ".tokenFeeUsd6")
            ? vm.parseJsonUint(json, ".tokenFeeUsd6")
            : DEFAULT_TOKEN_FEE_USD6;
        cfg.nftFeeUsd6 = vm.keyExistsJson(json, ".nftFeeUsd6")
            ? vm.parseJsonUint(json, ".nftFeeUsd6")
            : DEFAULT_NFT_FEE_USD6;
        cfg.minDelay = vm.keyExistsJson(json, ".timelockMinDelaySeconds")
            ? vm.parseJsonUint(json, ".timelockMinDelaySeconds")
            : DEFAULT_MIN_DELAY;
        cfg.lavkaTreasury = _jsonAddress(json, ".lavka.treasury", true);
        cfg.lavkaValidators = _jsonAddress(json, ".lavka.validators", true);
        cfg.lavkaGrowthPool = _jsonAddress(json, ".lavka.growthPool", true);
        cfg.lavkaLiquidityEcosystem = _jsonAddress(json, ".lavka.liquidityEcosystem", true);
    }

    function _jsonAddress(string memory json, string memory key, bool required) internal view returns (address) {
        if (!vm.keyExistsJson(json, key)) {
            require(!required, string.concat(key, " missing"));
            return address(0);
        }
        string memory s = vm.parseJsonString(json, key);
        if (bytes(s).length == 0) {
            require(!required, string.concat(key, " is empty"));
            return address(0);
        }
        return requiredAddress(vm.parseAddress(s), key);
    }

    function requiredAddress(address value, string memory name) public pure returns (address) {
        require(value != address(0), string.concat(name, " must be a non-zero address"));
        return value;
    }

    /// @dev Config sanity that needs no chain state. Public so tests can hit each branch.
    function validateConfig(Config memory c) public pure {
        require(c.minDelay >= MIN_DELAY_FLOOR, "timelock minDelay < 1 day");
        require(c.deployer != address(0), "deployer zero");
        address[7] memory governed = [
            c.treasuryMultisig,
            c.feeRecipient,
            c.agentExecutor,
            c.lavkaTreasury,
            c.lavkaValidators,
            c.lavkaGrowthPool,
            c.lavkaLiquidityEcosystem
        ];
        for (uint256 i = 0; i < governed.length; i++) {
            // Fee sinks / operator keys must never be the deploy hot key (AUD-H4, AUD-M5, LAV-M2).
            require(governed[i] != address(0), "governed address zero");
            require(governed[i] != c.deployer, "governed address == deployer");
        }
        require(c.stableUsdc != c.stableUsdt, "stables identical");
        require(c.tokenFeeUsd6 > 0 && c.nftFeeUsd6 > 0, "stable fee zero");
    }

    // ----------------------------------------------------------------------- deploy

    function deploy(Config memory c) public returns (Deployment memory d) {
        require(block.chainid == c.expectedChainId, "wrong chain id");
        validateConfig(c);
        _requireTwoOfThree(c.treasuryMultisig);
        require(c.stableUsdc.code.length > 0 && c.stableUsdt.code.length > 0, "stable has no code");
        if (c.wppl != address(0)) require(c.wppl.code.length > 0, "wppl has no code");

        address deployer = c.deployer;
        vm.startBroadcast(deployer);

        // --- governance: timelock first, every owner below is this address -------------
        d.timelock = new PeopleTimelock(c.minDelay); // ctor admin = deployer (+ timelock itself)
        address tl = address(d.timelock);
        d.governanceToken = new GovernanceToken(tl);
        d.governor = new PeopleGovernor(d.governanceToken, d.timelock);
        bytes32 proposer = d.timelock.PROPOSER_ROLE();
        bytes32 canceller = d.timelock.CANCELLER_ROLE();
        d.timelock.grantRole(proposer, address(d.governor));
        d.timelock.grantRole(canceller, address(d.governor));
        d.timelock.grantRole(d.timelock.EXECUTOR_ROLE(), address(0));
        // Multisig: schedule/cancel only. NOT admin (an admin could grantRole instantly).
        d.timelock.grantRole(proposer, c.treasuryMultisig);
        d.timelock.grantRole(canceller, c.treasuryMultisig);

        // --- protocol core ------------------------------------------------------------
        d.registry = new PeopleProtocolRegistry(); // owner = deployer until setTokenFactory is done
        d.wppl = c.wppl == address(0) ? new WPPL() : WPPL(payable(c.wppl));
        d.ammFactory = new PeopleAmmFactory(address(d.registry));
        d.router = new PeopleRouter(address(d.ammFactory), d.wppl);
        d.creatorVesting = new CreatorVesting(address(d.registry));
        d.communityVault = new CommunityTokenVault(address(d.registry), tl);
        d.bondingCurve = new BondingCurveMarket(
            address(d.registry),
            c.feeRecipient,
            IPeopleRouter(address(d.router)),
            IPeopleAmmFactory(address(d.ammFactory)),
            tl,
            c.feeRecipient
        );
        // Factories are deployer-owned only for the one-off setter wiring below.
        d.tokenFactory = new TokenFactory(c.feeRecipient, d.bondingCurve, d.creatorVesting, d.communityVault, deployer);
        d.registry.setTokenFactory(address(d.tokenFactory));
        d.promoVault = new PromoRewardsVault(address(d.registry), d.communityVault);
        d.tokenFactory.setPromoVault(address(d.promoVault));
        d.nftFactory = new NftFactory(c.feeRecipient, address(d.registry), deployer);
        // Gateway is born timelock-owned (Ownable2Step ctor sets owner directly, no pending).
        d.gateway = new StableFeeGateway(
            tl, c.feeRecipient, address(d.tokenFactory), address(d.nftFactory), c.tokenFeeUsd6, c.nftFeeUsd6
        );
        d.tokenFactory.setGateway(address(d.gateway));
        d.nftFactory.setGateway(address(d.gateway));

        d.agentWallet = new CommunityAgentWallet(c.agentExecutor, tl, c.feeRecipient, c.treasuryMultisig);

        // --- Lavka: all three owned by the MAIN timelock -----------------------------
        d.lavkaPass = new LavkaPass(tl);
        d.merchantEscrow = new MerchantEscrow(tl);
        d.lavkaPayments = new LavkaPayments(
            tl, address(d.communityVault), c.lavkaTreasury, c.lavkaValidators, c.lavkaLiquidityEcosystem, c.lavkaGrowthPool
        );

        // --- hand over single-step Ownables -------------------------------------------
        d.registry.transferOwnership(tl);
        d.tokenFactory.transferOwnership(tl);
        d.nftFactory.transferOwnership(tl);

        // --- stablecoin allowlist: scheduled behind the delay, then deployer steps down --
        d.timelock.grantRole(proposer, deployer);
        _scheduleStable(d.timelock, d.gateway, c.stableUsdc, c.minDelay);
        _scheduleStable(d.timelock, d.gateway, c.stableUsdt, c.minDelay);
        d.timelock.renounceRole(proposer, deployer);
        d.timelock.renounceRole(d.timelock.DEFAULT_ADMIN_ROLE(), deployer); // M07-5

        vm.stopBroadcast();

        _verify(d, c);

        console2.log("Timelock", tl);
        console2.log("Registry", address(d.registry));
        console2.log("TokenFactory", address(d.tokenFactory));
        console2.log("NftFactory", address(d.nftFactory));
        console2.log("BondingCurve", address(d.bondingCurve));
        console2.log("CommunityVault", address(d.communityVault));
        console2.log("PromoRewardsVault", address(d.promoVault));
        console2.log("StableFeeGateway", address(d.gateway));
        console2.log("AgentWallet", address(d.agentWallet));
        console2.log("LavkaPass", address(d.lavkaPass));
        console2.log("MerchantEscrow", address(d.merchantEscrow));
        console2.log("LavkaPayments", address(d.lavkaPayments));
        console2.log("NOTE: execute the 2 scheduled setStableAllowed ops after minDelay (see README).");
    }

    function stableSalt(address stable) public pure returns (bytes32) {
        return keccak256(abi.encode("DeployMainnet.setStableAllowed", stable));
    }

    function stableCall(address stable) public pure returns (bytes memory) {
        return abi.encodeCall(StableFeeGateway.setStableAllowed, (stable, true));
    }

    function _scheduleStable(PeopleTimelock tl, StableFeeGateway gw, address stable, uint256 delay) internal {
        tl.schedule(address(gw), 0, stableCall(stable), bytes32(0), stableSalt(stable), delay);
    }

    function _requireTwoOfThree(address multisig) internal view {
        require(multisig.code.length > 0, "multisig has no code");
        (bool ok, bytes memory data) = multisig.staticcall(abi.encodeWithSignature("threshold()"));
        require(ok && data.length == 32 && abi.decode(data, (uint256)) == 2, "multisig threshold != 2");
        (ok, data) = multisig.staticcall(abi.encodeWithSignature("ownerCount()"));
        require(ok && data.length == 32 && abi.decode(data, (uint256)) == 3, "multisig owners != 3");
    }

    // --------------------------------------------------------------------- verification

    /// @dev Fails the whole script (so a dry-run / simulation aborts before any broadcast is
    /// sent) if any owner or role is off. Runs on the post-deploy state.
    function _verify(Deployment memory d, Config memory c) internal view {
        PeopleTimelock t = d.timelock;
        address tl = address(t);
        address dep = c.deployer;
        bytes32 admin = t.DEFAULT_ADMIN_ROLE();
        bytes32 proposer = t.PROPOSER_ROLE();
        bytes32 canceller = t.CANCELLER_ROLE();
        bytes32 executor = t.EXECUTOR_ROLE();

        // Timelock roles.
        require(t.getMinDelay() == c.minDelay && c.minDelay >= MIN_DELAY_FLOOR, "timelock delay");
        require(t.hasRole(admin, tl), "timelock not self-admin");
        require(!t.hasRole(admin, dep), "deployer is timelock admin");
        require(!t.hasRole(admin, c.treasuryMultisig), "multisig is timelock admin");
        require(!t.hasRole(admin, address(d.governor)), "governor is timelock admin");
        require(t.hasRole(proposer, c.treasuryMultisig), "multisig not proposer");
        require(t.hasRole(canceller, c.treasuryMultisig), "multisig not canceller");
        require(t.hasRole(proposer, address(d.governor)), "governor not proposer");
        require(t.hasRole(canceller, address(d.governor)), "governor not canceller");
        require(t.hasRole(executor, address(0)), "executor not open");
        require(!t.hasRole(proposer, dep), "deployer is proposer");
        require(!t.hasRole(canceller, dep), "deployer is canceller");
        // The only role-admin is the timelock itself: nobody can grant roles without the delay.
        require(t.getRoleAdmin(proposer) == admin && t.getRoleAdmin(canceller) == admin, "role admin");

        // Ownables.
        require(d.registry.owner() == tl, "registry owner");
        require(d.bondingCurve.owner() == tl, "bondingCurve owner");
        require(d.communityVault.owner() == tl, "communityVault owner");
        require(d.tokenFactory.owner() == tl, "tokenFactory owner");
        require(d.nftFactory.owner() == tl, "nftFactory owner");
        require(d.gateway.owner() == tl, "gateway owner");
        require(d.gateway.pendingOwner() == address(0), "gateway pendingOwner");
        require(d.lavkaPass.owner() == tl, "lavkaPass owner");
        require(d.merchantEscrow.owner() == tl, "merchantEscrow owner");
        require(d.lavkaPayments.owner() == tl, "lavkaPayments owner");

        // Wiring.
        require(d.registry.tokenFactoryAddress() == address(d.tokenFactory), "registry factory");
        require(d.tokenFactory.promoVault() == address(d.promoVault), "tokenFactory promoVault");
        require(d.tokenFactory.gateway() == address(d.gateway), "tokenFactory gateway");
        require(d.nftFactory.gateway() == address(d.gateway), "nftFactory gateway");

        // CommunityAgentWallet: timelock admin; multisig = freeze-only guardian; deployer nothing.
        CommunityAgentWallet w = d.agentWallet;
        require(w.timelockController() == tl, "wallet timelock");
        require(w.hasRole(w.DEFAULT_ADMIN_ROLE(), tl), "wallet admin");
        require(!w.hasRole(w.DEFAULT_ADMIN_ROLE(), dep), "deployer wallet admin");
        require(!w.hasRole(w.DEFAULT_ADMIN_ROLE(), c.treasuryMultisig), "multisig wallet admin");
        require(w.hasRole(w.GUARDIAN_ROLE(), c.treasuryMultisig), "wallet guardian");
        require(w.hasRole(w.EXECUTOR_ROLE(), c.agentExecutor), "wallet executor");
        require(!w.hasRole(w.EXECUTOR_ROLE(), dep) && !w.hasRole(w.GUARDIAN_ROLE(), dep), "deployer wallet role");

        // The two stablecoin allowlist ops must be queued (pending), not executed or lost.
        require(
            t.isOperationPending(_stableOpId(t, d.gateway, c.stableUsdc))
                && t.isOperationPending(_stableOpId(t, d.gateway, c.stableUsdt)),
            "stable ops not scheduled"
        );
        require(
            !d.gateway.isAcceptedStable(c.stableUsdc) && !d.gateway.isAcceptedStable(c.stableUsdt),
            "stable allowed before delay"
        );
    }

    function _stableOpId(PeopleTimelock t, StableFeeGateway gw, address stable) internal view returns (bytes32) {
        return t.hashOperation(address(gw), 0, stableCall(stable), bytes32(0), stableSalt(stable));
    }
}
