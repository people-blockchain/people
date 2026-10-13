import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import {
  ensurePeopleChain,
  readInjectedProvider,
  waitForInjectedProvider,
  type EIP1193Provider,
} from "./client.ts";

class FakeWindow extends EventTarget {
  ethereum?: unknown;
}

let fakeWindow: FakeWindow;

before(() => {
  fakeWindow = new FakeWindow();
  (globalThis as unknown as { window: FakeWindow }).window = fakeWindow;
});

afterEach(() => {
  fakeWindow.ethereum = undefined;
});

function makeProvider(
  handlers: Record<string, (params?: unknown[]) => unknown>,
): EIP1193Provider {
  return {
    request: async ({ method, params }) => {
      if (!(method in handlers)) throw new Error(`unexpected method ${method}`);
      return handlers[method](params);
    },
  };
}

describe("ensurePeopleChain", () => {
  it("just switches when the wallet already knows the chain", async () => {
    const calls: string[] = [];
    const provider = makeProvider({
      wallet_switchEthereumChain: () => {
        calls.push("switch");
        return null;
      },
    });
    await ensurePeopleChain(provider);
    assert.deepEqual(calls, ["switch"]);
  });

  it("adds then switches again on MetaMask's 4902 unknown-chain error", async () => {
    const calls: string[] = [];
    let switchAttempts = 0;
    const provider = makeProvider({
      wallet_switchEthereumChain: () => {
        switchAttempts += 1;
        calls.push("switch");
        if (switchAttempts === 1) {
          const err = new Error("unrecognized chain") as Error & { code: number };
          err.code = 4902;
          throw err;
        }
        return null;
      },
      wallet_addEthereumChain: (params) => {
        calls.push("add");
        const [chain] = params as [
          {
            chainId: string;
            chainName: string;
            rpcUrls: string[];
            blockExplorerUrls: string[];
            nativeCurrency: { name: string; symbol: string; decimals: number };
          },
        ];
        assert.equal(chain.chainId, "0x17c79");
        assert.ok(chain.chainName);
        assert.ok(chain.rpcUrls[0]?.startsWith("http"));
        assert.ok(chain.blockExplorerUrls[0]?.startsWith("http"));
        assert.deepEqual(chain.nativeCurrency, { name: "People", symbol: "PPL", decimals: 18 });
        return null;
      },
    });
    await ensurePeopleChain(provider);
    assert.deepEqual(calls, ["switch", "add", "switch"]);
  });

  it("falls back to adding the chain on a non-4902 switch failure (e.g. Trust Wallet)", async () => {
    const calls: string[] = [];
    let switchAttempts = 0;
    const provider = makeProvider({
      wallet_switchEthereumChain: () => {
        switchAttempts += 1;
        calls.push("switch");
        if (switchAttempts === 1) throw new Error("Unrecognized chain ID");
        return null;
      },
      wallet_addEthereumChain: () => {
        calls.push("add");
        return null;
      },
    });
    await ensurePeopleChain(provider);
    assert.deepEqual(calls, ["switch", "add", "switch"]);
  });

  it("propagates a user rejection (4001) without trying to add the chain", async () => {
    const provider = makeProvider({
      wallet_switchEthereumChain: () => {
        const err = new Error("User rejected") as Error & { code: number };
        err.code = 4001;
        throw err;
      },
      wallet_addEthereumChain: () => {
        throw new Error("should not be called");
      },
    });
    await assert.rejects(() => ensurePeopleChain(provider), /User rejected/);
  });
});

describe("readInjectedProvider", () => {
  it("returns null when nothing is injected", () => {
    assert.equal(readInjectedProvider("any"), null);
  });

  it("picks the right provider out of a multi-provider window.ethereum", () => {
    const mm = { request: async () => null, isMetaMask: true };
    const trust = { request: async () => null, isTrust: true };
    fakeWindow.ethereum = { providers: [mm, trust], isMetaMask: true };
    assert.equal(readInjectedProvider("metamask"), mm);
    assert.equal(readInjectedProvider("trust"), trust);
  });

  it("treats a lone isTrust provider as Trust, not MetaMask", () => {
    fakeWindow.ethereum = { request: async () => null, isTrust: true };
    assert.equal(readInjectedProvider("trust"), fakeWindow.ethereum);
    assert.equal(readInjectedProvider("metamask"), null);
  });

});

describe("waitForInjectedProvider", () => {
  it("resolves immediately if already injected", async () => {
    fakeWindow.ethereum = { request: async () => null, isMetaMask: true };
    const provider = await waitForInjectedProvider("metamask", 200);
    assert.equal(provider, fakeWindow.ethereum);
  });

  it("picks up a late ethereum#initialized announcement", async () => {
    const pending = waitForInjectedProvider("any", 1000);
    setTimeout(() => {
      fakeWindow.ethereum = { request: async () => null, isMetaMask: true };
      fakeWindow.dispatchEvent(new Event("ethereum#initialized"));
    }, 30);
    assert.equal(await pending, fakeWindow.ethereum);
  });

  it("resolves null after the timeout when nothing is ever injected", async () => {
    assert.equal(await waitForInjectedProvider("any", 50), null);
  });
});

// Keep this last: the module-level EIP-6963 `announceProvider` listener and provider registry
// are singletons for the page's lifetime, so an announcement here would otherwise leak into
// every test above that expects "nothing injected".
describe("EIP-6963 discovery", () => {
  it("detects a provider only announced via EIP-6963 (no window.ethereum at all)", () => {
    const eip6963Provider = { request: async () => null };
    fakeWindow.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: { info: { uuid: "test-mm", rdns: "io.metamask" }, provider: eip6963Provider },
      }),
    );
    assert.equal(readInjectedProvider("metamask"), eip6963Provider);
  });
});
