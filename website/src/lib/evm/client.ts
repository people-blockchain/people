"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PEOPLE_EIP155_CHAIN_ID } from "@/lib/wallet-address-scheme";
import { readEvmRpcUrl } from "@/lib/evm/config";
import { buildWeb3AuthChainConfig } from "@/lib/web3auth-chain-config";

export function peopleViemChain(rpcUrl: string): Chain {
  return {
    id: PEOPLE_EIP155_CHAIN_ID,
    name: "PEOPLE Blockchain testnet",
    nativeCurrency: { name: "People", symbol: "PPL", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
}

export function browserEvmRpcUrl(): string {
  if (typeof window === "undefined") return "/api/evm/rpc";
  return "/api/evm/rpc";
}

export function createBrowserPublicClient() {
  const chain = peopleViemChain(browserEvmRpcUrl());
  return createPublicClient({ chain, transport: http(browserEvmRpcUrl()) });
}

/**
 * The embedded vault keeps the People Wallet key as bare hex (`keyFromPrivate`
 * returns the noble encoding, no `0x`), and the legacy signing helpers accept
 * that — but viem rejects it with "invalid private key, expected hex or 32
 * bytes, got string", which killed every EVM write from the embedded wallet
 * (native Send included). Normalize here, the one place the app hands its key
 * to viem.
 */
export function normalizePrivateKey(privateKey: string): Hex {
  const hex = privateKey.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("invalid_private_key");
  return `0x${hex}`;
}

export function createEmbeddedWalletClient(privateKey: string) {
  const chain = peopleViemChain(browserEvmRpcUrl());
  const account = privateKeyToAccount(normalizePrivateKey(privateKey));
  return createWalletClient({
    chain,
    transport: http(browserEvmRpcUrl()),
    account,
  });
}

export function createInjectedWalletClient(provider: EIP1193Provider) {
  const chain = peopleViemChain(browserEvmRpcUrl());
  return createWalletClient({
    chain,
    transport: custom(provider),
    account: undefined as never,
  });
}

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
};

type InjectedWindow = Window & {
  ethereum?: EIP1193Provider & {
    isMetaMask?: boolean;
    isTrust?: boolean;
    providers?: Array<
      EIP1193Provider & { isMetaMask?: boolean; isTrust?: boolean }
    >;
  };
};

export type InjectedWalletVendor = "metamask" | "trust" | "any";

type Eip6963ProviderDetail = {
  info: { uuid: string; rdns?: string; name?: string; icon?: string };
  provider: EIP1193Provider;
};

/** EIP-6963: wallets announce themselves instead of fighting over `window.ethereum`. */
const announcedProviders = new Map<string, Eip6963ProviderDetail>();
let eip6963Requested = false;

function listenEip6963(): void {
  if (typeof window === "undefined" || eip6963Requested) return;
  eip6963Requested = true;
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (detail?.provider && detail.info?.uuid)
      announcedProviders.set(detail.info.uuid, detail);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

function eip6963Provider(vendor: InjectedWalletVendor): EIP1193Provider | null {
  listenEip6963();
  for (const { info, provider } of announcedProviders.values()) {
    const rdns = info.rdns?.toLowerCase() ?? "";
    if (vendor === "any") return provider;
    if (vendor === "trust" && rdns.includes("trust")) return provider;
    if (vendor === "metamask" && rdns.includes("metamask")) return provider;
  }
  return null;
}

export function readInjectedProvider(
  vendor: InjectedWalletVendor = "any",
): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  listenEip6963();
  // With several extensions installed, window.ethereum may belong to another wallet (or a
  // half-initialised proxy): prefer the provider MetaMask/Trust announce via EIP-6963.
  if (vendor !== "any") {
    const announced = eip6963Provider(vendor);
    if (announced) return announced;
  }
  let eth: InjectedWindow["ethereum"];
  try {
    eth = (window as InjectedWindow).ethereum;
  } catch {
    return eip6963Provider(vendor);
  }
  if (eth) {
    const providers = eth.providers;
    if (providers?.length) {
      if (vendor === "trust") {
        return providers.find((p) => p.isTrust) ?? (eth.isTrust ? eth : null);
      }
      if (vendor === "metamask") {
        return (
          providers.find((p) => p.isMetaMask && !p.isTrust) ??
          (!eth.isTrust ? eth : null)
        );
      }
      return eth;
    }
    if (vendor === "trust") {
      if (eth.isTrust) return eth;
    } else if (vendor === "metamask") {
      if (!eth.isTrust) return eth;
    } else {
      return eth;
    }
  }
  return eip6963Provider(vendor);
}

/**
 * In-app wallet browsers (MetaMask/Trust) sometimes inject `window.ethereum` a tick after
 * `DOMContentLoaded`, and announce via EIP-6963 on their own schedule. Race the immediate check
 * against the legacy `ethereum#initialized` event, EIP-6963 announcements, and a short poll.
 */
export function waitForInjectedProvider(
  vendor: InjectedWalletVendor = "any",
  timeoutMs = 1500,
): Promise<EIP1193Provider | null> {
  const immediate = readInjectedProvider(vendor);
  if (immediate) return Promise.resolve(immediate);
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (provider: EIP1193Provider | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("ethereum#initialized", onSignal);
      window.removeEventListener("eip6963:announceProvider", onSignal);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(provider);
    };
    const onSignal = () => {
      const found = readInjectedProvider(vendor);
      if (found) finish(found);
    };
    window.addEventListener("ethereum#initialized", onSignal);
    window.addEventListener("eip6963:announceProvider", onSignal);
    listenEip6963();
    const poll = setInterval(onSignal, 100);
    const timer = setTimeout(
      () => finish(readInjectedProvider(vendor)),
      timeoutMs,
    );
  });
}

