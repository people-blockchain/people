"use client";

import { signOut } from "next-auth/react";

export const USER_DISCONNECTED_KEY = "people_user_disconnected";

export function isUserDisconnected(): boolean {
  try {
    return localStorage.getItem(USER_DISCONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markUserDisconnected(): void {
  try {
    localStorage.setItem(USER_DISCONNECTED_KEY, "1");
  } catch {
    /* storage disabled */
  }
}

export function clearUserDisconnected(): void {
  try {
    localStorage.removeItem(USER_DISCONNECTED_KEY);
  } catch {
    /* storage disabled */
  }
}

/** Clears wagmi / WalletConnect persisted connector state when present. */
export function clearExternalWalletPersistence(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith("wagmi.") ||
        key.startsWith("wc@2:") ||
        key.toLowerCase().includes("walletconnect")
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* storage disabled */
  }
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("wagmi.") || key.startsWith("wc@2:")) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* storage disabled */
  }
}

export async function logoutWeb3AuthSession(): Promise<void> {
  try {
    const { endRestoredWeb3AuthSession, getWeb3Auth, hasRestoredWeb3AuthSession } = await import(
      "@/lib/web3auth-client"
    );
    const web3auth = await getWeb3Auth();
    if (!web3auth) return;
    // Right after rehydration the SDK `connected` flag can be false while the Auth adapter
    // still reports "connected"; hasRestoredWeb3AuthSession accepts either, and
    // endRestoredWeb3AuthSession disconnects the adapter logout alone would leave behind.
    if (!hasRestoredWeb3AuthSession(web3auth)) return;
    await endRestoredWeb3AuthSession(web3auth);
  } catch {
    /* best-effort */
  }
}

export type DisconnectPeopleWalletOptions = {
  lock: () => void;
  disconnectExternal?: () => void;
};

/** Full disconnect: block auto-reconnect until the user connects again. */
export async function disconnectPeopleWallet(options: DisconnectPeopleWalletOptions): Promise<void> {
  markUserDisconnected();
  clearExternalWalletPersistence();
  options.disconnectExternal?.();
  options.lock();
  await logoutWeb3AuthSession();
  try {
    await signOut({ redirect: false });
  } catch {
    /* session may already be gone */
  }
}
