// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {LavkaPass} from "../src/lavka/LavkaPass.sol";
import {MerchantEscrow} from "../src/lavka/MerchantEscrow.sol";
import {LavkaPayments} from "../src/lavka/LavkaPayments.sol";
import {PeopleTimelock} from "../src/governance/PeopleTimelock.sol";

contract DeployLavka is Script {
    /// Rejects an unset/zero fee destination. Split from `requiredBucket` so the guard is
    /// unit-testable without the forge env plumbing.
    function configuredBucket(address value, string memory name) public pure returns (address) {
        require(value != address(0), string.concat(name, " must be a non-zero address"));
        return value;
    }

    /// A fee destination must be configured explicitly: defaulting it to the deployer EOA would
    /// route most of every LavkaPayments fee to a hot key and only a timelocked `setBuckets`
    /// could correct it afterwards (LAV-M2). `vm.envAddress` (not `vm.envOr`) reverts if the
    /// variable is absent, and `configuredBucket` rejects an empty/zero value. AUD-H3: the
    /// liquidity & ecosystem bucket is required the same way — it replaces the burn sink, which
    /// Model A sets to 0%.
    function requiredBucket(string memory name) public view returns (address value) {
        return configuredBucket(vm.envAddress(name), name);
    }

    /// AUD-M6: the multisig that owns the fresh `LavkaPass` and bootstraps a fresh Lavka
    /// `PeopleTimelock` — the same role `PeopleMultisig` plays in `Deploy.s.sol` (AUD-H1).
    /// Required, never defaulted to the deployer EOA: a default would leave the deploy hot key
    /// as `LavkaPass` owner (it can mint-invalidate or flip programs inactive) and as the
    /// timelock's admin, which is what M08-6 ("never the deployer EOA") and AUD-M6 forbid.
    function requiredMultisig() public view returns (address value) {
        return configuredBucket(vm.envAddress("PEOPLE_MULTISIG"), "PEOPLE_MULTISIG");
    }

    /// @dev Returns the deployed addresses so tests can assert the wiring without predicting
    /// CREATE addresses; `forge script` ignores them the same way it does for `Deploy.s.sol`.
    function run()
        external
        returns (LavkaPass pass, address timelock, MerchantEscrow escrow, LavkaPayments payments)
    {
        require(block.chainid == PeopleConstants.PEOPLE_EVM_CHAIN_ID, "wrong chain id");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address communityVault = vm.envOr("COMMUNITY_VAULT", deployer);
        address treasury = requiredBucket("TREASURY");
        address validators = requiredBucket("VALIDATORS");
        address growthPool = requiredBucket("GROWTH_POOL");
        address liquidityEcosystem = requiredBucket("LIQUIDITY_ECOSYSTEM");
        address peopleMultisig = requiredMultisig();
        // Resolver/governance owner for MerchantEscrow and LavkaPayments: an existing timelock
        // address, or a freshly deployed one if none is given (never the deployer EOA — M08-6/M08-8).
        address existingTimelock = vm.envOr("LAVKA_TIMELOCK", address(0));

        vm.startBroadcast(deployerKey);
        // AUD-M6: owner is the multisig, not the deployer EOA — the live LavkaPass was already
        // transferred to the multisig, so a fresh deploy must start there too.
        pass = new LavkaPass(peopleMultisig);
        if (existingTimelock != address(0)) {
            // An existing timelock is already wired; leave its roles alone.
            timelock = existingTimelock;
        } else {
            // AUD-M6: a fresh `PeopleTimelock` would otherwise keep DEFAULT_ADMIN_ROLE on the
            // deployer EOA, making M08-6's "never the deployer EOA" mean "the deployer with a
            // 2-day delay". Mirror the main protocol's AUD-H1 bootstrap in `Deploy.s.sol`: the
            // multisig is the timelock's proposer/canceller (it can schedule the initial
            // configuration and act in an emergency, still behind the 2-day delay), the
            // executor role is open to anyone, and the deployer renounces its admin role. The
            // multisig is deliberately NOT given DEFAULT_ADMIN_ROLE: an admin can `grantRole`
            // instantly and so bypass the delay. OZ's constructor always makes the timelock its
            // own admin, so after the deployer renounces, role changes need schedule -> delay.
            PeopleTimelock fresh = new PeopleTimelock(2 days);
            fresh.grantRole(fresh.PROPOSER_ROLE(), peopleMultisig);
            fresh.grantRole(fresh.CANCELLER_ROLE(), peopleMultisig);
            fresh.grantRole(fresh.EXECUTOR_ROLE(), address(0));
            fresh.renounceRole(fresh.DEFAULT_ADMIN_ROLE(), deployer);
            timelock = address(fresh);
        }
        escrow = new MerchantEscrow(timelock);
        payments = new LavkaPayments(timelock, communityVault, treasury, validators, liquidityEcosystem, growthPool);
        vm.stopBroadcast();

        console2.log("LavkaPass", address(pass));
        console2.log("PeopleMultisig", peopleMultisig);
        console2.log("MerchantEscrow", address(escrow));
        console2.log("LavkaPayments", address(payments));
        console2.log("LavkaTimelock", timelock);
    }
}
