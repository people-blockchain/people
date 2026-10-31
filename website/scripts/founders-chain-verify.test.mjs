import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics, getAddress, keccak256, pad as viemPad, parseAbi, toHex } from "viem";
import { verifyFounderActionOnChain } from "../src/lib/founders/chain-verify.ts";
import { readEvmDeployments } from "../src/lib/evm/config.ts";

const VALID_HASH = `0x${"a".repeat(64)}`;
const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const FOREIGN = "0x3333333333333333333333333333333333333333";
const FOREIGN_FACTORY = "0x4444444444444444444444444444444444444444";
const PAIR = "0x5555555555555555555555555555555555555555";
const TOKEN = "0x6666666666666666666666666666666666666666";

const d = readEvmDeployments();
const c = d.contracts;
const WPPL = c.wppl;

const eventAbi = parseAbi([
  "event NftMinted(address indexed collection, uint256 indexed tokenId, address indexed owner, string tokenURI)",
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)",
  "event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)",
  "event CurveBuy(address indexed token, address indexed buyer, uint256 nativeIn, uint256 tokensOut, uint256 fee)",
  "event CurveSell(address indexed token, address indexed seller, uint256 tokensIn, uint256 nativeOut, uint256 fee)",
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
]);

const ALLOC = { bondingCurve: 1n, communityPool: 2n, creator: 3n, liquidityReserve: 4n, ecosystemReserve: 5n };
const allocType = {
  type: "tuple",
  components: ["bondingCurve", "communityPool", "creator", "liquidityReserve", "ecosystemReserve"].map((name) => ({
    name,
    type: "uint256",
  })),
};

function mkLog(address, eventName, indexedArgs, dataTypes = [], dataValues = []) {
  const topics = encodeEventTopics({ abi: eventAbi, eventName, args: indexedArgs });
  return { address, topics, data: encodeAbiParameters(dataTypes, dataValues) };
}

const tokenCreatedLog = (address, creator, withLeftover = true) => {
  const sig = withLeftover
    ? "TokenCreated(address,address,string,string,uint8,uint256,(uint256,uint256,uint256,uint256,uint256),uint8)"
    : "TokenCreated(address,address,string,string,uint8,uint256,(uint256,uint256,uint256,uint256,uint256))";
  return {
    address,
    topics: [topic0(sig), pad(TOKEN), pad(creator)],
    data: encodeAbiParameters(
      [
        { type: "string" },
        { type: "string" },
        { type: "uint8" },
        { type: "uint256" },
        allocType,
        ...(withLeftover ? [{ type: "uint8" }] : []),
      ],
      ["Tok", "TOK", 18, 10n, ALLOC, ...(withLeftover ? [0] : [])],
    ),
  };
};

const topic0 = (sig) => keccak256(toHex(sig));
const pad = (a) => viemPad(a.toLowerCase(), { size: 32 });

const nftLog = (address, owner) =>
  mkLog(address, "NftMinted", { collection: TOKEN, tokenId: 1n, owner }, [{ type: "string" }], ["ipfs://x"]);
const pairCreatedLog = (address) =>
  mkLog(address, "PairCreated", { token0: TOKEN, token1: WPPL }, [{ type: "address" }, { type: "uint256" }], [PAIR, 1n]);
const voteLog = (address, voter) =>
  mkLog(
    address,
    "VoteCast",
    { voter },
    [{ type: "uint256" }, { type: "uint8" }, { type: "uint256" }, { type: "string" }],
    [7n, 1, 100n, ""],
  );
