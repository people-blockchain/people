import { signFactoryTx, type UnsignedTx } from "@/lib/people-sign";
import { createEmbeddedWalletClient } from "@/lib/evm/client";
import { signWalletMessage } from "@/lib/partner/wallet";
import {
  createTurnkeyEmbeddedWalletClient,
  isTurnkeySession,
  signTurnkeyPeopleTx,
  signTurnkeyWalletMessage,
  type TurnkeyWalletSession,
} from "@/lib/turnkey-client";

export type SignableWalletSession = {
  kind?: "local" | "cloud" | "turnkey";
  privateKey?: string;
  address: string;
  publicKey: string;
  subOrganizationId?: string;
  walletId?: string;
};

export function sessionHasLocalKey(session: { kind?: string; privateKey?: string } | null | undefined): boolean {
  if (!session) return false;
  if (isTurnkeySession(session)) return false;
  return Boolean(session.privateKey && session.privateKey.replace(/^0x/i, "").length === 64);
}

export async function signSessionFactoryTx(session: SignableWalletSession, tx: UnsignedTx) {
  if (isTurnkeySession(session)) {
    return signTurnkeyPeopleTx(session as TurnkeyWalletSession, tx);
  }
  if (!session.privateKey) throw new Error("missing_private_key");
  return signFactoryTx(session.privateKey, tx);
}

export async function signSessionWalletMessage(session: SignableWalletSession, message: string) {
  if (isTurnkeySession(session)) {
    return signTurnkeyWalletMessage(session as TurnkeyWalletSession, message);
  }
  if (!session.privateKey) throw new Error("missing_private_key");
  return signWalletMessage(session.privateKey, message);
}

export async function createSessionEmbeddedWalletClient(session: SignableWalletSession) {
  if (isTurnkeySession(session)) {
    return createTurnkeyEmbeddedWalletClient(session as TurnkeyWalletSession);
  }
  if (!session.privateKey) throw new Error("missing_private_key");
  return createEmbeddedWalletClient(session.privateKey);
}
