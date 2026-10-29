import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CREATED_TOKENS_STORAGE_KEY,
  addCreatedToken,
  createdTokensForAddress,
  findDuplicateTokens,
  readCreatedTokens,
  tokenAddressFromReceipt,
  writeCreatedTokens,
} from "../src/lib/created-tokens.ts";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    dump: () => Object.fromEntries(data),
  };
}

const record = (overrides = {}) => ({
  creator: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
  address: "0x1111111111111111111111111111111111111111",
  name: "Neighbourhood Savings",
  symbol: "NBH",
  tx: "0xabc",
  image: "",
  createdAt: 1,
  ...overrides,
});

test("read/write keep only valid records and tolerate corrupt storage", () => {
  const storage = memoryStorage();
  writeCreatedTokens(storage, [record(), { nope: true }]);
  const rows = readCreatedTokens(storage);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].address, "0x1111111111111111111111111111111111111111");
  assert.equal(rows[0].creator, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

  storage.setItem(CREATED_TOKENS_STORAGE_KEY, "{not json");
  assert.deepEqual(readCreatedTokens(storage), []);
});

test("addCreatedToken replaces by address and puts the newest first", () => {
  const storage = memoryStorage();
  addCreatedToken(storage, record());
  const next = addCreatedToken(storage, record({ address: "0x2222222222222222222222222222222222222222", symbol: "TWO" }));
  assert.equal(next.length, 2);
  assert.equal(next[0].symbol, "TWO");
  const replaced = addCreatedToken(storage, record({ name: "Renamed" }));
  assert.equal(replaced.length, 2);
  assert.equal(replaced[0].name, "Renamed");
});

test("createdTokensForAddress filters by lowercased creator", () => {
  const rows = [record(), record({ creator: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" })];
  assert.equal(createdTokensForAddress(rows, "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").length, 1);
});

test("duplicate detection matches name or symbol case-insensitively and trims", () => {
  const rows = [
    record({ address: "0x1111111111111111111111111111111111111111", name: "Neighbourhood Savings", symbol: "NBH" }),
    record({ address: "0x2222222222222222222222222222222222222222", name: "Other", symbol: "OTHER" }),
    record({ address: "0x3333333333333333333333333333333333333333", creator: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", name: "Neighbourhood Savings", symbol: "NBH" }),
  ];
  const bySymbol = findDuplicateTokens(rows, { creator: rows[0].creator, name: "", symbol: " nbh " });
  assert.deepEqual(bySymbol.map((row) => row.address), ["0x1111111111111111111111111111111111111111"]);
  const byName = findDuplicateTokens(rows, { creator: rows[0].creator, name: " neighbourhood savings ", symbol: "" });
  assert.equal(byName.length, 1);
  const both = findDuplicateTokens(rows, { creator: rows[0].creator, name: "Neighbourhood Savings", symbol: "NBH" });
  assert.equal(both.length, 1);
});

test("duplicate detection ignores other creators and empty queries", () => {
  const rows = [record()];
  assert.deepEqual(findDuplicateTokens(rows, { creator: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", name: "Neighbourhood Savings", symbol: "NBH" }), []);
  assert.deepEqual(findDuplicateTokens(rows, { creator: rows[0].creator, name: "  ", symbol: "" }), []);
});

test("token address comes from the factory TokenCreated event, else the zero-address Transfer", () => {
  const factory = "0x58f434E5f24c7239CAAf103a23F783e89dEec36B";
  const token = "0x9999999999999999999999999999999999999999";
  const topic = "0xdcb5d6c49a959a42d0c67fe9b9aa48b4da6065c9f47789f71789f629d84d30f1";
  const fromEvent = tokenAddressFromReceipt(
    [{ address: factory, topics: [topic, `0x${"0".repeat(24)}${token.slice(2)}`] }],
    factory,
  );
  assert.equal(fromEvent, token);

  const transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const fromMint = tokenAddressFromReceipt(
    [
      {
        address: "0x8888888888888888888888888888888888888888",
        topics: [transfer, `0x${"0".repeat(64)}`, `0x${"0".repeat(24)}${"1".repeat(40)}`],
      },
    ],
    factory,
  );
  assert.equal(fromMint, "0x8888888888888888888888888888888888888888");
});
