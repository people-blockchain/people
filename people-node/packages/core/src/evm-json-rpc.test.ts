import { describe, expect, test, vi } from "vitest";
import { EIP155_CHAIN_ID } from "@people/protocol";
import {
  DEFAULT_JSON_RPC_MAX_BATCH,
  handleJsonRpcBatch,
  handleJsonRpcRequest,
  jsonRpcBatchTooLarge,
  jsonRpcMaxBatch,
  type EvmJsonRpcHost
} from "./evm-json-rpc.js";
import * as contracts from "./contracts.js";
import { createInitialState, FAUCET_ADDRESS } from "./index.js";
import { pplToWei } from "./evm.js";

describe("evm json-rpc", () => {
  const host = () => {
    const chainState = createInitialState();
    return {
      chainState,
      headHeight: chainState.chain.at(-1)!.header.height,
      stringChainId: chainState.networkConfig!.chainId
    };
  };

  test("eth_chainId matches protocol constant", async () => {
    const res = await handleJsonRpcRequest(host(), {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: []
    });
    expect(res).toMatchObject({ result: `0x${EIP155_CHAIN_ID.toString(16)}` });
  });

  test("eth_getBalance returns faucet genesis balance in wei", async () => {
    const h = host();
    const balance = h.chainState.accounts[FAUCET_ADDRESS.toLowerCase()]!.balance;
    const res = await handleJsonRpcRequest(h, {
      jsonrpc: "2.0",
      id: 2,
      method: "eth_getBalance",
      params: [FAUCET_ADDRESS, "latest"]
    });
    expect(res).toMatchObject({ result: `0x${pplToWei(balance).toString(16)}` });
  });

  test("unknown method returns -32601", async () => {
    const res = await handleJsonRpcRequest(host(), {
      jsonrpc: "2.0",
      id: 3,
      method: "eth_sendRawTransaction",
      params: []
    });
    expect(res).toMatchObject({ error: { code: -32601 } });
  });

  /** M16-1: batch length, per-call gas ceiling, call policy and event-loop fairness. */
  describe("batch and call limits (M16-1)", () => {
    test("default batch limit is 50 and comes from JSON_RPC_MAX_BATCH", () => {
      expect(DEFAULT_JSON_RPC_MAX_BATCH).toBe(50);
      expect(jsonRpcMaxBatch({} as NodeJS.ProcessEnv)).toBe(50);
      expect(jsonRpcMaxBatch({ JSON_RPC_MAX_BATCH: "7" } as NodeJS.ProcessEnv)).toBe(7);
      expect(jsonRpcMaxBatch({ JSON_RPC_MAX_BATCH: "0" } as NodeJS.ProcessEnv)).toBe(50);
      expect(jsonRpcMaxBatch({ JSON_RPC_MAX_BATCH: "nope" } as NodeJS.ProcessEnv)).toBe(50);
    });

    test("an over-long batch is refused as -32600 without executing a call", async () => {
      const spy = vi.spyOn(contracts, "staticContractCall");
      const body = jsonRpcBatchTooLarge();
      expect(body.error).toMatchObject({ code: -32600, message: "Batch too large" });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test("eth_call is capped by maxCallGas even when the caller asks for 4 000 000", async () => {
      const seen: number[] = [];
      const spy = vi
        .spyOn(contracts, "staticContractCall")
        .mockImplementation(async (_state, _from, to, _data, gasLimit) => {
          seen.push(gasLimit ?? 0);
          return { txId: "eth_call", contractAddress: to, gasUsed: 21_000, status: 1, logs: [], returnData: "0x" };
        });
      const h: EvmJsonRpcHost = { ...host(), maxCallGas: 1_000_000 };
      await handleJsonRpcRequest(h, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: "0x" + "11".repeat(20), data: "0x", gas: "0x3d0900" }]
      });
      await handleJsonRpcRequest(h, {
        jsonrpc: "2.0",
        id: 2,
        method: "eth_estimateGas",
        params: [{ to: "0x" + "11".repeat(20), data: "0x" }]
      });
      expect(seen).toEqual([1_000_000, 1_000_000]);
      spy.mockRestore();
    });

    test("allowCall() = false refuses eth_call and eth_estimateGas", async () => {
      const spy = vi.spyOn(contracts, "staticContractCall");
      const h: EvmJsonRpcHost = { ...host(), allowCall: () => false };
      for (const method of ["eth_call", "eth_estimateGas"]) {
        const res = await handleJsonRpcRequest(h, {
          jsonrpc: "2.0",
          id: 1,
          method,
          params: [{ to: "0x" + "11".repeat(20), data: "0x" }]
        });
        expect(res).toMatchObject({ error: { code: -32600, message: /rate limit/ } });
      }
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test("a running batch lets timers fire", async () => {
      // A macrotask queued before the batch only runs if the batch yields to the event loop.
      // (A 1ms setInterval is timing dependent: 30 cheap calls can finish before it ever fires.)
      let ticks = 0;
      setImmediate(() => {
        ticks += 1;
      });
      const h = host();
      const requests = Array.from({ length: 30 }, (_, i) => ({
        jsonrpc: "2.0" as const,
        id: i,
        method: "eth_chainId",
        params: []
      }));
      const out = await handleJsonRpcBatch(h, requests);
      expect(out).toHaveLength(30);
      // setImmediate between calls drains the macrotask queue, so timers get a turn.
      expect(ticks).toBeGreaterThan(0);
    });
  });
});
