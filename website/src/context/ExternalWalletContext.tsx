"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isAddress, type Address, type Hex } from "viem";
import {
  browserEvmRpcUrl,
  createBrowserPublicClient,
  createEmbeddedWalletClient,
  ensureSaleChain,
  peopleViemChain,
  readInjectedProvider,
  waitForInjectedProvider,
  type EIP1193Provider,
  type InjectedWalletVendor,
} from "@/lib/evm/client";
import { createWalletClient, custom } from "viem";
import { useWallet } from "@/context/WalletContext";
import { DEFAULT_EVM_RPC_URL } from "@/lib/evm/public-endpoints";
import { preflightAndSend } from "@/lib/evm/tx-preflight";
import { preflightWriteContract, type PreflightWriteRequest } from "@/lib/evm/preflight-write";
import {
  WALLET_APP_REDIRECT,
  isMobileBrowser,
  walletAppDeepLink,
  type WalletAppVendor,
} from "@/lib/mobile-env";
import { walletConnectProjectIdConfigured } from "@/lib/wallet-external-connect";
import { SALE_CHAIN } from "@/lib/sale/config";
import { PeopleMobileProvider } from "@/lib/mobile-wallet/browser";
import type { MobileSession } from "@/lib/mobile-wallet/service";

export type WalletConnectorKind = "embedded" | "injected" | "walletconnect" | "people-mobile";

export type ActiveEvmSigner = {
  kind: WalletConnectorKind;
  address: Address;
  /** Embedded People wallet only. */
  privateKey?: Hex;
  provider?: EIP1193Provider;
};

const BASE_CHAIN_ID = SALE_CHAIN.id;

function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = value.startsWith("0x") ? parseInt(value, 16) : Number(value);
  return Number.isFinite(n) ? n : null;
}

interface ExternalWalletContextValue {
  signer: ActiveEvmSigner | null;
  /** Chain id the connected external wallet is on (null if unknown or embedded). */
  chainId: number | null;
  /** Asks the wallet to switch to Base (adds it if needed). Resolves false if declined. */
  switchToBase: () => Promise<boolean>;
  /** Lets the wallet dialog hide itself while the WalletConnect QR is shown, and reopen on failure. */
  setWalletConnectHooks: (hooks: { onOpen?: () => void; onFailed?: () => void }) => void;
  connectInjected: (vendor?: InjectedWalletVendor) => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  connectEmbedded: () => void;
  connectPeopleMobile: (session: MobileSession, browserToken: string) => void;
  disconnect: () => void;
}

const ExternalWalletContext = createContext<ExternalWalletContextValue | null>(null);

