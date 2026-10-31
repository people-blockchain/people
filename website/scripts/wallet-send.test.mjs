import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeFunctionData, encodeFunctionData } from "viem";

import {
  WalletSendError,
  confirmTransfer,
  erc20TransferAbi,
  erc20TransferArgs,
  humanAmountText,
  nftTransferAbi,
  nftTransferArgs,
  parseTokenAmount,
  sendErc20Transfer,
  sendNftTransfer,
  validateEvmTokenTransfer,
} from "../src/lib/evm/wallet-send.ts";
import { TxPreflightError } from "../src/lib/evm/tx-preflight.ts";

/**
 * ERC-20 / NFT sends on the EVM chain: calldata, decimals-aware amounts, ownership and balance
 * gates, the shared preflight (a doomed call is never sent) and receipt handling. Clients are
 * mocks: no network.
 */

const SENDER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x7777777777777777777777777777777777777777";
const COLLECTION = "0xead74edb323da357b1ea37180bb48bf1f7b4d582";
const HASH = `0x${"ab".repeat(32)}`;

function mockClients({ balance = 10n ** 18n, owner = SENDER, receipt = { status: "success" }, callError, waitError, replaced } = {}) {
  const log = { calls: [], estimates: [], writes: [], waits: [], reads: [] };
  const publicClient = {
    async readContract(args) {
      log.reads.push(args);
      if (args.functionName === "ownerOf") {
        if (owner === null) throw new Error("ERC721NonexistentToken");
        return owner;
      }
      return balance;
    },
    async call(req) {
      log.calls.push(req);
      if (callError) throw callError;
      return { data: "0x" };
    },
    async estimateGas(req) {
      log.estimates.push(req);
      return 50_000n;
    },
    async waitForTransactionReceipt(args) {
      log.waits.push(args);
      if (replaced) args.onReplaced(replaced);
      if (waitError) throw waitError;
      return receipt;
    },
  };
  const walletClient = {
    account: { address: SENDER },
    async writeContract(args) {
      log.writes.push(args);
      return HASH;
    },
  };
  return { clients: { publicClient, walletClient }, log };
}

const revertError = Object.assign(new Error("execution reverted: ERC20: transfer amount exceeds balance"), {
  name: "ContractFunctionRevertedError",
  reason: "ERC20: transfer amount exceeds balance",
});

test("transfer / safeTransferFrom calldata encodes the selector and word-padded arguments", () => {
  const erc20 = encodeFunctionData({ abi: erc20TransferAbi, functionName: "transfer", args: erc20TransferArgs(RECIPIENT, 1_000_000n) });
  assert.equal(erc20.slice(0, 10), "0xa9059cbb");
  assert.equal(erc20.slice(10), `${"0".repeat(24)}${RECIPIENT.slice(2)}${(1_000_000n).toString(16).padStart(64, "0")}`);
  const nft = encodeFunctionData({ abi: nftTransferAbi, functionName: "safeTransferFrom", args: nftTransferArgs(SENDER, RECIPIENT, 7n) });
  assert.equal(nft.slice(0, 10), "0x42842e0e");
  const decoded = decodeFunctionData({ abi: nftTransferAbi, data: nft });
  assert.equal(decoded.functionName, "safeTransferFrom");
  assert.deepEqual(decoded.args.map((a) => String(a).toLowerCase()), [SENDER, RECIPIENT, "7"]);
  assert.throws(() => erc20TransferArgs("nope", 1n), /invalid_address/);
  assert.throws(() => erc20TransferArgs(RECIPIENT, 0n), /invalid_amount/);
  assert.throws(() => nftTransferArgs(SENDER, "nope", 1n), /invalid_address/);
});

