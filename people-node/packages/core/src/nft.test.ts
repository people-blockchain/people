import { describe, expect, test } from "vitest";
import {
  DEFAULT_CONFIG,
  DEFAULT_NFT_MINT_MIN_FEE,
  applyNftMint,
  applyNftTransfer,
  applyTransaction,
  computeStateRoot,
  createInitialState,
  deriveNftId,
  ensureAccount,
  generateKeyPair,
  listNfts,
  listOwnedNfts,
  NATIVE_ASSET_ID,
  signTransaction
} from "./index.js";

describe("NFT mint and transfer", () => {
  test("nftTransfer accepts the approved fractional PPL fee and rejects invalid fees", () => {
    const state = createInitialState();
    const owner = generateKeyPair();
    const recipient = generateKeyPair();
    ensureAccount(state, owner.address).balance = 10;
    state.accounts[owner.address]!.balances[NATIVE_ASSET_ID] = 10;
    applyNftMint(state, signTransaction(owner.privateKey, {
      id: "fractional-mint", from: owner.address, to: "nft", amount: 0,
      fee: DEFAULT_NFT_MINT_MIN_FEE, nonce: 0, timestamp: 1, type: "nftMint",
      payload: { name: "Fractional fee", imageUri: "https://example.com/nft.png" }
    }), DEFAULT_CONFIG);
    const nftId = listNfts(state)[0]!.nftId;
    const before = state.accounts[owner.address]!.balance;
    const unsigned = { id: "fractional-transfer", from: owner.address, to: recipient.address,
      amount: 0, nonce: 1, timestamp: 2, type: "nftTransfer" as const, payload: { nftId } };
    for (const fee of [-1, NaN, Infinity, -Infinity]) {
      expect(() => applyNftTransfer(state, signTransaction(owner.privateKey, {...unsigned, fee}), DEFAULT_CONFIG)).toThrow("Invalid transaction fee");
      expect(state.accounts[owner.address]!.nonce).toBe(1);
      expect(state.nfts[nftId]!.owner).toBe(owner.address);
    }
    expect(() => applyNftTransfer(state, signTransaction(owner.privateKey, {...unsigned, fee: before + 1}), DEFAULT_CONFIG)).toThrow("Insufficient native balance");
    applyTransaction(state, signTransaction(owner.privateKey, {...unsigned, fee: 0.004875}), DEFAULT_CONFIG);
    expect(state.accounts[owner.address]!.balance).toBeCloseTo(before - 0.004875, 12);
    expect(state.accounts[owner.address]!.balances[NATIVE_ASSET_ID]).toBe(state.accounts[owner.address]!.balance);
    expect(state.accounts[owner.address]!.nonce).toBe(2);
    expect(state.nfts[nftId]!.owner).toBe(recipient.address);
  });
  test("nftTransfer rejects non-canonical recipients (M12-1)", () => {
    const state = createInitialState();
    const owner = generateKeyPair();
    const victim = generateKeyPair();
    ensureAccount(state, owner.address).balance = 10;
    state.accounts[owner.address]!.balances[NATIVE_ASSET_ID] = 10;
    applyNftMint(state, signTransaction(owner.privateKey, {
      id: "m12-mint", from: owner.address, to: "nft", amount: 0,
      fee: DEFAULT_NFT_MINT_MIN_FEE, nonce: 0, timestamp: 1, type: "nftMint",
      payload: { name: "m12", imageUri: "https://example.com/nft.png" }
    }), DEFAULT_CONFIG);
    const nftId = listNfts(state)[0]!.nftId;
    const accountsBefore = Object.keys(state.accounts).sort();
    for (const to of ["0xzz" + victim.address.slice(2), "0x" + victim.address.slice(2).toUpperCase(), "not-an-address"]) {
      const tx = signTransaction(owner.privateKey, {
        id: "m12-" + to.slice(0, 8), from: owner.address, to, amount: 0, fee: 0.01,
        nonce: 1, timestamp: 2, type: "nftTransfer", payload: { nftId }
      });
      expect(() => applyNftTransfer(state, tx, DEFAULT_CONFIG)).toThrow("Invalid NFT transfer recipient");
      expect(() => applyTransaction(state, tx, DEFAULT_CONFIG)).toThrow("Invalid NFT transfer recipient");
      expect(Object.keys(state.accounts).sort()).toEqual(accountsBefore);
      expect(state.nfts[nftId]!.owner).toBe(owner.address);
      expect(state.accounts[owner.address]!.nonce).toBe(1);
    }
  });
  test("nftMint records metadata, ownership, and image URI", () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    ensureAccount(state, creator.address).balance = 10;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 10;
    const beforeRoot = computeStateRoot(state);

    const tx = signTransaction(creator.privateKey, {
      id: "mint-1",
      from: creator.address,
      to: "nft",
      amount: 0,
      fee: DEFAULT_NFT_MINT_MIN_FEE,
      nonce: 0,
      timestamp: Date.now(),
      type: "nftMint",
      payload: {
        name: "Sunset",
        description: "A photo",
        imageUri: "https://example.com/sunset.png",
        collectionId: "landscapes"
      }
    });

    applyNftMint(state, tx, DEFAULT_CONFIG);
    const expectedId = deriveNftId(creator.address, 0, "Sunset");
    const nft = state.nfts[expectedId];
    expect(nft).toBeDefined();
    expect(nft!.owner).toBe(creator.address);
    expect(nft!.creator).toBe(creator.address);
    expect(nft!.name).toBe("Sunset");
    expect(nft!.imageUri).toBe("https://example.com/sunset.png");
    expect(nft!.collectionId).toBe("landscapes");
    expect(state.accounts[creator.address]!.nonce).toBe(1);
    expect(computeStateRoot(state)).not.toBe(beforeRoot);
    expect(listOwnedNfts(state, creator.address)).toHaveLength(1);
  });

  test("nftTransfer moves ownership and rejects non-owners", () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    const buyer = generateKeyPair();
    ensureAccount(state, creator.address).balance = 10;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 10;
    ensureAccount(state, buyer.address);

    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "mint-2",
        from: creator.address,
        to: "nft",
        amount: 0,
        fee: DEFAULT_NFT_MINT_MIN_FEE,
        nonce: 0,
        timestamp: Date.now(),
        type: "nftMint",
        payload: {
          name: "Card",
          imageUri: "sha256:abcd"
        }
      }),
      DEFAULT_CONFIG
    );

    const nftId = listNfts(state)[0]!.nftId;
    expect(() =>
      applyNftTransfer(
        state,
        signTransaction(buyer.privateKey, {
          id: "steal",
          from: buyer.address,
          to: creator.address,
          amount: 0,
          fee: 0,
          nonce: 0,
          timestamp: Date.now(),
          type: "nftTransfer",
          payload: { nftId }
        }),
        DEFAULT_CONFIG
      )
    ).toThrow("Not NFT owner");

    applyNftTransfer(
      state,
      signTransaction(creator.privateKey, {
        id: "send",
        from: creator.address,
        to: buyer.address,
        amount: 0,
        fee: 0,
        nonce: 1,
        timestamp: Date.now(),
        type: "nftTransfer",
        payload: { nftId }
      }),
      DEFAULT_CONFIG
    );
    expect(state.nfts[nftId]!.owner).toBe(buyer.address);
    expect(listOwnedNfts(state, buyer.address)).toHaveLength(1);
    expect(listOwnedNfts(state, creator.address)).toHaveLength(0);
  });

  test("rejects invalid image URI and duplicate id", () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    ensureAccount(state, creator.address).balance = 10;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 10;

    expect(() =>
      applyNftMint(
        state,
        signTransaction(creator.privateKey, {
          id: "bad-uri",
          from: creator.address,
          to: "nft",
          amount: 0,
          fee: DEFAULT_NFT_MINT_MIN_FEE,
          nonce: 0,
          timestamp: Date.now(),
          type: "nftMint",
          payload: { name: "BadUri", imageUri: "javascript:alert(1)" }
        }),
        DEFAULT_CONFIG
      )
    ).toThrow(/image URI/);

    const mint = signTransaction(creator.privateKey, {
      id: "ok",
      from: creator.address,
      to: "nft",
      amount: 0,
      fee: DEFAULT_NFT_MINT_MIN_FEE,
      nonce: 0,
      timestamp: Date.now(),
      type: "nftMint",
      payload: { name: "PieceA", imageUri: "https://cdn.example/a.png", nftId: "nft-aaaaaaaaaaaaaaaa" }
    });
    applyNftMint(state, mint, DEFAULT_CONFIG);
    expect(() =>
      applyNftMint(
        state,
        signTransaction(creator.privateKey, {
          id: "dup",
          from: creator.address,
          to: "nft",
          amount: 0,
          fee: DEFAULT_NFT_MINT_MIN_FEE,
          nonce: 1,
          timestamp: Date.now(),
          type: "nftMint",
          payload: { name: "PieceB", imageUri: "https://cdn.example/b.png", nftId: "nft-aaaaaaaaaaaaaaaa" }
        }),
        DEFAULT_CONFIG
      )
    ).toThrow(/already exists/);
  });

  test("empty nfts map is hashed; two nodes agree", () => {
    const a = createInitialState();
    const b = createInitialState();
    expect(a.nfts).toEqual({});
    expect(computeStateRoot(a)).toBe(computeStateRoot(b));
  });
});
