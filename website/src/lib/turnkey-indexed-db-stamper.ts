/**
 * Official Turnkey browser stamper used by `@turnkey/core` / the React kit.
 * Keys live in IndexedDB (`TurnkeyStamperDB`) under the compressed P-256 public key hex
 * that `createApiKeyPair` stored — the same root registered on the sub-org.
 */
export type TurnkeyIndexedDbStamper = {
  createKeyPair: (external?: CryptoKeyPair) => Promise<string>;
  stamp: (
    payload: string,
    publicKeyHex: string,
  ) => Promise<{ stampHeaderName: string; stampHeaderValue: string }>;
};

export async function loadTurnkeyIndexedDbStamper(): Promise<TurnkeyIndexedDbStamper> {
  if (typeof window === "undefined") throw new Error("stamp_unready");
  const mod = (await import("@turnkey/core/dist/__stampers__/api/web/stamper.js")) as {
    IndexedDbStamper?: new () => TurnkeyIndexedDbStamper;
    default?: { IndexedDbStamper?: new () => TurnkeyIndexedDbStamper } | (new () => TurnkeyIndexedDbStamper);
  };
  const Ctor =
    mod.IndexedDbStamper ??
    (typeof mod.default === "function" ? mod.default : mod.default?.IndexedDbStamper);
  if (!Ctor) throw new Error("stamp_unready");
  return new Ctor();
}

export async function stampPayloadWithIndexedDbRoot(
  payload: string,
  publicKeyHex: string,
): Promise<string> {
  const stamper = await loadTurnkeyIndexedDbStamper();
  const stamped = await stamper.stamp(payload, publicKeyHex);
  if (stamped.stampHeaderName !== "X-Stamp" || !stamped.stampHeaderValue?.trim()) {
    throw new Error("invalid_stamp");
  }
  return stamped.stampHeaderValue;
}