export function ExternalWalletProvider({ children }: { children: ReactNode }) {
  const { session } = useWallet();
  const [signer, setSigner] = useState<ActiveEvmSigner | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const onWalletConnectOpenRef = useRef<(() => void) | null>(null);
  const onWalletConnectFailedRef = useRef<(() => void) | null>(null);
  const activeMobileProvider = useRef<PeopleMobileProvider | null>(null);
  const connectPeopleMobile = useCallback((session: MobileSession, browserToken: string) => {
    const expiry = Date.parse(session.expiresAt);
    if (session.chainId !== 97401 || session.origin !== window.location.origin || !/^[0-9a-f]{32}$/.test(session.id) || !/^[0-9a-f]{64}$/.test(browserToken) || !isAddress(session.address, { strict: true }) || !Array.isArray(session.methods) || session.methods.length !== 1 || session.methods[0] !== "personal_sign" || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 930_000) throw new Error("invalid_mobile_session");
    setSigner({ kind: "people-mobile", address: session.address, provider: new PeopleMobileProvider(session, browserToken) });
  }, []);

  const connectEmbedded = useCallback(() => {
    if (!session) return;
    // Must match WalletContext session.address (balance + explorer use this id).
    setSigner({
      kind: "embedded",
      address: session.address as Address,
      privateKey: session.privateKey as Hex,
    });
  }, [session]);

  const connectWalletConnect = useCallback(async () => {
    const projectId = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "").trim();
    if (!projectId) throw new Error("walletconnect_unconfigured");
    const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
    const provider = await EthereumProvider.init({
      projectId,
      // The sale chain (Base, or Base Sepolia on the test sale) is the required chain. Ethereum and
      // the People chain are optional (the People chain is only used by explicit actions such as the
      // multisig panel); on the test sale Base mainnet stays reachable as optional.
      chains: [SALE_CHAIN.id],
      optionalChains: SALE_CHAIN.testnet ? [1, 97401, 8453] : [1, 97401],
      showQrModal: true,
      rpcMap: { 97401: DEFAULT_EVM_RPC_URL, ...(SALE_CHAIN.testnet ? { [SALE_CHAIN.id]: SALE_CHAIN.rpcUrl } : {}) },
    });
    // Let the caller hide the site dialog so the WalletConnect QR is not stacked underneath it.
    onWalletConnectOpenRef.current?.();
    try {
      await provider.enable();
    } catch (error) {
      onWalletConnectFailedRef.current?.();
      throw error;
    }
    const accounts = provider.accounts as Address[];
    setSigner({
      kind: "walletconnect",
      address: accounts[0],
      provider: provider as unknown as EIP1193Provider,
    });
  }, []);

  const connectInjected = useCallback(async (vendor: InjectedWalletVendor = "any") => {
    // Inside a wallet's in-app browser the user may tap a different vendor's button (e.g.
    // "MetaMask" inside Trust): use whatever wallet is injected instead of failing.
    const provider =
      (await waitForInjectedProvider(vendor)) ?? (vendor !== "any" ? readInjectedProvider("any") : null);
    if (!provider) {
      // Mobile browsers have no extensions: reopen this page inside the wallet app instead.
      const noWalletAtAll = !(window as { ethereum?: unknown }).ethereum;
      if ((vendor === "metamask" || vendor === "trust") && isMobileBrowser() && noWalletAtAll) {
        window.location.assign(walletAppDeepLink(vendor as WalletAppVendor, window.location.href));
        throw new Error(WALLET_APP_REDIRECT);
      }
      // Desktop with no extension: WalletConnect's QR flow reaches the same wallets without
      // requiring an install, so prefer it over a dead end when it's configured.
      if (walletConnectProjectIdConfigured()) {
        await connectWalletConnect();
        return;
      }
      throw new Error("no_injected_provider");
    }
    // Request access before touching the chain: wallets (notably mobile in-app browsers) refuse
    // wallet_switchEthereumChain/wallet_addEthereumChain for an origin that hasn't been granted
    // accounts yet, so switching first aborted the connection before the user was ever asked.
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
    const address = accounts[0];
    if (!address) throw new Error("no_account");
    // The account is authorized at this point: connect it even if the network switch is
    // declined or unsupported (MetaMask Mobile often rejects add/switch until the chain is in
    // its list). Writes re-check the chain through viem and report a wrong network clearly;
    // failing the whole connect here is what made "Connect MetaMask" look broken.
    // Connecting never switches the network: the sale needs Base, and Base is requested only when
    // the user presses "Buy" or "Switch to Base".
    setSigner({ kind: "injected", address, provider });
  }, [connectWalletConnect]);

  // Restore a previously authorized injected connection silently (no prompt) — covers both a
  // page refresh and the MetaMask/Trust in-app browser reopening the page after the deep link.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Prefer MetaMask: Trust Wallet's extension hijacks window.ethereum when both are installed.
        const provider = readInjectedProvider("metamask") ?? readInjectedProvider("any");
        if (!provider) return;
        const accounts = (await provider.request({ method: "eth_accounts" })) as Address[];
        const address = accounts[0];
        if (!active || !address) return;
        if (!active) return;
        setSigner((prev) => prev ?? { kind: "injected", address, provider });
      } catch {
        /* no previously authorized account */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Keep the signer in sync with wallet-side account/network switches.
  useEffect(() => {
    const provider = signer?.kind === "injected" ? signer.provider : undefined;
    // Never detach provider methods: MetaMask's inpage `on` uses `this` (_warnOfDeprecation)
    // and throws when called unbound, which crashed the whole page.
    if (!provider || typeof provider.on !== "function") return;
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as Address[] | undefined;
      const next = accounts?.[0];
      if (!next) {
        setSigner(null);
        return;
      }
      setSigner((prev) => (prev && prev.kind === "injected" ? { ...prev, address: next } : prev));
    };
    const onChainChanged = (...args: unknown[]) => {
      setChainId(parseChainId(args[0]));
    };
    void provider
      .request({ method: "eth_chainId" })
      .then((id) => setChainId(parseChainId(id)))
      .catch(() => setChainId(null));
    try {
      provider.on("accountsChanged", onAccountsChanged);
      provider.on("chainChanged", onChainChanged);
    } catch (error) {
      console.warn("[wallet] provider listeners unavailable", error);
    }
    return () => {
      try {
        provider.removeListener?.("accountsChanged", onAccountsChanged);
        provider.removeListener?.("chainChanged", onChainChanged);
      } catch {
        /* wallet provider went away */
      }
    };
  }, [signer]);

  const disconnect = useCallback(() => {
    if (signer?.kind === "people-mobile" && signer.provider instanceof PeopleMobileProvider) void signer.provider.disconnect().catch(() => {});
    setSigner(null);
  }, [signer]);
  useEffect(() => {
    const provider = signer?.kind === "people-mobile" && signer.provider instanceof PeopleMobileProvider ? signer.provider : null;
    const previous = activeMobileProvider.current;
    if (previous && previous !== provider) void previous.disconnect().catch(() => {});
    activeMobileProvider.current = provider;
    if (!provider) return;
    const ended = () => setSigner(previous => previous?.provider === provider ? null : previous);
    provider.on("disconnect", ended); provider.startMonitoring();
    // Strict Mode replays setup/cleanup. Only stop observation here; replacing the
    // actual signer above or an explicit disconnect ends the remote session.
    return () => { provider.removeListener("disconnect", ended); provider.stopMonitoring(); };
  }, [signer]);

  // Chain of the connected external wallet (null for embedded / unknown).
  useEffect(() => {
    const provider = signer && signer.kind !== "embedded" ? signer.provider : undefined;
    if (!provider) {
      setChainId(null);
      return;
    }
    if (signer?.kind === "injected") return; // handled by the listener effect above
    let active = true;
    void provider
      .request({ method: "eth_chainId" })
      .then((id) => active && setChainId(parseChainId(id)))
      .catch(() => active && setChainId(null));
    const onChain = (...args: unknown[]) => setChainId(parseChainId(args[0]));
    try {
      provider.on?.("chainChanged", onChain);
    } catch {
      /* provider without events */
    }
    return () => {
      active = false;
      try {
        provider.removeListener?.("chainChanged", onChain);
      } catch {
        /* provider went away */
      }
    };
  }, [signer]);

  const switchToBase = useCallback(async (): Promise<boolean> => {
    const provider = signer && signer.kind !== "embedded" ? signer.provider : undefined;
    if (!provider) return false;
    const ok = await ensureSaleChain(provider);
    if (ok) setChainId(BASE_CHAIN_ID);
    return ok;
  }, [signer]);

  const setWalletConnectHooks = useCallback((hooks: { onOpen?: () => void; onFailed?: () => void }) => {
    onWalletConnectOpenRef.current = hooks.onOpen ?? null;
    onWalletConnectFailedRef.current = hooks.onFailed ?? null;
  }, []);

  const value = useMemo(
    () => ({ signer, chainId, switchToBase, setWalletConnectHooks, connectInjected, connectWalletConnect, connectEmbedded, connectPeopleMobile, disconnect }),
    [signer, chainId, switchToBase, setWalletConnectHooks, connectInjected, connectWalletConnect, connectEmbedded, connectPeopleMobile, disconnect]
  );

  return <ExternalWalletContext.Provider value={value}>{children}</ExternalWalletContext.Provider>;
}

