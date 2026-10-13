export const FOUNDERS_WORLD_ID_EXPECTED_ENV = "production" as const;

/** UI gate — set NEXT_PUBLIC_FOUNDERS_WORLD_ID_UI_ENABLED=true to show World ID on /founders. */
export function foundersWorldIdUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FOUNDERS_WORLD_ID_UI_ENABLED === "true";
}

export function foundersWorldIdAction(): string {
  const raw = process.env.FOUNDERS_WORLD_ID_ACTION?.trim();
  return raw || "founders-level-2";
}

export function readFoundersWorldIdConfig():
  | { appId: string; rpId: string; signingKeyHex: string; action: string }
  | null {
  const appId = process.env.FOUNDERS_WORLD_ID_APP_ID?.trim();
  const rpId = process.env.FOUNDERS_WORLD_ID_RP_ID?.trim();
  const signingKeyHex = process.env.FOUNDERS_WORLD_ID_SIGNING_KEY?.trim();
  if (!appId || !rpId || !signingKeyHex) return null;
  return { appId, rpId, signingKeyHex, action: foundersWorldIdAction() };
}
