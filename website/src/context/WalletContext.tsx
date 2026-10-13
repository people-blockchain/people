"use client";

import { addressMatchesPublicKey } from "@/lib/wallet-address-scheme";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  probeWalletAddressScheme,
  readWalletAddressSchemeConfig,
  setResolvedWalletAddressScheme,
} from "@/lib/wallet-address-scheme";
import { keyFromPrivate, type FactoryKeyPair } from "@/lib/ovn-sign";
import {
  decryptSecret,
  decryptSecretWithUpgrade,
  encryptSecret,
  loadWallets,
  removeWallet,
  upsertWallet,
  type StoredWallet,
} from "@/lib/wallet-vault";
import { exportCloudPrivateKey as exportCloudKey } from "@/lib/wallet-cloud-client";
import { isCloudSessionId } from "@/lib/wallet-cloud-client";
import {
  clearWalletSession,
  persistWalletSession,
  restoreWalletSession,
} from "@/lib/wallet-session-store";
import { isUserDisconnected } from "@/lib/wallet-disconnect";

export interface WalletSession {
  id: string;
  address: string;
  privateKey: string;
  publicKey: string;
  kind?: "local" | "cloud";
  userId?: string;
}

interface WalletContextValue {
  wallets: StoredWallet[];
  session: WalletSession | null;
  /** False until the first restore attempt (local store + resume hooks) has settled. */
  sessionHydrated: boolean;
  /** Call when an async auth/vault restore attempt has settled (success or none). */
  markSessionHydrated: () => void;
  refresh: () => void;
  saveNew: (input: {
    key: FactoryKeyPair;
    password: string;
    mnemonic?: string;
    label?: string;
    backupConfirmed?: boolean;
  }) => Promise<WalletSession>;
  unlock: (wallet: StoredWallet, password: string) => Promise<WalletSession>;
  lock: () => void;
  exportPrivateKey: (password: string) => Promise<string>;
  exportMnemonic: (password: string) => Promise<string | null>;
  forget: (id: string) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Resolves once the cloud session is actually persisted (see `connectCloud` below). */
  connectCloud: (session: WalletSession) => Promise<void>;
  exportCloudPrivateKey: () => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);
function subscribeWallets(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("people-wallets", listener);
  return () => {window.removeEventListener("storage", listener);window.removeEventListener("people-wallets", listener);};
}
const getWalletSnapshot = () => JSON.stringify(loadWallets());
const getServerWalletSnapshot = () => "[]";