test("token amounts parse exactly by decimals and reject zero, excess precision and junk", () => {
  assert.equal(parseTokenAmount("1.5", 6), 1_500_000n);
  assert.equal(parseTokenAmount("0,000001", 6), 1n);
  assert.equal(parseTokenAmount("2", 0), 2n);
  assert.equal(parseTokenAmount("0.000000000000000001", 18), 1n);
  assert.equal(parseTokenAmount("123456789.123456789123456789", 18), 123456789123456789123456789n);
  assert.throws(() => parseTokenAmount("1.0000001", 6), /precision/);
  assert.throws(() => parseTokenAmount("1.5", 0), /precision/);
  for (const bad of ["0", "0.000", "-1", "1e3", "", "abc", "1.", ".5"]) assert.throws(() => parseTokenAmount(bad, 6), /amount/, bad);
  assert.throws(() => parseTokenAmount("1", -1), /asset/);
  assert.throws(() => parseTokenAmount("1", 19), /asset/);
});

test("validateEvmTokenTransfer checks address, amount, balance and gas funds", () => {
  const input = { to: RECIPIENT, amount: "2.5", decimals: 6, balance: 3, nativeBalance: 1 };
  assert.deepEqual(validateEvmTokenTransfer(input), { units: 2_500_000n, human: 2.5 });
  assert.throws(() => validateEvmTokenTransfer({ ...input, balance: 2.4 }), /balance/);
  assert.throws(() => validateEvmTokenTransfer({ ...input, to: "x" }), /address/);
  assert.throws(() => validateEvmTokenTransfer({ ...input, nativeBalance: 0 }), /fee/);
  assert.throws(() => validateEvmTokenTransfer({ ...input, decimals: -1 }), /asset/);
});

test("Max / percent text is truncated to the token's decimals, never exponent notation", () => {
  assert.equal(humanAmountText(78.038183, 6), "78.038183");
  assert.equal(humanAmountText(1, 6, 0.25), "0.25");
  assert.equal(humanAmountText(1.999999999, 6), "1.999999");
  assert.equal(humanAmountText(5, 0, 0.5), "2");
  assert.equal(humanAmountText(1e-7, 18), "0.0000001");
  assert.equal(humanAmountText(0, 6), "0");
});

test("sendErc20Transfer preflights, sends with the buffered gas and waits for a successful receipt", async () => {
  const { clients, log } = mockClients();
  const stages = [];
  const hash = await sendErc20Transfer({ privateKey: "0x01", token: TOKEN, to: RECIPIENT, amountUnits: 5n, onStage: (s) => stages.push(s) }, clients);
  assert.equal(hash, HASH);
  assert.deepEqual(stages, ["sending", "confirming"]);
  assert.equal(log.calls.length, 1);
  assert.equal(log.calls[0].data.slice(0, 10), "0xa9059cbb");
  assert.equal(log.calls[0].account, SENDER);
  assert.equal(log.writes.length, 1);
  assert.equal(log.writes[0].functionName, "transfer");
  assert.equal(log.writes[0].gas, 60_000n);
  assert.equal(log.waits.length, 1);
});

test("sendErc20Transfer refuses an amount above balanceOf before anything is simulated or sent", async () => {
  const { clients, log } = mockClients({ balance: 4n });
  await assert.rejects(
    sendErc20Transfer({ privateKey: "0x01", token: TOKEN, to: RECIPIENT, amountUnits: 5n }, clients),
    (e) => e instanceof WalletSendError && e.code === "insufficient_token_balance",
  );
  assert.equal(log.calls.length + log.writes.length, 0);
});

test("a preflight revert is a TxPreflightError and nothing is sent", async () => {
  const { clients, log } = mockClients({ callError: revertError });
  await assert.rejects(
    sendErc20Transfer({ privateKey: "0x01", token: TOKEN, to: RECIPIENT, amountUnits: 5n }, clients),
    (e) => e instanceof TxPreflightError,
  );
  assert.equal(log.writes.length, 0);
  assert.equal(log.waits.length, 0);
});

