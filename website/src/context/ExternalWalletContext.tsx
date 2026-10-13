"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Address, Hex } from "viem";
import {
  browserEvmRpcUrl,
  createBrowserPublicClient,
  createEmbeddedWalletClient,
  ensurePeopleChain,
  peopleViemChain,
  readInjectedProvider,
  waitForInjectedProvider,
  type EIP1193Provider,
  type InjectedWalletVendor,
} from "@/lib/evm/client";
import { createWalletClient, custom } from "viem";
import { useWallet } from "@/context/WalletContext";
import { DEFAULT_EVM_RPC_URL } from "@/lib/evm/public-endpoints";
import {
  WALLET_APP_REDIRECT,
  isMobileBrowser,
  walletAppDeepLink,
  type WalletAppVendor,
} from "@/lib/mobile-env";
import { walletConnectProjectIdConfigured } from "@/lib/wallet-external-connect";

export type WalletConnectorKind = "embedded" | "injected" | "walletconnect";

export type ActiveEvmSigner = {
  kind: WalletConnectorKind;
  address: Address;
  /** Embedded People wallet only. */
  privateKey?: Hex;
  provider?: EIP1193Provider;
};

interface ExternalWalletContextValue {
  signer: ActiveEvmSigner | null;
  connectInjected: (vendor?: InjectedWalletVendor) => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  connectEmbedded: () => void;
  disconnect: () => void;
}

const ExternalWalletContext = createContext<ExternalWalletContextValue | null>(null);

export function ExternalWalletProvider({ children }: { children: ReactNode }) {
  const { session } = useWallet();
  const [signer, setSigner] = useState<ActiveEvmSigner | null>(null);

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
      // Mobile wallets reject sessions whose required chain they do not know; Ethereum is the
      // required chain and the People chain is optional (added afterwards by ensurePeopleChain).
      chains: [1],
      optionalChains: [97401],
      showQrModal: true,
      rpcMap: { 97401: DEFAULT_EVM_RPC_URL },
    });
    await provider.enable();
    await ensurePeopleChain(provider as unknown as EIP1193Provider);
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
    setSigner({ kind: "injected", address, provider });
    try {
      await ensurePeopleChain(provider);
    } catch (err) {
      console.warn("[wallet] People network switch not completed", err);
    }
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
        await ensurePeopleChain(provider).catch(() => {});
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
    const onChainChanged = () => {
      void ensurePeopleChain(provider).catch(() => {});
    };
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

  const disconnect = useCallback(() => setSigner(null), []);

  const value = useMemo(
    () => ({ signer, connectInjected, connectWalletConnect, connectEmbedded, disconnect }),
    [signer, connectInjected, connectWalletConnect, connectEmbedded, disconnect]
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
  if (signer.kind === "embedded" && signer.privateKey) {
    const client = createEmbeddedWalletClient(signer.privateKey);
    // viem WriteContractParameters varies by ABI inference; runtime args are validated on-chain.
    return client.writeContract(request as never);
  }
  if (!signer.provider) throw new Error("missing_provider");
  const chain = peopleViemChain(browserEvmRpcUrl());
  const client = createWalletClient({ chain, transport: custom(signer.provider), account: signer.address });
  return client.writeContract({ ...request, account: signer.address } as never);
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
  tx: { data: Hex; value?: bigint; gas?: bigint },
): Promise<`0x${string}`> {
  if (signer.kind === "embedded" && signer.privateKey) {
    const client = createEmbeddedWalletClient(signer.privateKey);
    return client.sendTransaction({ data: tx.data, value: tx.value ?? BigInt(0), gas: tx.gas });
  }
  if (!signer.provider) throw new Error("missing_provider");
  const chain = peopleViemChain(browserEvmRpcUrl());
  const client = createWalletClient({ chain, transport: custom(signer.provider), account: signer.address });
  return client.sendTransaction({ data: tx.data, value: tx.value ?? BigInt(0), gas: tx.gas, account: signer.address } as never);
}

export { createBrowserPublicClient as readPublicClient };
