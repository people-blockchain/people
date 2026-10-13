// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleProjectToken} from "../src/token/PeopleProjectToken.sol";
import {PeopleMultisig} from "../src/governance/PeopleMultisig.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";

/// Regression tests for M11-2 / M07-4: the community pool and ecosystem reserve previously had
/// no withdrawal path at all. They are now owned by a 2-of-3 `PeopleMultisig`.
contract PeopleMultisigTest is Test {
    PeopleProtocolRegistry internal registry;
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal bondingCurve;
    CommunityTokenVault internal vault;
    PeopleRouter internal router;
    WPPL internal wppl;
    PeopleAmmFactory internal ammFactory;
    PeopleMultisig internal multisig;

    address internal owner1 = address(0x1);
    address internal owner2 = address(0x2);
    address internal owner3 = address(0x3);
    address internal creator = address(0xC0FFEE);
    address internal feeRecipient = address(0xFEE);
    address internal receiver = address(0xBEEF);

    address internal token;

    function setUp() public {
        multisig = new PeopleMultisig([owner1, owner2, owner3]);

        registry = new PeopleProtocolRegistry();
        wppl = new WPPL();
        ammFactory = new PeopleAmmFactory(address(registry));
        router = new PeopleRouter(address(ammFactory), wppl);
        bondingCurve = new BondingCurveMarket(
            address(registry), feeRecipient, router, ammFactory, address(multisig), address(0x7EA5)
        );
        CreatorVesting vesting = new CreatorVesting(address(registry));
        vault = new CommunityTokenVault(address(registry), address(multisig));
        tokenFactory = new TokenFactory(feeRecipient, bondingCurve, vesting, vault, address(multisig));
        registry.setTokenFactory(address(tokenFactory));

        vm.deal(creator, 2 ether);
        vm.prank(creator);
        token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "People Test", "PTST", 6, 1_000_000_000, "ipfs://meta"
        );
    }

    function test_multisig_requires_two_confirmations() public {
        uint256 amount = vault.balances(token);
        assertGt(amount, 0);

        // H-01: `receiver` must be allow-listed before `withdraw` will accept it as `to`.
        _execute(address(vault), abi.encodeWithSignature("setRecipientAllowed(address,bool)", receiver, true));

        bytes memory data = abi.encodeWithSelector(vault.withdraw.selector, token, receiver, amount);

        vm.prank(owner1);
        uint256 txId = multisig.submit(address(vault), 0, data);

        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.NotEnoughConfirmations.selector);
        multisig.execute(txId);

        vm.prank(owner2);
        multisig.confirm(txId);

        vm.prank(owner3);
        multisig.execute(txId);

        assertEq(PeopleProjectToken(token).balanceOf(receiver), amount);
        assertEq(vault.balances(token), 0);
    }

    function test_non_owner_cannot_submit() public {
        bytes memory data = abi.encodeWithSelector(vault.withdraw.selector, token, receiver, uint256(1));
        vm.prank(receiver);
        vm.expectRevert(PeopleMultisig.NotOwner.selector);
        multisig.submit(address(vault), 0, data);
    }

    function test_vault_withdraw_rejects_non_owner_directly() public {
        vm.prank(owner1);
        vm.expectRevert();
        vault.withdraw(token, receiver, 1);
    }

    function test_ecosystem_reserve_withdraw_via_multisig() public {
        CurveMath.Allocation memory allocation = CurveMath.calculateAllocation(1_000_000_000);
        uint256 ecosystemReserve = allocation.ecosystemReserve;
        assertGt(ecosystemReserve, 0);
        bytes memory data =
            abi.encodeWithSelector(bondingCurve.withdrawEcosystemReserve.selector, token, receiver, ecosystemReserve);

        vm.prank(owner1);
        uint256 txId = multisig.submit(address(bondingCurve), 0, data);
        vm.prank(owner2);
        multisig.confirm(txId);
        vm.prank(owner1);
        multisig.execute(txId);

        assertEq(PeopleProjectToken(token).balanceOf(receiver), ecosystemReserve);
    }

    // ------------------------------------------------------------------ AUD-H4

    /// The fee sink used to be `immutable` in all three fee-charging contracts, so a wrong or
    /// broken recipient (one that stops accepting native PPL reverts every buy, sell, token
    /// create and mint) could only be fixed by redeploying. Governance can now rotate it.
    function test_multisig_can_rotate_fee_recipients() public {
        address newSink = address(0xFEE2);
        _execute(address(bondingCurve), abi.encodeWithSignature("setFeeRecipient(address)", newSink));
        _execute(address(tokenFactory), abi.encodeWithSignature("setFeeRecipient(address)", newSink));
        assertEq(bondingCurve.feeRecipient(), newSink);
        assertEq(tokenFactory.feeRecipient(), newSink);
    }

    function test_non_owner_cannot_rotate_fee_recipient() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        bondingCurve.setFeeRecipient(address(0xFEE2));
        vm.prank(address(0xBAD));
        vm.expectRevert();
        tokenFactory.setFeeRecipient(address(0xFEE2));
    }

    /// A zero sink would send the fee to the burn address on every trade.
    function test_fee_recipient_cannot_be_zeroed() public {
        vm.prank(owner1);
        uint256 txId = multisig.submit(
            address(bondingCurve), 0, abi.encodeWithSignature("setFeeRecipient(address)", address(0))
        );
        vm.prank(owner2);
        multisig.confirm(txId);
        vm.prank(owner1);
        vm.expectRevert(PeopleMultisig.CallFailed.selector);
        multisig.execute(txId);
    }

    function _execute(address target, bytes memory data) internal {
        vm.prank(owner1);
        uint256 txId = multisig.submit(target, 0, data);
        vm.prank(owner2);
        multisig.confirm(txId);
        vm.prank(owner1);
        multisig.execute(txId);
    }
}
