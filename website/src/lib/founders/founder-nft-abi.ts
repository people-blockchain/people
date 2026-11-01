import { parseAbi } from "viem";

/** Subset of the PeopleFounderNFT ABI the website uses (contracts/src/nft/PeopleFounderNFT.sol). */
export const founderNftAbi = parseAbi([
  "function mint(bytes32 personId, address to, uint256 nonce, uint256 deadline, bytes signature)",
  "function requestRebind(bytes32 personId, address oldHolder, address newHolder, uint256 nonce, uint256 deadline, bytes signature)",
  "function cancelRebind(bytes32 personId)",
  "function executeRebind(bytes32 personId)",
  "function tokenOfPerson(bytes32 personId) view returns (uint256)",
  "function personOf(uint256 tokenId) view returns (bytes32)",
  "function pendingRebinds(bytes32 personId) view returns (address oldHolder, uint64 executeAfter, address newHolder, uint64 signerEpoch)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function mintDeadline() view returns (uint256)",
  "function signerEpoch() view returns (uint64)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "error Soulbound()",
  "error SignerDisabled()",
  "error MintWindowClosed()",
  "error Expired()",
  "error NotRecipient()",
  "error NonceUsed()",
  "error InvalidSignature()",
  "error PersonAlreadyMinted()",
  "error AddressAlreadyHolder()",
  "error OldHolderHasNoToken()",
  "error PersonMismatch()",
  "error NoPendingRebind()",
  "error NotHolder()",
  "error RebindDelayActive()",
  "error RebindDelayElapsed()",
  "error StaleRebind()",
]);

/** Seconds a rebind waits between request and execution (REBIND_DELAY in the contract). */
export const FOUNDER_NFT_REBIND_DELAY_SECONDS = 72 * 60 * 60;
