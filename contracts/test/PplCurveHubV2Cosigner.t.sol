// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

/// @dev Audit 2026-11-01: sell-back attestations need two independent signatures once a cosigner
/// is set, and on Base mainnet a cosigner is mandatory.
contract PplCurveHubV2CosignerTest is HubV2Base {
    uint256 internal cosignerPk = 0xC051;
    address internal cosigner;
    address internal alice = makeAddr("alice");

    function setUp() public override {
        super.setUp();
        cosigner = vm.addr(cosignerPk);
    }

    function _installCosigner(HubV2Harness h, address c) internal {
        vm.prank(owner);
        bytes32 id = h.queueSetReturnCosigner(c);
        vm.warp(vm.getBlockTimestamp() + h.ADMIN_TIMELOCK());
        vm.prank(owner);
        h.executeSetReturnCosigner(id);
    }

    function _cosign(address seller, uint256 ppl, bytes32 id, uint256 deadline) internal view returns (bytes memory) {
        return _signReturnRaw(
            cosignerPk,
            address(hub),
            block.chainid,
            hub.personOf(seller),
            address(hub),
            seller,
            ppl,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            deadline
        );
    }

    /// @dev alice holds sellable lots (bought, 30-day hold passed).
    function _holder() internal returns (uint256 ppl) {
        _seedRaised(100_000e6);
        _open();
        _prepare(alice);
        _buy(alice, MAX_BUY);
        vm.warp(vm.getBlockTimestamp() + 31 days);
        ppl = hub.pplOf(alice) / 10;
    }

    function test_cosignerSetterTimelockedAndOwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        hub.queueSetReturnCosigner(cosigner);

        vm.prank(owner);
        bytes32 id = hub.queueSetReturnCosigner(cosigner);
        vm.warp(vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK() - 1);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.Timelocked.selector);
        hub.executeSetReturnCosigner(id);
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.prank(owner);
        hub.executeSetReturnCosigner(id);
        assertEq(hub.returnCosigner(), cosigner);
    }

    function test_cosignerMustDifferFromVerifier() public {
        vm.prank(owner);
        bytes32 id = hub.queueSetReturnCosigner(returnVerifier);
        vm.warp(vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK());
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.SameSigner.selector);
        hub.executeSetReturnCosigner(id);
        vm.prank(owner);
        hub.cancel(id);

        _installCosigner(hub, cosigner);
        vm.prank(owner);
        id = hub.queueSetReturnVerifier(cosigner);
        vm.warp(vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK());
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.SameSigner.selector);
        hub.executeSetReturnVerifier(id);
    }

    function test_bothSignaturesRequiredOnceCosignerSet() public {
        uint256 ppl = _holder();
        _installCosigner(hub, cosigner);
        bytes32 id = _freshReturnId();
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes memory v = _signReturn(alice, ppl, id, deadline);
        bytes memory c = _cosign(alice, ppl, id, deadline);

        vm.startPrank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, v); // verifier alone
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, c); // cosigner alone
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, bytes.concat(c, v)); // wrong order
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, bytes.concat(v, v)); // one key twice
        assertGt(hub.sellBack(ppl, 0, id, deadline, ppl, bytes.concat(v, c)), 0);
        vm.stopPrank();
    }

    function test_stolenVerifierKeyAloneCannotSign() public {
        uint256 ppl = _holder();
        _installCosigner(hub, cosigner);
        bytes32 id = _freshReturnId();
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        uint256 attackerPk = 0xBAD;
        bytes memory forgedCo = _signReturnRaw(
            attackerPk,
            address(hub),
            block.chainid,
            hub.personOf(alice),
            address(hub),
            alice,
            ppl,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            deadline
        );
        bytes memory sig = bytes.concat(_signReturn(alice, ppl, id, deadline), forgedCo);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);
    }

    function test_baseMainnetSellBackNeedsCosigner() public {
        vm.chainId(8453);
        address baseUsdc = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        vm.etch(baseUsdc, address(usdc).code);
        usdc = MockUSDC(baseUsdc);
        vm.etch(treasury, hex"00");
        vm.etch(owner, hex"00");
        vm.etch(liquidityReceiver, hex"00");
        hub = new HubV2Harness(baseUsdc, treasury, liquidityReceiver, owner, verifier, address(0));
        _installReturnVerifier(hub, returnVerifier);
        uint256 ppl = _holder();

        bytes32 id = _freshReturnId();
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes memory v = _signReturn(alice, ppl, id, deadline);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.CosignerRequired.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, v);

        _installCosigner(hub, cosigner);
        deadline = vm.getBlockTimestamp() + 1 hours;
        v = _signReturn(alice, ppl, id, deadline);
        bytes memory c = _cosign(alice, ppl, id, deadline);
        vm.prank(alice);
        assertGt(hub.sellBack(ppl, 0, id, deadline, ppl, bytes.concat(v, c)), 0);
    }

    function test_removingCosignerOnTestnetFallsBackToOneSignature() public {
        uint256 ppl = _holder();
        _installCosigner(hub, cosigner);
        _installCosigner(hub, address(0));
        assertEq(hub.returnCosigner(), address(0));
        bytes32 id = _freshReturnId();
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _signReturn(alice, ppl, id, deadline);
        vm.prank(alice);
        assertGt(hub.sellBack(ppl, 0, id, deadline, ppl, sig), 0);
    }
}
