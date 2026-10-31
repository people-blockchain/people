// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {PeopleFounderNFT} from "../src/nft/PeopleFounderNFT.sol";
import {IERC5192} from "../src/nft/IERC5192.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PeopleFounderNFTTest is Test {
    PeopleFounderNFT internal nft;

    // Test-only keys, derived in code (never real keys).
    uint256 internal signerPk = uint256(keccak256("people-founder-nft.test.signer"));
    uint256 internal rogueSignerPk = uint256(keccak256("people-founder-nft.test.rogue-signer"));
    address internal signer;
    /// @dev Stands in for the Safe multisig that owns the contract.
    address internal owner = makeAddr("owner-safe");

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    bytes32 internal constant P1 = keccak256("person-1");
    bytes32 internal constant P2 = keccak256("person-2");
    bytes32 internal constant P3 = keccak256("person-3");
    bytes32 internal constant P4 = keccak256("person-4");

    uint256 internal mintDeadline;
    uint256 internal nextNonce = 1;

    event Locked(uint256 tokenId);
    event Minted(bytes32 indexed personId, uint256 indexed tokenId, address indexed to);
    event Rebound(bytes32 indexed personId, uint256 indexed tokenId, address oldHolder, address newHolder);
    event RebindRequested(
        bytes32 indexed personId, uint256 indexed tokenId, address oldHolder, address newHolder, uint256 executeAfter
    );
    event RebindCancelled(bytes32 indexed personId, uint256 indexed tokenId, address indexed holder);
    event SignerUpdated(address indexed previousSigner, address indexed newSigner, uint64 epoch);
    event SignerRevoked(address indexed previousSigner, uint64 epoch);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function setUp() public {
        vm.warp(1_800_000_000);
        signer = vm.addr(signerPk);
        mintDeadline = block.timestamp + 30 days;
        nft = new PeopleFounderNFT(owner, signer, mintDeadline);
    }

    // ------------------------------------------------------------------ helpers

    function _deadline() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _mintSig(uint256 pk, bytes32 personId, address to, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, nft.mintDigest(personId, to, nonce, deadline));
    }

    function _rebindSig(
        uint256 pk,
        bytes32 personId,
        address oldHolder,
        address newHolder,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        return _sign(pk, nft.rebindDigest(personId, oldHolder, newHolder, nonce, deadline));
    }

    /// @dev Backend-signed mint, submitted by `to`.
    function _mintFor(bytes32 personId, address to) internal returns (uint256 tokenId) {
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, personId, to, nonce, deadline);
        vm.prank(to);
        nft.mint(personId, to, nonce, deadline, sig);
        return nft.tokenOfPerson(personId);
    }

    /// @dev Backend-signed rebind request, submitted by `newHolder` (step 1 only).
    function _requestRebind(bytes32 personId, address oldHolder, address newHolder) internal {
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, personId, oldHolder, newHolder, nonce, deadline);
        vm.prank(newHolder);
        nft.requestRebind(personId, oldHolder, newHolder, nonce, deadline, sig);
    }

    /// @dev Full rebind: request, wait out the delay, execute.
    function _rebind(bytes32 personId, address oldHolder, address newHolder) internal {
        _requestRebind(personId, oldHolder, newHolder);
        vm.warp(block.timestamp + nft.REBIND_DELAY());
        vm.prank(newHolder);
        nft.executeRebind(personId);
    }

    // ------------------------------------------------------------------ constructor

    function test_constructor_setsImmutables() public view {
        assertEq(nft.owner(), owner);
        assertEq(nft.signer(), signer);
        assertEq(nft.signerEpoch(), 0);
        assertEq(nft.REBIND_DELAY(), 72 hours);
        assertEq(nft.mintDeadline(), mintDeadline);
        assertEq(nft.name(), "People Founder");
        assertEq(nft.symbol(), "PFOUNDER");
        assertEq(nft.totalMinted(), 0);
        assertEq(nft.totalSupply(), 0);
    }

    function test_constructor_revertsOnZeroSigner() public {
        vm.expectRevert(PeopleFounderNFT.ZeroSigner.selector);
        new PeopleFounderNFT(owner, address(0), block.timestamp + 1 days);
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new PeopleFounderNFT(address(0), signer, block.timestamp + 1 days);
    }

    function test_constructor_revertsOnPastOrCurrentDeadline() public {
        vm.expectRevert(PeopleFounderNFT.InvalidMintDeadline.selector);
        new PeopleFounderNFT(owner, signer, block.timestamp);
        vm.expectRevert(PeopleFounderNFT.InvalidMintDeadline.selector);
        new PeopleFounderNFT(owner, signer, block.timestamp - 1);
    }

    // ------------------------------------------------------------------ mint

    function test_mint_verifiedPersonSucceeds() public {
        uint256 nonce = 7;
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, P1, alice, nonce, deadline);

        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(0), alice, 1);
        vm.expectEmit(false, false, false, true, address(nft));
        emit Locked(1);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Minted(P1, 1, alice);
        vm.prank(alice);
        nft.mint(P1, alice, nonce, deadline, sig);

        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.balanceOf(alice), 1);
        assertEq(nft.tokenOfPerson(P1), 1);
        assertEq(nft.personOf(1), P1);
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.totalSupply(), 1);
        assertTrue(nft.usedNonces(P1, nonce));
    }

    function test_mint_numbersAreSequential() public {
        assertEq(_mintFor(P1, alice), 1);
        assertEq(_mintFor(P2, bob), 2);
        assertEq(_mintFor(P3, carol), 3);
        assertEq(nft.totalMinted(), 3);
        assertEq(nft.totalSupply(), 3);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(2), bob);
        assertEq(nft.ownerOf(3), carol);
    }

    function test_mint_samePersonFromAnotherAddressReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, P1, bob, nonce, deadline);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.PersonAlreadyMinted.selector);
        nft.mint(P1, bob, nonce, deadline, sig);
    }

    function test_mint_sameAddressWithAnotherPersonReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, P2, alice, nonce, deadline);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.AddressAlreadyHolder.selector);
        nft.mint(P2, alice, nonce, deadline, sig);
    }

    function test_mint_emptySignatureReverts() public {
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P1, alice, 1, _deadline(), "");
    }

    function test_mint_garbageSignatureReverts() public {
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P1, alice, 1, _deadline(), new bytes(65));
    }

    function test_mint_wrongSignerReverts() public {
        // An unverified user is never signed for by the real backend; any other key must fail.
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(rogueSignerPk, P1, alice, 1, deadline);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P1, alice, 1, deadline, sig);
    }

    function test_mint_signatureBoundToParameters() public {
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, P1, alice, 1, deadline);

        // different personId
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P2, alice, 1, deadline, sig);
        // different nonce
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P1, alice, 2, deadline, sig);
        // different deadline
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P1, alice, 1, deadline + 1, sig);
    }

    function test_mint_replayReverts() public {
        uint256 nonce = 5;
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, P1, alice, nonce, deadline);
        vm.prank(alice);
        nft.mint(P1, alice, nonce, deadline, sig);

        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.NonceUsed.selector);
        nft.mint(P1, alice, nonce, deadline, sig);
    }

    function test_mint_expiredDeadlineReverts() public {
        uint256 deadline = block.timestamp + 10;
        bytes memory sig = _mintSig(signerPk, P1, alice, 1, deadline);
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.Expired.selector);
        nft.mint(P1, alice, 1, deadline, sig);
    }

    function test_mint_atExactDeadlineSucceeds() public {
        uint256 deadline = block.timestamp + 10;
        bytes memory sig = _mintSig(signerPk, P1, alice, 1, deadline);
        vm.warp(deadline);
        vm.prank(alice);
        nft.mint(P1, alice, 1, deadline, sig);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_mint_windowClosedReverts() public {
        uint256 deadline = mintDeadline + 1 days;
        bytes memory sig = _mintSig(signerPk, P1, alice, 1, deadline);
        vm.warp(mintDeadline + 1);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.MintWindowClosed.selector);
        nft.mint(P1, alice, 1, deadline, sig);
    }

    function test_mint_atExactWindowEndSucceeds() public {
        uint256 deadline = mintDeadline + 1 days;
        bytes memory sig = _mintSig(signerPk, P1, alice, 1, deadline);
        vm.warp(mintDeadline);
        vm.prank(alice);
        nft.mint(P1, alice, 1, deadline, sig);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_mint_chainIdMismatchReverts() public {
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, P1, alice, 1, deadline); // signed for the original chain id
        vm.chainId(block.chainid + 1);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P1, alice, 1, deadline, sig);
    }

    function test_mint_otherContractDomainReverts() public {
        // A signature for a different deployment (different verifyingContract) is not valid here.
        PeopleFounderNFT other = new PeopleFounderNFT(owner, signer, mintDeadline);
        uint256 deadline = _deadline();
        bytes memory sig = _sign(signerPk, other.mintDigest(P1, alice, 1, deadline));
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P1, alice, 1, deadline, sig);
    }

    function test_mint_callerMustBeRecipient() public {
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, P1, alice, 1, deadline);
        // front-runner tries to land alice's authorisation (or any) from another account
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.NotRecipient.selector);
        nft.mint(P1, alice, 1, deadline, sig);
    }

    function test_mint_zeroPersonIdReverts() public {
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, bytes32(0), alice, 1, deadline);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidPersonId.selector);
        nft.mint(bytes32(0), alice, 1, deadline, sig);
    }

    function test_mint_failedAttemptDoesNotBurnNonce() public {
        uint256 deadline = _deadline();
        bytes memory bad = _mintSig(rogueSignerPk, P1, alice, 1, deadline);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P1, alice, 1, deadline, bad);
        assertFalse(nft.usedNonces(P1, 1));

        bytes memory good = _mintSig(signerPk, P1, alice, 1, deadline);
        vm.prank(alice);
        nft.mint(P1, alice, 1, deadline, good);
        assertEq(nft.ownerOf(1), alice);
    }

    // ------------------------------------------------------------------ soulbound / ERC-5192

    function test_locked_trueAndInterface() public {
        _mintFor(P1, alice);
        assertTrue(nft.locked(1));
        assertTrue(nft.supportsInterface(0xb45a3c0e));
        assertEq(type(IERC5192).interfaceId, bytes4(0xb45a3c0e));
        assertTrue(nft.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(nft.supportsInterface(type(IERC721).interfaceId));
        assertTrue(nft.supportsInterface(type(IERC721Metadata).interfaceId));
        assertTrue(nft.supportsInterface(0x01ffc9a7)); // ERC-165
        assertFalse(nft.supportsInterface(0xffffffff));
    }

    function test_locked_nonexistentTokenReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        nft.locked(1);
    }

    function test_transferFrom_reverts() public {
        _mintFor(P1, alice);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.Soulbound.selector);
        nft.transferFrom(alice, bob, 1);
    }

    function test_safeTransferFrom_reverts() public {
        _mintFor(P1, alice);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.Soulbound.selector);
        nft.safeTransferFrom(alice, bob, 1);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.Soulbound.selector);
        nft.safeTransferFrom(alice, bob, 1, "");
    }

    function test_approve_reverts() public {
        _mintFor(P1, alice);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.Soulbound.selector);
        nft.approve(bob, 1);
    }

    function test_setApprovalForAll_reverts() public {
        _mintFor(P1, alice);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.Soulbound.selector);
        nft.setApprovalForAll(bob, true);
    }

    function test_transfer_revertsEvenForNonHolderCaller() public {
        _mintFor(P1, alice);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.Soulbound.selector);
        nft.transferFrom(alice, bob, 1);
        assertEq(nft.ownerOf(1), alice);
    }

    // ------------------------------------------------------------------ metadata

    function test_tokenURI_containsNumber() public {
        _mintFor(P1, alice);
        _mintFor(P2, bob);
        _assertTokenUriName(1, "People Founder #1");
        _assertTokenUriName(2, "People Founder #2");
    }

    function test_tokenURI_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 9));
        nft.tokenURI(9);
    }

    function _assertTokenUriName(uint256 tokenId, string memory expectedName) internal view {
        string memory uri = nft.tokenURI(tokenId);
        string memory prefix = "data:application/json;base64,";
        bytes memory uriBytes = bytes(uri);
        assertGt(uriBytes.length, bytes(prefix).length);
        for (uint256 i = 0; i < bytes(prefix).length; i++) {
            assertEq(uriBytes[i], bytes(prefix)[i]);
        }
        bytes memory b64 = new bytes(uriBytes.length - bytes(prefix).length);
        for (uint256 i = 0; i < b64.length; i++) {
            b64[i] = uriBytes[bytes(prefix).length + i];
        }
        string memory json = string(_base64Decode(b64));
        assertEq(vm.parseJsonString(json, ".name"), expectedName);
        string memory image = vm.parseJsonString(json, ".image");
        assertGt(bytes(image).length, 0);
    }

    function _base64Decode(bytes memory data) internal pure returns (bytes memory out) {
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint8[256] memory rev;
        for (uint256 i = 0; i < 64; i++) {
            rev[uint8(table[i])] = uint8(i);
        }
        uint256 len = data.length;
        uint256 pad = 0;
        if (len > 0 && data[len - 1] == "=") pad++;
        if (len > 1 && data[len - 2] == "=") pad++;
        out = new bytes((len / 4) * 3 - pad);
        uint256 o = 0;
        for (uint256 i = 0; i < len; i += 4) {
            uint256 n = (uint256(rev[uint8(data[i])]) << 18) | (uint256(rev[uint8(data[i + 1])]) << 12)
                | (uint256(rev[uint8(data[i + 2])]) << 6) | uint256(rev[uint8(data[i + 3])]);
            if (o < out.length) out[o++] = bytes1(uint8(n >> 16));
            if (o < out.length) out[o++] = bytes1(uint8(n >> 8));
            if (o < out.length) out[o++] = bytes1(uint8(n));
        }
    }

    // ------------------------------------------------------------------ views

    function test_views_unknownPersonAndToken() public view {
        assertEq(nft.tokenOfPerson(P1), 0);
        assertEq(nft.personOf(1), bytes32(0));
    }

    // ------------------------------------------------------------------ rebind

    function test_rebind_success() public {
        _mintFor(P1, alice);
        _mintFor(P2, bob);
        uint256 mintedBefore = nft.totalMinted();
        uint256 supplyBefore = nft.totalSupply();

        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, alice, carol, nonce, deadline);

        vm.expectEmit(true, true, false, true, address(nft));
        emit RebindRequested(P1, 1, alice, carol, block.timestamp + 72 hours);
        vm.prank(carol);
        nft.requestRebind(P1, alice, carol, nonce, deadline, sig);
        // nothing moves at request time
        assertEq(nft.ownerOf(1), alice);
        (address pOld, uint64 pAfter, address pNew, uint64 pEpoch) = nft.pendingRebinds(P1);
        assertEq(pOld, alice);
        assertEq(pNew, carol);
        assertEq(pAfter, block.timestamp + 72 hours);
        assertEq(pEpoch, 0);

        vm.warp(block.timestamp + 72 hours);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(alice, address(0), 1);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(0), carol, 1);
        vm.expectEmit(false, false, false, true, address(nft));
        emit Locked(1);
        vm.expectEmit(true, true, false, true, address(nft));
        emit Rebound(P1, 1, alice, carol);
        vm.prank(carol);
        nft.executeRebind(P1);
        (, uint64 clearedAfter,,) = nft.pendingRebinds(P1);
        assertEq(clearedAfter, 0);

        // old holder lost the token, same number now on the new holder
        assertEq(nft.balanceOf(alice), 0);
        assertEq(nft.ownerOf(1), carol);
        assertEq(nft.balanceOf(carol), 1);
        assertEq(nft.tokenOfPerson(P1), 1);
        assertEq(nft.personOf(1), P1);
        assertTrue(nft.locked(1));
        // issuance counters unchanged
        assertEq(nft.totalMinted(), mintedBefore);
        assertEq(nft.totalSupply(), supplyBefore);
        assertTrue(nft.usedNonces(P1, nonce));
        // untouched token stays put
        assertEq(nft.ownerOf(2), bob);

        // the next mint gets the next number, not a reused/shifted one
        assertEq(_mintFor(P3, dave), 3);
        assertEq(nft.totalMinted(), 3);
        assertEq(nft.totalSupply(), 3);
    }

    function test_rebind_oldHolderCanNoLongerAct() public {
        _mintFor(P1, alice);
        _rebind(P1, alice, carol);

        // alice holds nothing: she cannot transfer, and a second rebind from her address has no token
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.Soulbound.selector);
        nft.transferFrom(alice, bob, 1);

        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, alice, bob, nonce, deadline);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.OldHolderHasNoToken.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
    }

    function test_rebind_oldHolderCanMintAgainOnlyWithNewPerson() public {
        // after rebinding away, the freed address may hold a token of another person
        _mintFor(P1, alice);
        _rebind(P1, alice, carol);
        assertEq(_mintFor(P2, alice), 2);
        assertEq(nft.ownerOf(2), alice);
        assertEq(nft.ownerOf(1), carol);
    }

    function test_rebind_chainOfRebinds() public {
        _mintFor(P1, alice);
        _rebind(P1, alice, bob);
        _rebind(P1, bob, carol);
        assertEq(nft.ownerOf(1), carol);
        assertEq(nft.balanceOf(alice), 0);
        assertEq(nft.balanceOf(bob), 0);
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.totalSupply(), 1);
    }

    function test_rebind_replayReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, alice, bob, nonce, deadline);
        vm.prank(bob);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);

        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.NonceUsed.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
    }

    function test_rebind_replayCannotMoveTokenBack() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = block.timestamp + 30 days; // outlives both delays, so the replay hits the nonce
        bytes memory sig = _rebindSig(signerPk, P1, alice, bob, nonce, deadline);
        vm.prank(bob);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(bob);
        nft.executeRebind(P1);
        _rebind(P1, bob, carol);

        // bob replays the old signature after the token moved on: nonce is consumed
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.NonceUsed.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
        assertEq(nft.ownerOf(1), carol);
    }

    function test_rebind_mintNonceCannotBeReused() public {
        uint256 nonce = 3;
        uint256 deadline = _deadline();
        bytes memory mintSig = _mintSig(signerPk, P1, alice, nonce, deadline);
        vm.prank(alice);
        nft.mint(P1, alice, nonce, deadline, mintSig);

        // same personId, same nonce: shared nonce space
        bytes memory sig = _rebindSig(signerPk, P1, alice, bob, nonce, deadline);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.NonceUsed.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
    }

    function test_rebind_mintSignatureIsNotARebindSignature() public {
        _mintFor(P1, alice);
        uint256 nonce = 99;
        uint256 deadline = _deadline();
        // Sign the Mint typehash digest, try to present it for a rebind: different typehash -> invalid.
        bytes memory sig = _mintSig(signerPk, P1, bob, nonce, deadline);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
    }

    function test_rebind_wrongPersonIdReverts() public {
        _mintFor(P1, alice);
        _mintFor(P2, bob);
        // alice's token belongs to P1, but the (valid) signature claims P2
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P2, alice, carol, nonce, deadline);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.PersonMismatch.selector);
        nft.requestRebind(P2, alice, carol, nonce, deadline, sig);
    }

    function test_rebind_unknownPersonIdReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P4, alice, carol, nonce, deadline);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.PersonMismatch.selector);
        nft.requestRebind(P4, alice, carol, nonce, deadline, sig);
    }

    function test_rebind_newHolderAlreadyHoldsReverts() public {
        _mintFor(P1, alice);
        _mintFor(P2, bob);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, alice, bob, nonce, deadline);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.AddressAlreadyHolder.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(2), bob);
    }

    function test_rebind_toSameAddressReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, alice, alice, nonce, deadline);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.AddressAlreadyHolder.selector);
        nft.requestRebind(P1, alice, alice, nonce, deadline, sig);
    }

    function test_rebind_oldHolderWithoutTokenReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, dave, carol, nonce, deadline);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.OldHolderHasNoToken.selector);
        nft.requestRebind(P1, dave, carol, nonce, deadline, sig);
    }

    function test_rebind_oldHolderZeroAddressReverts() public {
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, address(0), carol, nonce, deadline);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.OldHolderHasNoToken.selector);
        nft.requestRebind(P1, address(0), carol, nonce, deadline, sig);
    }

    function test_rebind_expiredReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = block.timestamp + 10;
        bytes memory sig = _rebindSig(signerPk, P1, alice, bob, nonce, deadline);
        vm.warp(deadline + 1);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.Expired.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
    }

    function test_rebind_callerMustBeNewHolder() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, alice, bob, nonce, deadline);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.NotRecipient.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
        // the old holder cannot push the token out either
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.NotRecipient.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
    }

    function test_rebind_wrongSignerReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(rogueSignerPk, P1, alice, bob, nonce, deadline);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
    }

    function test_rebind_zeroNewHolderReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, alice, address(0), nonce, deadline);
        vm.prank(address(0));
        vm.expectRevert(PeopleFounderNFT.ZeroAddress.selector);
        nft.requestRebind(P1, alice, address(0), nonce, deadline, sig);
    }

    function test_rebind_chainIdMismatchReverts() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, alice, bob, nonce, deadline);
        vm.chainId(block.chainid + 1);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.requestRebind(P1, alice, bob, nonce, deadline, sig);
    }

    function test_rebind_allowedAfterMintWindowCloses() public {
        _mintFor(P1, alice);
        vm.warp(mintDeadline + 365 days);

        // new issuance is closed ...
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory mintSig = _mintSig(signerPk, P2, bob, 1000, deadline);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.MintWindowClosed.selector);
        nft.mint(P2, bob, 1000, deadline, mintSig);

        // ... but moving an existing token is not issuance and still works
        _rebind(P1, alice, carol);
        assertEq(nft.ownerOf(1), carol);
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.totalSupply(), 1);
    }

    function test_rebind_transferStaysBlockedAfterRebind() public {
        _mintFor(P1, alice);
        _rebind(P1, alice, carol);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.Soulbound.selector);
        nft.transferFrom(carol, dave, 1);
        assertTrue(nft.locked(1));
    }

    // ------------------------------------------------------------------ signer administration

    function test_setSigner_ownerRotates() public {
        address newSigner = vm.addr(rogueSignerPk);
        vm.expectEmit(true, true, false, true, address(nft));
        emit SignerUpdated(signer, newSigner, 1);
        vm.prank(owner);
        nft.setSigner(newSigner);
        assertEq(nft.signer(), newSigner);
        assertEq(nft.signerEpoch(), 1);

        // the new key mints, the old one no longer does
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(rogueSignerPk, P1, alice, 1, deadline);
        vm.prank(alice);
        nft.mint(P1, alice, 1, deadline, sig);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_setSigner_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.setSigner(alice);
        // the signer itself has no admin power either
        vm.prank(signer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, signer));
        nft.setSigner(alice);
        assertEq(nft.signer(), signer);
    }

    function test_setSigner_zeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(PeopleFounderNFT.ZeroSigner.selector);
        nft.setSigner(address(0));
    }

    function test_revokeSigner_disablesMintAndRebind() public {
        _mintFor(P1, alice);
        vm.expectEmit(true, false, false, true, address(nft));
        emit SignerRevoked(signer, 1);
        vm.prank(owner);
        nft.revokeSigner();
        assertEq(nft.signer(), address(0));
        assertEq(nft.signerEpoch(), 1);

        uint256 deadline = _deadline();
        bytes memory mintSig = _mintSig(signerPk, P2, bob, 50, deadline);
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.SignerDisabled.selector);
        nft.mint(P2, bob, 50, deadline, mintSig);

        bytes memory rebindSig = _rebindSig(signerPk, P1, alice, carol, 51, deadline);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.SignerDisabled.selector);
        nft.requestRebind(P1, alice, carol, 51, deadline, rebindSig);

        // a garbage signature cannot recover to address(0) and slip through either
        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.SignerDisabled.selector);
        nft.mint(P2, bob, 52, deadline, "");

        // re-enabling restores minting
        vm.prank(owner);
        nft.setSigner(signer);
        vm.prank(bob);
        nft.mint(P2, bob, 50, deadline, mintSig);
        assertEq(nft.ownerOf(2), bob);
    }

    function test_revokeSigner_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.revokeSigner();
        assertEq(nft.signer(), signer);
    }

    function test_rotation_rejectsIssuedButUnusedSignatures() public {
        _mintFor(P1, alice);
        // signatures issued by the old key before rotation, never submitted
        uint256 deadline = _deadline();
        bytes memory mintSig = _mintSig(signerPk, P2, bob, 60, deadline);
        bytes memory rebindSig = _rebindSig(signerPk, P1, alice, carol, 61, deadline);

        vm.prank(owner);
        nft.setSigner(vm.addr(rogueSignerPk));

        vm.prank(bob);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(P2, bob, 60, deadline, mintSig);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.requestRebind(P1, alice, carol, 61, deadline, rebindSig);
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_rotation_invalidatesPendingRebind() public {
        _mintFor(P1, alice);
        _requestRebind(P1, alice, carol); // requested under the (now leaked) old key
        vm.prank(owner);
        nft.setSigner(vm.addr(rogueSignerPk));

        vm.warp(block.timestamp + 72 hours);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.StaleRebind.selector);
        nft.executeRebind(P1);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_revoke_blocksPendingRebindExecution() public {
        _mintFor(P1, alice);
        _requestRebind(P1, alice, carol);
        vm.prank(owner);
        nft.revokeSigner();
        vm.warp(block.timestamp + 72 hours);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.SignerDisabled.selector);
        nft.executeRebind(P1);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_ownership_twoStepTransfer() public {
        address newOwner = makeAddr("new-safe");
        vm.prank(owner);
        nft.transferOwnership(newOwner);
        assertEq(nft.owner(), owner);
        assertEq(nft.pendingOwner(), newOwner);
        vm.prank(newOwner);
        nft.acceptOwnership();
        assertEq(nft.owner(), newOwner);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        nft.revokeSigner();
    }

    // ------------------------------------------------------------------ rebind timelock

    function test_executeRebind_beforeDelayReverts() public {
        _mintFor(P1, alice);
        uint256 t = block.timestamp;
        _requestRebind(P1, alice, carol);

        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.RebindDelayActive.selector);
        nft.executeRebind(P1);

        vm.warp(t + 72 hours - 1);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.RebindDelayActive.selector);
        nft.executeRebind(P1);
        assertEq(nft.ownerOf(1), alice);

        // exactly t + 72h is executable
        vm.warp(t + 72 hours);
        vm.prank(carol);
        nft.executeRebind(P1);
        assertEq(nft.ownerOf(1), carol);
    }

    function test_executeRebind_onlyNewHolder() public {
        _mintFor(P1, alice);
        _requestRebind(P1, alice, carol);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(dave);
        vm.expectRevert(PeopleFounderNFT.NotRecipient.selector);
        nft.executeRebind(P1);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.NotRecipient.selector);
        nft.executeRebind(P1);
    }

    function test_executeRebind_withoutRequestReverts() public {
        _mintFor(P1, alice);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.NoPendingRebind.selector);
        nft.executeRebind(P1);
    }

    function test_executeRebind_cannotRunTwice() public {
        _mintFor(P1, alice);
        _rebind(P1, alice, carol);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.NoPendingRebind.selector);
        nft.executeRebind(P1);
    }

    function test_executeRebind_newHolderGainedTokenMeanwhileReverts() public {
        _mintFor(P1, alice);
        _requestRebind(P1, alice, carol);
        _mintFor(P2, carol); // carol picked up her own token during the delay
        vm.warp(block.timestamp + 72 hours);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.AddressAlreadyHolder.selector);
        nft.executeRebind(P1);
    }

    function test_cancelRebind_byCurrentHolder() public {
        _mintFor(P1, alice);
        _requestRebind(P1, alice, carol);
        vm.warp(block.timestamp + 72 hours - 1);

        vm.expectEmit(true, true, true, true, address(nft));
        emit RebindCancelled(P1, 1, alice);
        vm.prank(alice);
        nft.cancelRebind(P1);

        vm.warp(block.timestamp + 1 days);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.NoPendingRebind.selector);
        nft.executeRebind(P1);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_cancelRebind_notByOthers() public {
        _mintFor(P1, alice);
        _mintFor(P2, bob);
        _requestRebind(P1, alice, carol);

        // neither the requester, another holder, the owner nor the signer can cancel
        address[4] memory others = [carol, bob, owner, signer];
        for (uint256 i; i < others.length; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(PeopleFounderNFT.NotHolder.selector);
            nft.cancelRebind(P1);
        }
        (, uint64 executeAfter,,) = nft.pendingRebinds(P1);
        assertGt(executeAfter, 0);
    }

    function test_cancelRebind_afterDelayReverts() public {
        _mintFor(P1, alice);
        _requestRebind(P1, alice, carol);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.RebindDelayElapsed.selector);
        nft.cancelRebind(P1);
    }

    function test_cancelRebind_withoutRequestReverts() public {
        _mintFor(P1, alice);
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.NoPendingRebind.selector);
        nft.cancelRebind(P1);
    }

    function test_cancelledRebind_signatureCannotBeReplayed() public {
        _mintFor(P1, alice);
        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _rebindSig(signerPk, P1, alice, carol, nonce, deadline);
        vm.prank(carol);
        nft.requestRebind(P1, alice, carol, nonce, deadline, sig);
        vm.prank(alice);
        nft.cancelRebind(P1);

        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.NonceUsed.selector);
        nft.requestRebind(P1, alice, carol, nonce, deadline, sig);
    }

    function test_requestRebind_newRequestReplacesPendingAndRestartsDelay() public {
        _mintFor(P1, alice);
        _requestRebind(P1, alice, carol);
        vm.warp(block.timestamp + 48 hours);
        uint256 t2 = block.timestamp;
        _requestRebind(P1, alice, dave);

        vm.warp(t2 + 72 hours - 1);
        vm.prank(dave);
        vm.expectRevert(PeopleFounderNFT.RebindDelayActive.selector);
        nft.executeRebind(P1);
        vm.prank(carol);
        vm.expectRevert(PeopleFounderNFT.NotRecipient.selector);
        nft.executeRebind(P1);

        vm.warp(t2 + 72 hours);
        vm.prank(dave);
        nft.executeRebind(P1);
        assertEq(nft.ownerOf(1), dave);
    }

    function test_rebind_tokenStaysLockedWhilePending() public {
        _mintFor(P1, alice);
        _requestRebind(P1, alice, carol);
        assertTrue(nft.locked(1));
        vm.prank(alice);
        vm.expectRevert(PeopleFounderNFT.Soulbound.selector);
        nft.transferFrom(alice, carol, 1);
    }

    // ------------------------------------------------------------------ fuzz

    /// @dev Two mints succeed iff both the personId and the address differ.
    function testFuzz_mint_oneTokenPerPersonAndAddress(bytes32 p1, bytes32 p2, address a1, address a2) public {
        vm.assume(p1 != bytes32(0) && p2 != bytes32(0));
        vm.assume(a1 != address(0) && a2 != address(0));

        _mintFor(p1, a1);

        uint256 nonce = nextNonce++;
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(signerPk, p2, a2, nonce, deadline);
        vm.prank(a2);
        if (p1 == p2) {
            vm.expectRevert(PeopleFounderNFT.PersonAlreadyMinted.selector);
        } else if (a1 == a2) {
            vm.expectRevert(PeopleFounderNFT.AddressAlreadyHolder.selector);
        }
        nft.mint(p2, a2, nonce, deadline, sig);

        bool second = p1 != p2 && a1 != a2;
        assertEq(nft.totalMinted(), second ? 2 : 1);
        assertEq(nft.balanceOf(a1), 1);
        if (second) {
            assertEq(nft.tokenOfPerson(p2), 2);
            assertEq(nft.balanceOf(a2), 1);
        } else {
            assertEq(nft.tokenOfPerson(p2), p1 == p2 ? 1 : 0);
        }
    }

    /// @dev A signature from any key other than `signer` never mints.
    function testFuzz_mint_wrongSignerNeverMints(uint256 pk, bytes32 personId, address to) public {
        pk = bound(pk, 1, 115792089237316195423570985008687907852837564279074904382605163141518161494336);
        vm.assume(pk != signerPk);
        vm.assume(personId != bytes32(0) && to != address(0));
        uint256 deadline = _deadline();
        bytes memory sig = _mintSig(pk, personId, to, 1, deadline);
        vm.prank(to);
        vm.expectRevert(PeopleFounderNFT.InvalidSignature.selector);
        nft.mint(personId, to, 1, deadline, sig);
        assertEq(nft.totalMinted(), 0);
    }

    /// @dev Rebind never changes issuance counters, keeps the id, and keeps one token per address.
    function testFuzz_rebind_keepsIdAndCounters(bytes32 personId, address oldHolder, address newHolder) public {
        vm.assume(personId != bytes32(0));
        vm.assume(oldHolder != address(0) && newHolder != address(0) && oldHolder != newHolder);

        _mintFor(personId, oldHolder);
        _rebind(personId, oldHolder, newHolder);

        assertEq(nft.ownerOf(1), newHolder);
        assertEq(nft.balanceOf(oldHolder), 0);
        assertEq(nft.balanceOf(newHolder), 1);
        assertEq(nft.tokenOfPerson(personId), 1);
        assertEq(nft.personOf(1), personId);
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.totalSupply(), 1);
    }
}