/**
 * Switch to the People chain, adding it first if the wallet doesn't recognize it. MetaMask
 * signals "unknown chain" with code 4902; other wallets (Trust) use different codes/messages, so
 * treat any switch failure other than a user rejection (4001) as "needs adding" rather than
 * matching 4902 specifically.
 */
export async function ensurePeopleChain(
  provider: EIP1193Provider,
): Promise<void> {
  const hexId = `0x${PEOPLE_EIP155_CHAIN_ID.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
    return;
  } catch (err) {
    if ((err as { code?: number })?.code === 4001) throw err;
  }
  const chain = buildWeb3AuthChainConfig(readEvmRpcUrl());
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: hexId,
        chainName: chain.displayName,
        nativeCurrency: {
          name: chain.tickerName,
          symbol: chain.ticker,
          decimals: 18,
        },
        rpcUrls: [chain.rpcTarget],
        blockExplorerUrls: [chain.blockExplorerUrl],
      },
    ],
  });
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: hexId }],
  });
}

export const routerAbi = [
  {
    type: "function",
    name: "swapExactETHForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForETH",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "WETH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export const factoryAbi = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "decimals", type: "uint8" },
      { name: "totalSupply", type: "uint256" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "decimals", type: "uint8" },
      { name: "totalSupply", type: "uint256" },
      { name: "metadataURI", type: "string" },
      { name: "promoBps", type: "uint16" },
      { name: "leftoverMode", type: "uint8" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenCreateFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * Full launch entry point: `createToken(…, uint16 promoBps, uint8 leftoverMode)`. There is no
 * six-argument `uint8 leftoverMode` overload on the factory (it would be ambiguous with the
 * promo overload for Solidity callers).
 */
export const factoryLaunchAbi = factoryAbi;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const pairAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export type DiscoveredWallet = {
  id: string;
  name: string;
  icon?: string;
  rdns: string;
  provider: EIP1193Provider;
};

function walletRank(rdns: string): number {
  if (rdns.includes("metamask")) return 0;
  if (rdns.includes("trust")) return 2;
  return 1;
}

/**
 * EIP-6963 discovery of every installed browser wallet, MetaMask first. Falls back to a
 * legacy `window.ethereum` entry only when no wallet announced itself.
 */
export function discoverWallets(timeoutMs = 400): Promise<DiscoveredWallet[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  listenEip6963();
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const list: DiscoveredWallet[] = [...announcedProviders.values()].map(
        ({ info, provider }) => ({
          id: info.uuid,
          name: info.name || info.rdns || "Wallet",
          icon: info.icon,
          rdns: (info.rdns ?? "").toLowerCase(),
          provider,
        }),
      );
      if (list.length === 0) {
        let eth: InjectedWindow["ethereum"];
        try {
          eth = (window as InjectedWindow).ethereum;
        } catch {
          eth = undefined;
        }
        if (eth) {
          const rdns = eth.isTrust
            ? "com.trustwallet.app"
            : eth.isMetaMask
              ? "io.metamask"
              : "injected";
          list.push({
            id: "injected",
            name: eth.isTrust
              ? "Trust Wallet"
              : eth.isMetaMask
                ? "MetaMask"
                : "Browser wallet",
            rdns,
            provider: eth,
          });
        }
      }
      list.sort((a, b) => walletRank(a.rdns) - walletRank(b.rdns));
      resolve(list);
    }, timeoutMs);
  });
}
