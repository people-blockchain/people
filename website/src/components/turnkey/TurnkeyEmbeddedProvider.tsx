"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { TurnkeyProvider, useTurnkey } from "@turnkey/react-wallet-kit";
import "@turnkey/react-wallet-kit/styles.css";
import { readPublicTurnkeyOrganizationId } from "@/lib/turnkey-config";
import { parseSignRawPayload, setTurnkeyBrowserBridge } from "@/lib/turnkey-client";

function TurnkeySessionBridge({ children }: { children: ReactNode }) {
  const turnkey = useTurnkey();

  useEffect(() => {
    const organizationId = readPublicTurnkeyOrganizationId();
    setTurnkeyBrowserBridge({
      organizationId,
      httpClient: turnkey.httpClient
        ? { signRawPayload: (input) => turnkey.httpClient!.signRawPayload(input as never) }
        : undefined,
      createApiKeyPair: async () => {
        const created = await turnkey.createApiKeyPair();
        if (typeof created === "string" && created.trim()) return created.trim();
        throw new Error("invalid_client_key");
      },
      storeSession: (session) => turnkey.storeSession({ sessionToken: session }),
      signRawPayload: async (input) => {
        const client = turnkey.httpClient;
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
  }, [turnkey]);

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
