"use client";

import type { IProvider } from "@web3auth/base";
import { keyFromPrivate } from "@/lib/people-sign";
import { readWeb3AuthClientId, readWeb3AuthNetworkName } from "@/lib/web3auth-config";
import { WEB3AUTH_INIT_TIMEOUT_MS, shouldUseRedirectSignIn, withTimeout } from "@/lib/mobile-env";
import { buildWeb3AuthChainConfig } from "@/lib/web3auth-chain-config";
import { hasWeb3AuthRedirectResult } from "@/lib/web3auth-redirect-resume";
import {
  assertAuthAdapterReady,
  authAdapterStatus,
  beginWeb3AuthConnect,
  buildAuthModalConfig,
  hideWeb3AuthModal,
  suppressWeb3AuthModal,
  type Web3AuthLoginMethod,
} from "@/lib/web3auth-connect-flow";

export type { Web3AuthLoginMethod } from "@/lib/web3auth-connect-flow";
export {
  beginWeb3AuthConnect,
  canReuseRestoredSession,
  endRestoredWeb3AuthSession,
  hasRestoredWeb3AuthSession,
  idTokenIssuedAtSec,
  isRestoredIdTokenFresh,
  prepareRestoredSessionForConnect,
  restoredSessionEmailMatches,
  shouldEndRestoredSessionBeforeConnect,
  RESTORED_ID_TOKEN_MAX_AGE_SEC,
  RESTORED_SESSION_PREP_TIMEOUT_MS,
} from "@/lib/web3auth-connect-flow";

export type Web3AuthInstance = {
  connectTo: (adapter: string, params?: Record<string, unknown>) => Promise<IProvider | null>;
  authenticateUser: () => Promise<{ idToken: string }>;
  getUserInfo: () => Promise<{ email?: string; name?: string }>;
  connected: boolean;
  provider: IProvider | null;
  logout?: () => Promise<void>;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  walletAdapters?: Record<string, { status?: string } | undefined>;
  loginModal?: { closeModal?: () => void };
};

/** Page the Google/email redirect returns to — must be on a whitelisted origin. */
export const WEB3AUTH_REDIRECT_PATH = "/login";

let initPromise: Promise<Web3AuthInstance | null> | null = null;
let redirectResultPending = false;

/**
 * True once per page load when this load came back from the Web3Auth redirect. Captured before
 * init, because the SDK strips the result from the URL while it restores the session.
 */
export function consumeWeb3AuthRedirectResult(): boolean {
  const had = redirectResultPending;
  redirectResultPending = false;
  return had;
}

async function initWeb3Auth(): Promise<Web3AuthInstance | null> {
  if (typeof window === "undefined") return null;
  const clientId = readWeb3AuthClientId();
  if (!clientId) return null;
  redirectResultPending = hasWeb3AuthRedirectResult(window.location.search, window.location.hash);

  const [{ Web3Auth }, { EthereumPrivateKeyProvider }, { WEB3AUTH_NETWORK }] =
    await Promise.all([
      import("@web3auth/modal"),
      import("@web3auth/ethereum-provider"),
      import("@web3auth/base"),
    ]);

  const chainConfig = buildWeb3AuthChainConfig();

  const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });
  const network =
    readWeb3AuthNetworkName() === "sapphire_mainnet"
      ? WEB3AUTH_NETWORK.SAPPHIRE_MAINNET
      : WEB3AUTH_NETWORK.SAPPHIRE_DEVNET;

  // Android Chrome blocks or orphans the auth popup, so the promise never settles and the
  // UI sits on "Signing in…". Mobile uses a full-page redirect; /login resumes the session.
  const uxMode = shouldUseRedirectSignIn() ? "redirect" : "popup";
  // Before the SDK mounts its modal: a redirect return would otherwise flash it.
  hideWeb3AuthModal(document);
  const web3auth = new Web3Auth({
    clientId,
    web3AuthNetwork: network,
    privateKeyProvider,
    // initModal re-applies uiConfig.uxMode (merged with the dashboard whitelabel) onto the
    // adapter; pin it so a dashboard setting cannot flip mobile back to the popup.
    uiConfig: { uxMode, displayErrorsOnModal: false },
  });

  const { AuthAdapter } = await import("@web3auth/auth-adapter");
  const authAdapter = new AuthAdapter({
    adapterSettings: {
      uxMode,
      // Must be on the Web3Auth dashboard whitelist (https://peopleblockchain.network/login, www).
      redirectUrl: `${window.location.origin}${WEB3AUTH_REDIRECT_PATH}`,
    },
  });
  web3auth.configureAdapter(authAdapter);

  await web3auth.initModal({
    hideWalletDiscovery: true,
    modalConfig: buildAuthModalConfig(),
  });

  suppressWeb3AuthModal(web3auth as unknown as Web3AuthInstance);

  // initModal swallows adapter init errors; a not-ready adapter makes connectTo hang silently.
  const instance = web3auth as unknown as Web3AuthInstance;
  assertAuthAdapterReady(instance);
  console.info("[wallet] web3auth ready", { uxMode, adapter: authAdapterStatus(instance) });
  return instance;
}

export async function getWeb3Auth(): Promise<Web3AuthInstance | null> {
  if (!readWeb3AuthClientId()) return null;
  if (!initPromise) {
    // Drop a failed or stuck init so the next call (the Retry button) starts over.
    const attempt = withTimeout(initWeb3Auth(), WEB3AUTH_INIT_TIMEOUT_MS, "web3auth_init_timeout");
    initPromise = attempt;
    attempt.catch(() => {
      if (initPromise === attempt) initPromise = null;
    });
  }
  return initPromise;
}

/** Preload Web3Auth during page render so sign-in clicks can open popups synchronously. */
export function warmWeb3Auth(): void {
  getWeb3Auth().catch(() => {});
}

export async function connectWeb3Auth(method: Web3AuthLoginMethod, emailHint?: string) {
  const web3auth = await getWeb3Auth();
  if (!web3auth) throw new Error("web3auth_not_configured");
  return beginWeb3AuthConnect(web3auth, method, emailHint);
}

export async function extractSecp256k1PrivateKey(provider: IProvider): Promise<string> {
  const attempts = ["private_key", "eth_private_key", "0x_private_key"];
  for (const method of attempts) {
    try {
      const raw = await provider.request({ method });
      if (typeof raw === "string" && raw.replace(/^0x/, "").length >= 64) {
        return raw.replace(/^0x/, "").slice(0, 64).toLowerCase();
      }
    } catch {
      /* try next */
    }
  }
  throw new Error("web3auth_private_key_unavailable");
}

export async function keyPairFromWeb3AuthProvider(provider: IProvider) {
  const privateKey = await extractSecp256k1PrivateKey(provider);
  return keyFromPrivate(privateKey);
}
