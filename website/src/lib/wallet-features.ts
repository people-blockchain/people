/** Feature gates — flip to true when end-to-end flows ship (Soon rows hide automatically). */
export const walletFeatures = {
  buy: false,
  /** Google / email sign-in in the unified connect modal and `/login` fallback. */
  googleOrEmailLogin: true,
  externalWallets: true,
} as const;

export const walletShowsSoonPlaceholders = true;
