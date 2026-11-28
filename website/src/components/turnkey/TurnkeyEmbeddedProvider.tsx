"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { TurnkeyProvider, useTurnkey } from "@turnkey/react-wallet-kit";
import { readPublicTurnkeyOrganizationId } from "@/lib/turnkey-config";
import {
  parseSignRawPayload,
  readTurnkeyApiPublicKey,
  readTurnkeyRootKey,
  rememberTurnkeyApiPublicKey,
  rememberTurnkeyRootKey,
  setTurnkeyBrowserBridge,
  turnkeyAddress,
} from "@/lib/turnkey-client";
import { stampPayloadWithIndexedDbRoot } from "@/lib/turnkey-indexed-db-stamper";
import {
  asObject,
  isUsableTurnkeySession,
  readStampLoginSession,
  type KitSession,
} from "@/lib/turnkey-session";

const TURNKEY_PUBLIC_API = "https://api.turnkey.com";
/** Session length for STAMP_LOGIN sessions created from the sub-org root key. */
const TURNKEY_STAMP_LOGIN_SECONDS = 12 * 60 * 60;

function TurnkeySessionBridge({ children }: { children: ReactNode }) {
  const turnkey = useTurnkey();
  const turnkeyRef = useRef(turnkey);

  useEffect(() => {
    turnkeyRef.current = turnkey;
  }, [turnkey]);

  useEffect(() => {
    const organizationId = readPublicTurnkeyOrganizationId();
    setTurnkeyBrowserBridge({
      organizationId,
      httpClient: {
        signRawPayload: (input) => {
          const client = turnkeyRef.current.httpClient;
          if (!client) throw new Error("turnkey_client_unready");
          return client.signRawPayload(input as never);
        },
      },
      createApiKeyPair: async () => {
        const created = await turnkeyRef.current.createApiKeyPair();
        if (typeof created === "string" && created.trim()) {
          return rememberTurnkeyApiPublicKey(created);
        }
        throw new Error("invalid_client_key");
      },
      getApiKeyPublicKey: () => readTurnkeyApiPublicKey() || null,
      stampActivity: async (payload) => {
        const key = readTurnkeyApiPublicKey();
        if (!key) throw new Error("stamp_no_key");
        return stampPayloadWithIndexedDbRoot(payload, key);
      },
      signWithApiKey: async ({ message, publicKey }) => {
        const key = publicKey || readTurnkeyApiPublicKey();
        return turnkeyRef.current.signWithApiKey({ message, publicKey: key });
      },
      exportWalletAccount: async ({ address, organizationId: subOrganizationId }) => {
        await turnkeyRef.current.handleExportWalletAccount({
          address: turnkeyAddress(address),
          organizationId: subOrganizationId,
        });
      },
      exportPrivateKey: async ({ address, organizationId: subOrganizationId }) => {
        const client = turnkeyRef.current.httpClient;
        if (!client) throw new Error("turnkey_client_unready");
        const listed = asObject(await client.getPrivateKeys({ organizationId: subOrganizationId } as never));
        const keys = Array.isArray(listed?.privateKeys) ? listed.privateKeys : [];
        const want = address.trim().toLowerCase();
        const match = keys
          .map(asObject)
          .find((key) =>
            (Array.isArray(key?.addresses) ? key.addresses : []).some(
              (entry) => String(asObject(entry)?.address ?? "").toLowerCase() === want,
            ),
          );
        const privateKeyId = typeof match?.privateKeyId === "string" ? match.privateKeyId : "";
        if (!privateKeyId) return false;
        await turnkeyRef.current.handleExportPrivateKey({
          privateKeyId,
          organizationId: subOrganizationId,
        } as never);
        return true;
      },
      ensureSession: async ({ subOrganizationId }) => {
        const sub = subOrganizationId.trim();
        if (!sub) return false;
        const kit = turnkeyRef.current;
        try {
          if (isUsableTurnkeySession((await kit.getSession()) as KitSession, sub)) return true;
        } catch {
          /* no stored session */
        }
        const candidates = [...new Set([readTurnkeyRootKey(sub), readTurnkeyApiPublicKey()].filter(Boolean))];
        for (const root of candidates) {
          let sessionKey = "";
          try {
            // A fresh session key: Turnkey rejects re-registering the root key itself.
            // Use the kit directly so the remembered root key is not overwritten.
            sessionKey = await kit.createApiKeyPair();
            const body = JSON.stringify({
              type: "ACTIVITY_TYPE_STAMP_LOGIN",
              timestampMs: String(Date.now()),
              organizationId: sub,
              parameters: {
                publicKey: sessionKey,
                expirationSeconds: String(TURNKEY_STAMP_LOGIN_SECONDS),
                invalidateExisting: false,
              },
            });
            const stamp = await stampPayloadWithIndexedDbRoot(body, root);
            const res = await fetch(`${TURNKEY_PUBLIC_API}/public/v1/submit/stamp_login`, {
              method: "POST",
              headers: { "content-type": "application/json", "X-Stamp": stamp },
              body,
            });
            const token = res.ok ? readStampLoginSession(await res.json().catch(() => null)) : "";
            if (!token) throw new Error("stamp_login_failed");
            await kit.storeSession({ sessionToken: token });
            rememberTurnkeyRootKey(sub, root);
            rememberTurnkeyApiPublicKey(root);
            return true;
          } catch {
            if (sessionKey) await kit.deleteApiKeyPair({ publicKey: sessionKey }).catch(() => undefined);
          }
        }
        return false;
      },
      storeSession: (session) => turnkeyRef.current.storeSession({ sessionToken: session }),
      signRawPayload: async (input) => {
        const client = turnkeyRef.current.httpClient;
        if (!client) throw new Error("turnkey_client_unready");
        const result = await client.signRawPayload({
          organizationId: input.organizationId,
          signWith: input.signWith,
          payload: input.payload,
          encoding: input.encoding,
          hashFunction: input.hashFunction,
        });
        return parseSignRawPayload(result);
      },
    });
    return () => setTurnkeyBrowserBridge(null);
  }, []);

  return children;
}

export function TurnkeyEmbeddedProvider({ children }: { children: ReactNode }) {
  const organizationId = readPublicTurnkeyOrganizationId();
  const config = useMemo(
    () => ({
      organizationId,
      autoRefreshSession: true,
    }),
    [organizationId],
  );

  if (!organizationId) return children;

  return (
    <TurnkeyProvider config={config}>
      <TurnkeySessionBridge>{children}</TurnkeySessionBridge>
    </TurnkeyProvider>
  );
}
