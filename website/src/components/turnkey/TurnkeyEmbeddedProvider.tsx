"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { TurnkeyProvider, useTurnkey } from "@turnkey/react-wallet-kit";
import "@turnkey/react-wallet-kit/styles.css";
import { readPublicTurnkeyOrganizationId } from "@/lib/turnkey-config";
import {
  parseSignRawPayload,
  readTurnkeyApiPublicKey,
  rememberTurnkeyApiPublicKey,
  setTurnkeyBrowserBridge,
} from "@/lib/turnkey-client";

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
      signWithApiKey: async ({ message, publicKey }) => {
        const key = publicKey || readTurnkeyApiPublicKey();
        return turnkeyRef.current.signWithApiKey({ message, publicKey: key });
      },
      exportWalletAccount: async ({ address, organizationId: subOrganizationId }) => {
        await turnkeyRef.current.handleExportWalletAccount({
          address,
          organizationId: subOrganizationId,
        });
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
