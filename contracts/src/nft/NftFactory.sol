// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PeopleNFT} from "./PeopleNFT.sol";
import {PeopleConstants} from "../PeopleConstants.sol";

/// @notice ERC-721 collection factory (non–memecoin project NFTs).
contract NftFactory is Ownable {
    event CollectionCreated(address indexed collection, address indexed creator, string name, string symbol);
    event NftMinted(address indexed collection, uint256 indexed tokenId, address indexed owner, string tokenURI);

    /// @dev AUD-H4: storage, not `immutable` — see `setFeeRecipient`.
    address public feeRecipient;
    address public immutable core;

    mapping(address => bool) public isCollection;
    mapping(address => address) public creatorOf;

    /// @notice C-01/S1-02: the only address allowed to call `creditPrepaidFee`.
    address public gateway;

    /// @notice C-01/S1-02: PPL a payer has prepaid via `StableFeeGateway` and not yet consumed by
    /// a `mint` call. Never withdrawable — only ever spent against this payer's own future mint
    /// fee — so no native PPL can leave this contract without an NFT being minted in the same
    /// transaction.
    mapping(address => uint256) public prepaidCredit;

    event FeeRecipientUpdated(address indexed feeRecipient);
    event GatewaySet(address indexed gateway);
    event PrepaidCreditAdded(address indexed payer, uint256 amount);

    error InsufficientFee();
    error Unauthorized();
    error ZeroFeeRecipient();
    error ZeroGateway();

    constructor(address feeRecipient_, address core_, address initialOwner_) Ownable(initialOwner_) {
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        feeRecipient = feeRecipient_;
        core = core_;
    }

    /// @notice AUD-H4: rotate the destination of the mint fee. It used to be `immutable`, so a
    /// recipient that stops accepting ETH would make `mint` revert forever.
    function setFeeRecipient(address feeRecipient_) external onlyOwner {
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        feeRecipient = feeRecipient_;
        emit FeeRecipientUpdated(feeRecipient_);
    }

    function mintFee() external pure returns (uint256) {
        return PeopleConstants.NFT_MINT_FEE;
    }

    /// @notice C-01/S1-02: rotate the trusted `StableFeeGateway`. Only this address may call
    /// `creditPrepaidFee`.
    function setGateway(address gateway_) external onlyOwner {
        if (gateway_ == address(0)) revert ZeroGateway();
        gateway = gateway_;
        emit GatewaySet(gateway_);
    }

    /// @notice C-01/S1-02: called by `StableFeeGateway` with the live PPL mint fee as
    /// `msg.value`, crediting `payer` for a future `mint` call instead of paying PPL out to the
    /// caller for free.
    function creditPrepaidFee(address payer) external payable {
        if (msg.sender != gateway) revert Unauthorized();
        prepaidCredit[payer] += msg.value;
        emit PrepaidCreditAdded(payer, msg.value);
    }

    function createCollection(string calldata name, string calldata symbol) external returns (address collection) {
        collection = address(new PeopleNFT(address(this), name, symbol));
        isCollection[collection] = true;
        creatorOf[collection] = msg.sender;
        emit CollectionCreated(collection, msg.sender, name, symbol);
    }

    function mint(address collection, string calldata tokenURI) external payable returns (uint256 tokenId) {
        if (!isCollection[collection]) revert Unauthorized();
        if (creatorOf[collection] != msg.sender) revert Unauthorized();

        uint256 fee = PeopleConstants.NFT_MINT_FEE;
        uint256 credit = prepaidCredit[msg.sender];
        uint256 fromCredit = credit < fee ? credit : fee;
        uint256 needed = fee - fromCredit;
        if (msg.value < needed) revert InsufficientFee();
        if (fromCredit > 0) prepaidCredit[msg.sender] = credit - fromCredit;

        (bool sent,) = feeRecipient.call{value: fee}("");
        require(sent, "fee");
        uint256 refund = msg.value - needed;
        if (refund > 0) {
            (bool refundOk,) = msg.sender.call{value: refund}("");
            require(refundOk, "refund");
        }
        tokenId = PeopleNFT(collection).mint(msg.sender, tokenURI);
        emit NftMinted(collection, tokenId, msg.sender, tokenURI);
    }
}
