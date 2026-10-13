#!/usr/bin/env node
/**
 * MetaMask-style signed native transfer via eth_sendRawTransaction.
 * Sender is DEPLOYER_PRIVATE_KEY (see local_node.sh mnemonics for the cosmos/evm testnet
 * dev0 key, which is the usual sender against a local devnet). OPS-M4: no silent default -
 * a well-known key must never be the implicit sender against a funded network.
 */
import { ethers } from "ethers";

const RPC = process.env.PEOPLE_EVM_RPC ?? "http://127.0.0.1:8545";
const CHAIN_ID = 97401;

if (!process.env.DEPLOYER_PRIVATE_KEY) {
  throw new Error("Set DEPLOYER_PRIVATE_KEY");
}
const DEV1 = "0x963EBDf2e1f8DB8707D05FC75bfeFFBa1B5BaC17";

const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

const network = await provider.getNetwork();
if (Number(network.chainId) !== CHAIN_ID) {
  throw new Error(`Unexpected chainId ${network.chainId}`);
}

const nonce = await provider.getTransactionCount(wallet.address);
const tx = await wallet.sendTransaction({
  to: DEV1,
  value: ethers.parseEther("0.001"),
  gasLimit: 21000n,
  chainId: CHAIN_ID,
});

const receipt = await tx.wait();
console.log(JSON.stringify({
  ok: true,
  hash: tx.hash,
  blockNumber: receipt?.blockNumber,
  from: wallet.address,
  to: DEV1,
}));