const buyLog = (address, buyer, nativeIn) =>
  mkLog(address, "CurveBuy", { token: TOKEN, buyer }, [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [nativeIn, 5n, 1n]);
const sellLog = (address, seller, nativeOut) =>
  mkLog(address, "CurveSell", { token: TOKEN, seller }, [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [5n, nativeOut, 1n]);
const swapLog = (pair, a0In, a1In, a0Out, a1Out) =>
  mkLog(pair, "Swap", { sender: c.router, to: WALLET }, [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [a0In, a1In, a0Out, a1Out]);

/** Mock client: one receipt, plus per-pair `factory()` / `token0()` answers. */
function mockClient({ status = "success", from = WALLET, to, logs = [], pairs = {}, input } = {}) {
  return {
    getTransactionReceipt: async () => ({ status, from, to, logs }),
    getTransaction: async () => ({ input }),
    readContract: async ({ address, functionName }) => {
      const p = pairs[address.toLowerCase()];
      if (!p) throw new Error("no such contract");
      return p[functionName];
    },
  };
}

const run = (action, client, wallet = WALLET) => verifyFounderActionOnChain(action, VALID_HASH, wallet, client);
const expectErr = (result, error) => {
  assert.equal(result.ok, false);
  assert.equal(result.error, error);
};

test("unknown actions are rejected as not_verifiable", async () => {
  for (const action of ["discover_reaction", "invite"]) {
    expectErr(await verifyFounderActionOnChain(action, VALID_HASH, WALLET, mockClient()), "not_verifiable");
  }
});

test("malformed tx hash is rejected before touching the network", async () => {
  for (const action of ["swap", "stake", "token_launch", "nft_mint", "pool_create", "governance_vote"]) {
    expectErr(await verifyFounderActionOnChain(action, "not-a-hash", WALLET), "invalid_tx_hash");
  }
});

test("every action: missing receipt, failed status and wrong sender are rejected", async () => {
  const missing = { getTransactionReceipt: async () => null };
  for (const action of ["swap", "token_launch", "nft_mint", "pool_create", "governance_vote"]) {
    expectErr(await run(action, missing), "tx_not_found");
    expectErr(await run(action, mockClient({ status: "reverted", to: c.router })), "tx_failed");
    expectErr(await run(action, mockClient({ from: OTHER, to: c.router })), "wallet_mismatch");
  }
});

test("token_launch: TokenCreated from a configured factory by the wallet is accepted", async () => {
  for (const withLeftover of [true, false]) {
    const client = mockClient({ to: c.tokenFactory, logs: [tokenCreatedLog(c.tokenFactory, WALLET, withLeftover)] });
    assert.deepEqual(await run("token_launch", client), { ok: true });
  }
  const legacy = mockClient({ to: c.tokenFactoryV1, logs: [tokenCreatedLog(c.tokenFactoryV1, WALLET)] });
  assert.deepEqual(await run("token_launch", legacy), { ok: true });
});

test("token_launch: foreign emitter, other creator and missing event are rejected", async () => {
  expectErr(
    await run("token_launch", mockClient({ to: FOREIGN, logs: [tokenCreatedLog(FOREIGN, WALLET)] })),
    "wrong_contract",
  );
  expectErr(
    await run("token_launch", mockClient({ to: c.tokenFactory, logs: [tokenCreatedLog(c.tokenFactory, OTHER)] })),
    "sender_mismatch",
  );
  expectErr(await run("token_launch", mockClient({ to: c.tokenFactory, logs: [] })), "event_missing");
});

test("nft_mint: NftMinted from a configured factory with owner = wallet is accepted", async () => {
  assert.deepEqual(await run("nft_mint", mockClient({ to: c.nftFactory, logs: [nftLog(c.nftFactory, WALLET)] })), { ok: true });
});

test("nft_mint: foreign emitter, other owner and no event are rejected", async () => {
  expectErr(await run("nft_mint", mockClient({ to: FOREIGN, logs: [nftLog(FOREIGN, WALLET)] })), "event_missing");
  expectErr(await run("nft_mint", mockClient({ to: c.nftFactory, logs: [nftLog(c.nftFactory, OTHER)] })), "sender_mismatch");
  expectErr(await run("nft_mint", mockClient({ to: c.nftFactory, logs: [] })), "event_missing");
});

test("pool_create: PairCreated from a configured AMM factory via factory or router is accepted", async () => {
  assert.deepEqual(await run("pool_create", mockClient({ to: c.router, logs: [pairCreatedLog(c.ammFactory)] })), { ok: true });
  assert.deepEqual(await run("pool_create", mockClient({ to: c.ammFactory, logs: [pairCreatedLog(c.ammFactory)] })), { ok: true });
});

test("pool_create: foreign factory, curve-migration tx and no event are rejected", async () => {
  expectErr(await run("pool_create", mockClient({ to: c.router, logs: [pairCreatedLog(FOREIGN_FACTORY)] })), "event_missing");
  expectErr(await run("pool_create", mockClient({ to: c.bondingCurve, logs: [pairCreatedLog(c.ammFactory)] })), "wrong_contract");
  expectErr(await run("pool_create", mockClient({ to: c.router, logs: [] })), "event_missing");
});

test("governance_vote: VoteCast from the configured governor by the wallet is accepted", async () => {
  assert.deepEqual(await run("governance_vote", mockClient({ to: c.governor, logs: [voteLog(c.governor, WALLET)] })), { ok: true });
});

test("governance_vote: foreign emitter, other voter and no event are rejected", async () => {
  expectErr(await run("governance_vote", mockClient({ to: FOREIGN, logs: [voteLog(FOREIGN, WALLET)] })), "event_missing");
  expectErr(await run("governance_vote", mockClient({ to: c.governor, logs: [voteLog(c.governor, OTHER)] })), "sender_mismatch");
  expectErr(await run("governance_vote", mockClient({ to: c.governor, logs: [] })), "event_missing");
});

test("swap: a pair created by a configured factory is accepted even if not in the static pools list", async () => {
  const pairs = {
    [PAIR]: { factory: c.ammFactory, token0: WPPL },
  };
  assert.ok(!d.pools.some((p) => p.poolId.toLowerCase() === PAIR));
  const client = mockClient({ to: c.router, logs: [swapLog(PAIR, 3n * 10n ** 18n, 0n, 0n, 7n)], pairs });
  assert.deepEqual(await run("swap", client), { ok: true, swapAmountPpl: 3 });
  // wPPL as token1 reads the amount1 side
  const client1 = mockClient({
    to: c.routerV4 ?? c.router,
    logs: [swapLog(PAIR, 0n, 0n, 9n, 2n * 10n ** 18n)],
    pairs: { [PAIR]: { factory: c.ammFactoryV1 ?? c.ammFactory, token0: TOKEN } },
  });
  assert.deepEqual(await run("swap", client1), { ok: true, swapAmountPpl: 2 });
});

test("swap: pair from an unknown factory, unreadable pair, foreign router and no event are rejected", async () => {
  const log = swapLog(PAIR, 1n, 0n, 0n, 1n);
  expectErr(
    await run("swap", mockClient({ to: c.router, logs: [log], pairs: { [PAIR]: { factory: FOREIGN_FACTORY, token0: WPPL } } })),
    "event_missing",
  );
  expectErr(await run("swap", mockClient({ to: c.router, logs: [log], pairs: {} })), "event_missing");
  expectErr(
    await run("swap", mockClient({ to: FOREIGN, logs: [log], pairs: { [PAIR]: { factory: c.ammFactory, token0: WPPL } } })),
    "wrong_contract",
  );
  expectErr(await run("swap", mockClient({ to: c.router, logs: [] })), "event_missing");
});

test("swap: bonding-curve buy and sell by the wallet are accepted with PPL volume", async () => {
  const buy = mockClient({ to: c.bondingCurve, logs: [buyLog(c.bondingCurve, WALLET, 5n * 10n ** 18n)] });
  assert.deepEqual(await run("swap", buy), { ok: true, swapAmountPpl: 5 });
  const sell = mockClient({ to: c.bondingCurveV2, logs: [sellLog(c.bondingCurveV2, WALLET, 4n * 10n ** 18n)] });
  assert.deepEqual(await run("swap", sell), { ok: true, swapAmountPpl: 4 });
});

test("swap: curve trade by another address or from a foreign contract is rejected", async () => {
  expectErr(
    await run("swap", mockClient({ to: c.bondingCurve, logs: [buyLog(c.bondingCurve, OTHER, 10n ** 18n)] })),
    "sender_mismatch",
  );
  expectErr(await run("swap", mockClient({ to: FOREIGN, logs: [buyLog(FOREIGN, WALLET, 10n ** 18n)] })), "wrong_contract");
  expectErr(await run("swap", mockClient({ to: c.bondingCurve, logs: [buyLog(FOREIGN, WALLET, 10n ** 18n)] })), "event_missing");
});

test("configured addresses are checksum-normalised when matching", async () => {
  const client = mockClient({ to: c.nftFactory.toLowerCase(), logs: [nftLog(getAddress(c.nftFactory), WALLET)] });
  assert.deepEqual(await run("nft_mint", client), { ok: true });
});
