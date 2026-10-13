/** A verifier only needs the public genesis address. Signing requires a secret. */
export function resolveFaucetIdentity(
  env: { DEV_FAUCET_PRIVATE_KEY?: string; GENESIS_FAUCET_ADDRESS?: string },
  deriveAddress: (privateKey: string) => string
): { privateKey: string; address: string } {
  const privateKey = env.DEV_FAUCET_PRIVATE_KEY?.trim() ?? "";
  const publicAddress = env.GENESIS_FAUCET_ADDRESS?.trim().toLowerCase() ?? "";
  if (privateKey && !/^[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("Invalid DEV_FAUCET_PRIVATE_KEY");
  if (publicAddress && !/^0x[0-9a-f]{40}$/.test(publicAddress)) throw new Error("Invalid GENESIS_FAUCET_ADDRESS");
  const derivedAddress = privateKey ? deriveAddress(privateKey) : "";
  if (publicAddress && derivedAddress && publicAddress !== derivedAddress) throw new Error("Faucet key does not match GENESIS_FAUCET_ADDRESS");
  const address = publicAddress || derivedAddress;
  if (!address) throw new Error("Set GENESIS_FAUCET_ADDRESS; only faucet nodes need DEV_FAUCET_PRIVATE_KEY");
  return { privateKey, address };
}
