import { CHAIN_NAMESPACES } from "@web3auth/base";
import { readEvmRpcUrl } from "@/lib/evm/config";
import { PEOPLE_EIP155_CHAIN_ID } from "@/lib/wallet-address-scheme";

/**
 * Chain handed to Web3Auth's EthereumPrivateKeyProvider.
 *
 * The provider calls `net_version` on `rpcTarget` during connect and rejects the login when the
 * request fails. A third-party keyed RPC (Ankr) answers 401 for anonymous traffic, which
 * broke first-time sign-in. Web3Auth is only used here to derive the secp256k1 key, so the chain
 * is our own People EVM network and the RPC is the keyless People node
 * (override: NEXT_PUBLIC_EVM_RPC_URL). No API keys belong in this URL.
 */
export function buildWeb3AuthChainConfig(rpcTarget: string = readEvmRpcUrl()) {
  return {
    chainNamespace: CHAIN_NAMESPACES.EIP155,
    chainId: `0x${PEOPLE_EIP155_CHAIN_ID.toString(16)}`,
    rpcTarget,
    displayName: "PEOPLE Blockchain testnet",
    blockExplorerUrl: "https://www.peopleblockchain.network/explorer",
    ticker: "PPL",
    tickerName: "People",
  };
}
