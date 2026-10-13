// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract PeopleNFT is ERC721URIStorage {
    address public immutable factory;
    uint256 public nextTokenId;

    error OnlyFactory();

    constructor(address factory_, string memory name_, string memory symbol_) ERC721(name_, symbol_) {
        factory = factory_;
    }

    function mint(address to, string calldata tokenURI) external returns (uint256 tokenId) {
        if (msg.sender != factory) revert OnlyFactory();
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
    }
}