function toSession(id: string, key: FactoryKeyPair): WalletSession {
  return { id, address: key.address, privateKey: key.privateKey, publicKey: key.publicKey };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeWallets, getWalletSnapshot, getServerWalletSnapshot);
  const wallets = useMemo(() => JSON.parse(snapshot) as StoredWallet[], [snapshot]);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [schemeReady, setSchemeReady] = useState(() => readWalletAddressSchemeConfig() !== "auto");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("e2e-wallet-mock") !== "1") return;
    const address =
      sessionStorage.getItem("e2e-wallet-address") ??
      "0x1111111111111111111111111111111111111111";
    setSession({
      id: "e2e-mock",
      address,
      privateKey: `0x${"22".repeat(32)}`,
      publicKey: `0x${"33".repeat(32)}`,
    });
  }, []);

  // Restore an unlocked wallet after a full page load (E2E-H2): plain <a> links and reloads
  // unmount the provider, so the session store is what keeps /create/* and /swap connected.
  // Also re-run on pageshow (bfcache), visibility, and focus — Android often returns to a
  // live document whose React tree still shows "Connect wallet" until a manual reload.
  useEffect(() => {
    let cancelled = false;
    const hydrate = () => {
      if (isUserDisconnected()) {
        setSessionHydrated(true);
        return;
      }
      void restoreWalletSession()
        .then((restored) => {
          if (cancelled) return;
          if (restored) {
            setSession((current) => current ?? restored);
            setSessionHydrated(true);
          }
        })
        .catch(() => {
          /* corrupted / unavailable storage — start locked */
        });
    };
    hydrate();
    const onShow = (event: PageTransitionEvent) => {
      // bfcache restore: effects from the frozen tree do not re-run; pull storage again.
      if (event.persisted) hydrate();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") hydrate();
    };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", hydrate);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", hydrate);
    };
  }, []);

  // Never leave the header stuck on "Checking…" if the cloud bridge is slow/unavailable.
  useEffect(() => {
    if (sessionHydrated) return;
    const timer = window.setTimeout(() => setSessionHydrated(true), 4_000);
    return () => window.clearTimeout(timer);
  }, [sessionHydrated]);

  useEffect(() => {
    if (readWalletAddressSchemeConfig() !== "auto") return;
    void probeWalletAddressScheme().then((scheme) => {
      setResolvedWalletAddressScheme(scheme);
      setSchemeReady(true);
    });
  }, []);

  const refresh = useCallback(() => {
    window.dispatchEvent(new Event("people-wallets"));
  }, []);

  const saveNew = useCallback(
    async (input: { key: FactoryKeyPair; password: string; mnemonic?: string; label?: string; backupConfirmed?: boolean }) => {
      const id = crypto.randomUUID();
      const record: StoredWallet = {
        id,
        label: input.label?.trim() || input.key.address.slice(0, 10),
        address: input.key.address,
        encryptedPrivateKey: await encryptSecret(input.key.privateKey, input.password),
        encryptedMnemonic: input.mnemonic
          ? await encryptSecret(input.mnemonic, input.password)
          : undefined,
        createdAt: Date.now(),
        backupConfirmedAt: input.backupConfirmed ? Date.now() : undefined,
      };
      upsertWallet(record);
      const next = toSession(id, input.key);
      window.dispatchEvent(new Event("people-wallets"));
      setSession(next);
      void persistWalletSession(next);
      return next;
    },
    []
  );

  const unlock = useCallback(async (wallet: StoredWallet, password: string) => {
    const { plaintext: privateKey, upgraded } = await decryptSecretWithUpgrade(
      wallet.encryptedPrivateKey,
      password
    );
    const key = keyFromPrivate(privateKey);
    if (!addressMatchesPublicKey(wallet.address, key.publicKey)) {
      throw new Error("address_mismatch");
    }
    // Opportunistically migrate legacy KDF parameters now that the password is proven.
    if (upgraded) {
      let encryptedMnemonic = wallet.encryptedMnemonic;
      if (wallet.encryptedMnemonic) {
        try {
          encryptedMnemonic = await encryptSecret(
            await decryptSecret(wallet.encryptedMnemonic, password),
            password
          );
        } catch {
          encryptedMnemonic = wallet.encryptedMnemonic;
        }
      }
      upsertWallet({ ...wallet, encryptedPrivateKey: upgraded, encryptedMnemonic });
      window.dispatchEvent(new Event("people-wallets"));
    }
    const next = toSession(wallet.id, key);
    setSession(next);
    void persistWalletSession(next);
    return next;
  }, []);

  const lock = useCallback(() => {
    setSession(null);
    void clearWalletSession();
  }, []);

  const connectCloud = useCallback(async (next: WalletSession) => {
    const userId = next.userId ?? (next.id.startsWith("cloud:") ? next.id.slice(6) : undefined);
    // Persist cloud wallets too so the header can rehydrate instantly after an Android
    // app-switch / bfcache return without waiting on /api/auth/session + vault.
    const cloud: WalletSession = { ...next, kind: "cloud", userId };
    setSession(cloud);
    setSessionHydrated(true);
    // Awaited by the caller: a sign-in that finishes by navigating (redirect resume, or the
    // popup flow leaving /login) must not do so before the IndexedDB/sessionStorage write
    // lands, or the next page's reload finds no session (the reported "logged out after
    // reload" bug) — `window.location.replace` can run before a fire-and-forget write settles.
    await persistWalletSession(cloud);
  }, []);

  const exportPrivateKey = useCallback(
    async (password: string) => {
      if (!session) throw new Error("locked");
      if (session.kind === "cloud" || isCloudSessionId(session.id)) {
        throw new Error("use_export_cloud");
      }
      const wallet = loadWallets().find((item) => item.id === session.id);
      if (!wallet) throw new Error("missing_wallet");
      const privateKey = await decryptSecret(wallet.encryptedPrivateKey, password);
      return keyFromPrivate(privateKey).privateKey;
    },
    [session]
  );

  const exportCloudPrivateKey = useCallback(async () => {
    if (!session || session.kind !== "cloud" || !session.userId) throw new Error("locked");
    const key = await exportCloudKey({
      id: session.id,
      address: session.address,
      privateKey: session.privateKey,
      publicKey: session.publicKey,
      kind: "cloud",
      userId: session.userId,
    });
    return keyFromPrivate(key).privateKey;
  }, [session]);

  const exportMnemonic = useCallback(
    async (password: string) => {
      if (!session) throw new Error("locked");
      const wallet = loadWallets().find((item) => item.id === session.id);
      if (!wallet?.encryptedMnemonic) return null;
      return decryptSecret(wallet.encryptedMnemonic, password);
    },
    [session]
  );

  const forget = useCallback(
    (id: string) => {
      if (isCloudSessionId(id)) {
        if (session?.id === id) lock();
        return;
      }
      removeWallet(id);
      if (session?.id === id) lock();
      window.dispatchEvent(new Event("people-wallets"));
    },
    [session, lock]
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!session) throw new Error("locked");
      if (newPassword.length < 8) throw new Error("min_password");
      const wallet = loadWallets().find((item) => item.id === session.id);
      if (!wallet) throw new Error("missing_wallet");
      const privateKey = await decryptSecret(wallet.encryptedPrivateKey, currentPassword);
      const key = keyFromPrivate(privateKey);
      if (key.address.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error("bad_password");
      }
      const encryptedPrivateKey = await encryptSecret(key.privateKey, newPassword);
      const encryptedMnemonic = wallet.encryptedMnemonic
        ? await encryptSecret(await decryptSecret(wallet.encryptedMnemonic, currentPassword), newPassword)
        : undefined;
      upsertWallet({ ...wallet, encryptedPrivateKey, encryptedMnemonic });
      window.dispatchEvent(new Event("people-wallets"));
    },
    [session]
  );

  const markSessionHydrated = useCallback(() => {
    setSessionHydrated(true);
  }, []);

  const value = useMemo(
    () => ({
      wallets,
      session,
      sessionHydrated,
      markSessionHydrated,
      refresh,
      saveNew,
      unlock,
      lock,
      exportPrivateKey,
      exportMnemonic,
      forget,
      changePassword,
      connectCloud,
      exportCloudPrivateKey,
    }),
    [
      wallets,
      session,
      sessionHydrated,
      markSessionHydrated,
      refresh,
      saveNew,
      unlock,
      lock,
      exportPrivateKey,
      exportMnemonic,
      forget,
      changePassword,
      connectCloud,
      exportCloudPrivateKey,
    ]
  );

  if (!schemeReady) {
    return null;
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("WalletProvider required");
  return ctx;
}