export function useExternalWallet() {
  const ctx = useContext(ExternalWalletContext);
  if (!ctx) throw new Error("ExternalWalletProvider missing");
  return ctx;
}

/** Non-EVM chain mode renders without ExternalWalletProvider; use this where that's valid. */
export function useExternalWalletOptional() {
  return useContext(ExternalWalletContext);
}

export async function writeViaActiveSigner(signer: ActiveEvmSigner, request: Record<string, unknown>) {
  // Simulate + estimate first: a call that would revert is never signed or sent, and the gas limit
  // is the node's estimate + 20% (any `gas` a caller passes is ignored). See lib/evm/tx-preflight.
  const write = request;
  return preflightWriteContract(
    createBrowserPublicClient(),
    signer.address,
    request as unknown as PreflightWriteRequest,
    async (gas) => {
      if (signer.kind === "embedded" && signer.privateKey) {
        const client = createEmbeddedWalletClient(signer.privateKey);
        // viem WriteContractParameters varies by ABI inference; runtime args are validated on-chain.
        return client.writeContract({ ...write, gas } as never);
      }
      if (!signer.provider) throw new Error("missing_provider");
      const chain = peopleViemChain(browserEvmRpcUrl());
      const client = createWalletClient({ chain, transport: custom(signer.provider), account: signer.address });
      return client.writeContract({ ...write, gas, account: signer.address } as never);
    },
  );
}

/** Sign a plain text message (EIP-191 `personal_sign`) through the active signer. */
export async function signViaActiveSigner(signer: ActiveEvmSigner, message: string): Promise<Hex> {
  if (signer.kind === "embedded" && signer.privateKey) {
    const client = createEmbeddedWalletClient(signer.privateKey);
    return client.signMessage({ message });
  }
  if (!signer.provider) throw new Error("missing_provider");
  const chain = peopleViemChain(browserEvmRpcUrl());
  const client = createWalletClient({ chain, transport: custom(signer.provider), account: signer.address });
  return client.signMessage({ account: signer.address, message });
}

/**
 * Send a `to`-less transaction (contract creation) through the active signer. Mirrors
 * `writeViaActiveSigner` for the deploy path: the embedded People wallet signs locally,
 * a connected EVM provider (MetaMask / Trust / WalletConnect) signs via eth_sendTransaction.
 */
export async function sendViaActiveSigner(
  signer: ActiveEvmSigner,
  tx: { data: Hex; value?: bigint },
): Promise<`0x${string}`> {
  const value = tx.value ?? BigInt(0);
  return preflightAndSend(
    createBrowserPublicClient(),
    async ({ gas }) => {
      if (signer.kind === "embedded" && signer.privateKey) {
        const client = createEmbeddedWalletClient(signer.privateKey);
        return client.sendTransaction({ data: tx.data, value, gas });
      }
      if (!signer.provider) throw new Error("missing_provider");
      const chain = peopleViemChain(browserEvmRpcUrl());
      const client = createWalletClient({ chain, transport: custom(signer.provider), account: signer.address });
      return client.sendTransaction({ data: tx.data, value, gas, account: signer.address } as never);
    },
    { account: signer.address, data: tx.data, value },
  );
}

export { createBrowserPublicClient as readPublicClient };
