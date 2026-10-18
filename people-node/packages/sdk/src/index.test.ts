import { describe, expect, test } from "vitest";
import {
  formatPaymentMemos,
  generateKeyPair,
  getBatchRecipients,
  getPaymentMemoForAddress,
  getTxMemo,
  keyPairFromPrivateKey,
  MAX_TRANSFER_MEMO_LENGTH,
  PeopleClient,
  signTransaction
} from "./index.js";

describe("@people/sdk", () => {
  test("getTxMemo trims and validates memo length constant", async () => {
    expect(getTxMemo({ type: "transfer", payload: { memo: "  hello  " } })).toBe("hello");
    expect(getTxMemo({ type: "transfer", payload: { memo: "" } })).toBeNull();
    expect(MAX_TRANSFER_MEMO_LENGTH).toBe(256);
  });

  test("batch memos are per recipient", async () => {
    const tx = {
      type: "transfer" as const,
      to: "batch",
      payload: {
        recipients: [
          { to: "0xaaa", amount: 1, memo: "Salary" },
          { to: "0xbbb", amount: 2, memo: "Bonus" }
        ]
      }
    };
    expect(getTxMemo(tx)).toBeNull();
    expect(getBatchRecipients(tx)?.[0]?.memo).toBe("Salary");
    expect(getPaymentMemoForAddress(tx, "0xbbb")).toBe("Bonus");
    expect(formatPaymentMemos(tx)).toContain("Salary");
  });

  test("signTransaction includes memo in signed payload", async () => {
    const key = generateKeyPair();
    const tx = signTransaction(key.privateKey, {
      chainId: "test-network",
      id: "tx-1",
      from: key.address,
      to: "0xabc",
      amount: 1,
      fee: 0.1,
      nonce: 0,
      timestamp: Date.now(),
      type: "transfer",
      payload: { memo: "test" }
    });
    expect(tx.payload?.memo).toBe("test");
    expect(tx.signature).toBeTruthy();
  });

  test("keyPairFromPrivateKey is deterministic", async () => {
    const key = generateKeyPair();
    const restored = keyPairFromPrivateKey(key.privateKey);
    expect(restored.address).toBe(key.address);
  });

  test("PeopleClient builds reward history path", async () => {
    const client = new PeopleClient({ baseUrl: "http://localhost:4001" });
    expect(client.getRewardHistory).toBeTypeOf("function");
  });

  test("PeopleClient exposes Phase 2 token factory and bonding curve methods", async () => {
    const client = new PeopleClient({ baseUrl: "http://localhost:4001" });
    expect(client.createToken).toBeTypeOf("function");
    expect(client.buyCurveTokens).toBeTypeOf("function");
    expect(client.sellCurveTokens).toBeTypeOf("function");
    expect(client.claimVestedTokens).toBeTypeOf("function");
    expect(client.getCurve).toBeTypeOf("function");
    expect(client.getCreatorVesting).toBeTypeOf("function");
    expect(client.getLiquidityPool).toBeTypeOf("function");
    expect(client.listLiquidityPools).toBeTypeOf("function");
    expect(client.quoteAmmSwap).toBeTypeOf("function");
    expect(client.createAmmPool).toBeTypeOf("function");
    expect(client.addAmmLiquidity).toBeTypeOf("function");
    expect(client.removeAmmLiquidity).toBeTypeOf("function");
    expect(client.swapAmm).toBeTypeOf("function");
    expect(client.getTokenAllocation).toBeTypeOf("function");
    expect(client.mintNft).toBeTypeOf("function");
    expect(client.transferNft).toBeTypeOf("function");
    expect(client.getNft).toBeTypeOf("function");
    expect(client.listNfts).toBeTypeOf("function");
  });

  test("Phase 2 transaction builders sign valid transactions", async () => {
    const key = generateKeyPair();
    const mockTxs: any[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (String(_url).endsWith("/health")) return new Response(JSON.stringify({ok:true,chainId:"sdk-testnet"}), {status:200});
      if (init?.body) {
        mockTxs.push(JSON.parse(String(init.body)));
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ accepted: true })
      } as Response;
    }) as any;

    try {
      const client = new PeopleClient({ baseUrl: "http://localhost:4001" });

      // 1. Create Token
      await client.createToken(key.privateKey, {
        name: "Test Token",
        symbol: "TEST",
        decimals: 6,
        totalSupply: 1_000_000_000,
        nonce: 0,
        fee: 1
      });
      expect(mockTxs[0].type).toBe("tokenCreate");
      expect(mockTxs[0].fee).toBe(1);
      expect(mockTxs[0].payload.symbol).toBe("TEST");
      expect(mockTxs[0].signature).toBeTruthy();
      expect(mockTxs.every(tx => tx.chainId === "sdk-testnet")).toBe(true);

      // 2. Buy Curve Tokens
      await client.buyCurveTokens(key.privateKey, {
        assetId: "test",
        nativeAmount: 50,
        minTokensOut: 100_000,
        nonce: 1
      });
      expect(mockTxs[1].type).toBe("curveBuy");
      expect(mockTxs[1].payload.nativeAmount).toBe(50);
      expect(mockTxs[1].payload.minTokensOut).toBe(100_000);
      expect(mockTxs[1].signature).toBeTruthy();

      // 3. Sell Curve Tokens
      await client.sellCurveTokens(key.privateKey, {
        assetId: "test",
        tokenAmount: 50_000,
        minNativeOut: 20,
        nonce: 2
      });
      expect(mockTxs[2].type).toBe("curveSell");
      expect(mockTxs[2].payload.tokenAmount).toBe(50_000);
      expect(mockTxs[2].payload.minNativeOut).toBe(20);
      expect(mockTxs[2].signature).toBeTruthy();

      // 4. Claim Vested Tokens
      await client.claimVestedTokens(key.privateKey, {
        assetId: "test",
        nonce: 3
      });
      expect(mockTxs[3].type).toBe("creatorClaim");
      expect(mockTxs[3].payload.assetId).toBe("test");
      expect(mockTxs[3].signature).toBeTruthy();

      await client.mintNft(key.privateKey, {
        name: "Art",
        imageUri: "https://example.com/a.png",
        nonce: 4,
        fee: 0
      });
      expect(mockTxs[4].type).toBe("nftMint");
      expect(mockTxs[4].payload.imageUri).toBe("https://example.com/a.png");
      expect(mockTxs[4].signature).toBeTruthy();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
