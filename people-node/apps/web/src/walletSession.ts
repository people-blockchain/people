import type { StoredWallet } from "./walletStorage.js";
import { keyPairFromPrivateKey } from "./peopleClient.js";

export interface SessionWallet {
  id: string;
  label: string;
  address: string;
  privateKey: string;
  persisted: boolean;
}

export interface PendingWalletReveal {
  label: string;
  address: string;
  privateKey: string;
  mnemonic: string;
  saveLocally: boolean;
  password: string;
  confirmIndices: number[];
}

/** Labels frozen at login time (any locale / wording) — resolve via i18n at display. */
const GENERIC_SESSION_LABELS = new Set([
  "",
  "Connected wallet",
  "Wallet connected",
  "Подключённый кошелёк",
  "Кошелёк подключен"
]);

/** Status text for ephemeral key sessions; custom saved-wallet names pass through. */
export function displaySessionLabel(label: string | undefined, connectedLabel: string): string {
  const trimmed = label?.trim() ?? "";
  if (GENERIC_SESSION_LABELS.has(trimmed)) {
    return connectedLabel;
  }
  return trimmed;
}

export function sessionFromKey(privateKey: string, label = ""): SessionWallet {
  const key = keyPairFromPrivateKey(privateKey);
  return {
    id: `session-${key.address}`,
    label,
    address: key.address,
    privateKey: key.privateKey,
    persisted: false
  };
}

export function sessionFromStored(wallet: StoredWallet, privateKey: string): SessionWallet {
  return {
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    privateKey,
    persisted: true
  };
}
