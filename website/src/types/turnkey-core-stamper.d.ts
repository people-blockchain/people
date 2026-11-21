declare module "@turnkey/core/dist/__stampers__/api/web/stamper.js" {
  export class IndexedDbStamper {
    constructor();
    createKeyPair(externalKeyPair?: CryptoKeyPair): Promise<string>;
    stamp(
      payload: string,
      publicKeyHex: string,
    ): Promise<{ stampHeaderName: string; stampHeaderValue: string }>;
    sign(payload: string, publicKeyHex: string, format?: string): Promise<string>;
  }
}
