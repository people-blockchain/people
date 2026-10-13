export function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function addressPath(address: string): string {
  return `/address/${encodeURIComponent(address)}`;
}
