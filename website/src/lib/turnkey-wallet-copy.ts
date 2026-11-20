/**
 * English-only public copy for the Turnkey embedded wallet. Other locales fall back here.
 */
export const turnkeyWalletCopy = {
  heading: "People Wallet",
  lead: "Your People Wallet is secured by a hardware-backed key. Sign in with the same PEOPLE account you already use.",
  opening: "Opening wallet…",
  otpHeading: "Confirm it is you",
  otpLead: "We sent a one-time code to your email so this browser can sign with your People Wallet.",
  otpPlaceholder: "6-character code",
  otpSend: "Send code",
  otpVerify: "Verify and continue",
  passkeyCta: "Use a passkey",
  passkeyRegister: "Add a passkey for this device",
  importHeading: "Keep your existing wallet",
  importLead:
    "You already have a People Wallet. We will move the key into hardware-backed storage on this device. The address stays the same.",
  importConfirm: "Move my existing wallet",
  importMismatch:
    "This account’s stored wallet cannot be moved automatically (the recovered key does not match the saved address). You can keep using the previous wallet on this device, or restore from a backup you exported.",
  importFailed: "Could not move the existing wallet. You can retry after signing in again.",
  unavailable: "People Wallet is temporarily unavailable.",
  createFailed: "Could not create a People Wallet. Try again after signing in.",
  sessionFailed: "Could not open the People Wallet session. Send a new code and try again.",
} as const;

export type TurnkeyWalletCopy = typeof turnkeyWalletCopy;
