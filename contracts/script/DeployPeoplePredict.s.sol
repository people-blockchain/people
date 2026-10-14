// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeoplePredict} from "../src/PeoplePredict.sol";

/// @notice Deploy PeoplePredict on testnet 97401 with immutable admin = PeopleMultisig.
/// Admin is not Ownable2Step — constructor sets admin; createMarket is admin-only.
contract DeployPeoplePredict is Script {
    address internal constant MULTISIG = 0xbE38DD4bEA1406878FF40AE1D5cE7c7e6Dc7ddaB;

    function run() external returns (PeoplePredict predict) {
        require(block.chainid == PeopleConstants.PEOPLE_EVM_CHAIN_ID, "wrong chain id");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(key);
        predict = new PeoplePredict(MULTISIG);
        vm.stopBroadcast();
        console2.log("peoplePredict", address(predict));
        console2.log("admin", predict.admin());
        console2.log("VERSION", predict.VERSION());
        console2.log("DISPUTE_WINDOW", predict.DISPUTE_WINDOW());
    }
}
