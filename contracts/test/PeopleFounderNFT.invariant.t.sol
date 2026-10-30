// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PeopleFounderNFT} from "../src/nft/PeopleFounderNFT.sol";

/// @dev Drives random, backend-signed mint and (request + delayed execute) rebind calls (successful and failing) against the NFT.
contract FounderNFTHandler is Test {
    PeopleFounderNFT public immutable nft;
    uint256 internal immutable signerPk;

    address[] public actors;
    bytes32[] public people;

    uint256 internal nonce = 1;
    uint256 public ghostMinted;
    uint256 public ghostRebinds;
    uint256 public ghostRejected;

    constructor(PeopleFounderNFT nft_, uint256 signerPk_) {
        nft = nft_;
        signerPk = signerPk_;
        for (uint256 i = 0; i < 6; i++) {
            actors.push(vm.addr(uint256(keccak256(abi.encode("founder-actor", i)))));
        }
        for (uint256 i = 0; i < 5; i++) {
            people.push(keccak256(abi.encode("founder-person", i)));
        }
    }

    function peopleLength() external view returns (uint256) {
        return people.length;
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function mint(uint256 actorSeed, uint256 personSeed) external {
        address to = actors[actorSeed % actors.length];
        bytes32 personId = people[personSeed % people.length];
        uint256 n = nonce++;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(nft.mintDigest(personId, to, n, deadline));
        vm.prank(to);
        try nft.mint(personId, to, n, deadline, sig) {
            ghostMinted++;
        } catch {
            ghostRejected++;
        }
    }

    function rebind(uint256 personSeed, uint256 newHolderSeed, uint256 fallbackOldSeed) external {
        bytes32 personId = people[personSeed % people.length];
        address newHolder = actors[newHolderSeed % actors.length];
        uint256 tokenId = nft.tokenOfPerson(personId);
        // Mostly target the true holder; sometimes a random actor to exercise the failure paths.
        address oldHolder =
            tokenId != 0 && fallbackOldSeed % 4 != 0 ? nft.ownerOf(tokenId) : actors[fallbackOldSeed % actors.length];
        uint256 n = nonce++;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(nft.rebindDigest(personId, oldHolder, newHolder, n, deadline));
        vm.prank(newHolder);
        try nft.requestRebind(personId, oldHolder, newHolder, n, deadline, sig) {}
        catch {
            ghostRejected++;
            return;
        }
        // Wait out the timelock, then execute (step 2).
        vm.warp(block.timestamp + nft.REBIND_DELAY());
        vm.prank(newHolder);
        nft.executeRebind(personId);
        ghostRebinds++;
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 2 hours));
    }

    function _sign(bytes32 digest) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }
}

contract PeopleFounderNFTInvariantTest is Test {
    PeopleFounderNFT internal nft;
    FounderNFTHandler internal handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        uint256 signerPk = uint256(keccak256("people-founder-nft.invariant.signer"));
        nft = new PeopleFounderNFT(address(this), vm.addr(signerPk), block.timestamp + 365 days);
        handler = new FounderNFTHandler(nft, signerPk);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = FounderNFTHandler.mint.selector;
        selectors[1] = FounderNFTHandler.rebind.selector;
        selectors[2] = FounderNFTHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// Sanity check that the handler really exercises both the success and the rejection paths.
    function test_handlerReachesSuccessAndRejection() public {
        handler.mint(0, 0); // actor 0 <- person 0: ok
        handler.mint(1, 0); // person 0 again: rejected
        handler.mint(0, 1); // actor 0 again: rejected
        handler.rebind(0, 2, 1); // true holder -> actor 2: ok
        handler.rebind(1, 3, 0); // person 1 has no token: rejected
        assertEq(handler.ghostMinted(), 1);
        assertEq(handler.ghostRebinds(), 1);
        assertEq(handler.ghostRejected(), 3);
        assertEq(nft.ownerOf(1), handler.actors(2));
        assertEq(nft.totalSupply(), 1);
    }

    /// Exactly one token per personId: personId -> token -> personId round-trips, and the number of
    /// personIds that hold a token equals the number of ids issued.
    function invariant_exactlyOneTokenPerPerson() public view {
        uint256 withToken;
        for (uint256 i = 0; i < handler.peopleLength(); i++) {
            bytes32 personId = handler.people(i);
            uint256 tokenId = nft.tokenOfPerson(personId);
            if (tokenId == 0) continue;
            withToken++;
            assertEq(nft.personOf(tokenId), personId, "personOf round-trip");
            assertTrue(nft.ownerOf(tokenId) != address(0), "token has an owner");
            assertLe(tokenId, nft.totalMinted(), "id within issued range");
        }
        assertEq(withToken, nft.totalMinted(), "one id per person");
    }

    /// At most one token per address, and the balances add up to the supply.
    function invariant_atMostOneTokenPerAddress() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorsLength(); i++) {
            uint256 bal = nft.balanceOf(handler.actors(i));
            assertLe(bal, 1, "max one token per address");
            sum += bal;
        }
        assertEq(sum, nft.totalSupply(), "balances sum to supply");
    }

    /// Rebind never creates or destroys supply; only successful mints do.
    function invariant_supplyEqualsSuccessfulMints() public view {
        assertEq(nft.totalMinted(), handler.ghostMinted());
        assertEq(nft.totalSupply(), handler.ghostMinted());
    }

    /// Ids are 1..totalMinted with no gaps: each has an owner and a bound person.
    function invariant_idsAreDense() public view {
        uint256 minted = nft.totalMinted();
        for (uint256 id = 1; id <= minted; id++) {
            assertTrue(nft.ownerOf(id) != address(0));
            assertTrue(nft.personOf(id) != bytes32(0));
        }
        assertEq(nft.personOf(minted + 1), bytes32(0), "no id beyond totalMinted");
    }
}