test("a mined-but-reverted receipt is an error, a timeout and a replaced tx are told apart", async () => {
  const send = (opts) => sendErc20Transfer({ privateKey: "0x01", token: TOKEN, to: RECIPIENT, amountUnits: 1n }, mockClients(opts).clients);
  await assert.rejects(send({ receipt: { status: "reverted" } }), (e) => e.code === "tx_reverted" && e.hash === HASH);
  await assert.rejects(send({ waitError: new Error("timed out") }), (e) => e.code === "tx_timeout");
  await assert.rejects(send({ replaced: { reason: "cancelled" } }), (e) => e.code === "tx_replaced");
  await assert.rejects(send({ replaced: { reason: "replaced" } }), (e) => e.code === "tx_replaced");
  assert.equal(await send({ replaced: { reason: "repriced" } }), HASH);
  await assert.doesNotReject(confirmTransfer(mockClients().clients.publicClient, HASH));
});

test("sendNftTransfer requires ownerOf === sender, then preflights safeTransferFrom and confirms", async () => {
  const ok = mockClients();
  const hash = await sendNftTransfer({ privateKey: "0x01", collection: COLLECTION, tokenId: 3n, to: RECIPIENT }, ok.clients);
  assert.equal(hash, HASH);
  assert.equal(ok.log.reads[0].functionName, "ownerOf");
  assert.equal(ok.log.calls[0].data.slice(0, 10), "0x42842e0e");
  assert.equal(ok.log.writes[0].functionName, "safeTransferFrom");
  assert.equal(ok.log.writes[0].args[0].toLowerCase(), SENDER);
  assert.equal(ok.log.writes[0].args[1].toLowerCase(), RECIPIENT);

  for (const owner of [OTHER, null]) {
    const { clients, log } = mockClients({ owner });
    await assert.rejects(
      sendNftTransfer({ privateKey: "0x01", collection: COLLECTION, tokenId: 3n, to: RECIPIENT }, clients),
      (e) => e instanceof WalletSendError && e.code === "not_nft_owner",
    );
    assert.equal(log.calls.length + log.writes.length, 0);
  }

  const reverted = mockClients({ receipt: { status: "reverted" } });
  await assert.rejects(
    sendNftTransfer({ privateKey: "0x01", collection: COLLECTION, tokenId: 3n, to: RECIPIENT }, reverted.clients),
    (e) => e.code === "tx_reverted",
  );
  const doomed = mockClients({ callError: revertError });
  await assert.rejects(
    sendNftTransfer({ privateKey: "0x01", collection: COLLECTION, tokenId: 3n, to: RECIPIENT }, doomed.clients),
    (e) => e instanceof TxPreflightError,
  );
  assert.equal(doomed.log.writes.length, 0);
});

test("NFT transfers are enabled by default and only an explicit 0 turns them off", () => {
  const page = readFileSync(new URL("../src/app/wallet/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes('process.env.NFT_TRANSFERS_ENABLED !== "0"'));
  assert.ok(!page.includes('NFT_TRANSFERS_ENABLED === "1"'));
  const app = readFileSync(new URL("../src/components/wallet/WalletApp.tsx", import.meta.url), "utf8");
  assert.ok(app.includes("nftTransfersEnabled = true"));
});

test("WalletApp routes EVM token and NFT sends to the new senders instead of throwing assetError", () => {
  const app = readFileSync(new URL("../src/components/wallet/WalletApp.tsx", import.meta.url), "utf8");
  assert.ok(app.includes("sendErc20Transfer(") && app.includes("sendNftTransfer("));
  assert.ok(!app.includes('txDraft.assetId !== "ppl" || txDraft.type !== "transfer") throw new Error(c.assetError)'));
});

test("demo seed NFTs are no longer a display source", () => {
  const compat = readFileSync(new URL("../src/lib/evm/people-compat.ts", import.meta.url), "utf8");
  const seeds = readFileSync(new URL("../src/lib/evm/seed-assets.ts", import.meta.url), "utf8");
  assert.ok(!compat.includes("listSeedNfts"));
  assert.ok(!seeds.includes("listSeedNfts"));
});
