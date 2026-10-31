/** Active wallet for a direct upload. The wallet provider registers it; tests inject their own. */

export type DirectUploadSigner = {
  address: string;
  signMessage: (message: string) => Promise<string>;
};

let current: DirectUploadSigner | null = null;

export function setDirectUploadSigner(signer: DirectUploadSigner | null): void {
  current = signer;
}

export function getDirectUploadSigner(): DirectUploadSigner | null {
  return current;
}
