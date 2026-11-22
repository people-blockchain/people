import { readTurnkeyServerConfig, type TurnkeyServerConfig } from "@/lib/turnkey-config";
import { TURNKEY_ETHEREUM_ACCOUNT } from "@/lib/people-chain-names";

export type TurnkeyApiKeyInput = {
  apiKeyName: string;
  publicKey: string;
  curveType?: "API_KEY_CURVE_P256";
};

export type TurnkeyAuthenticatorInput = {
  authenticatorName: string;
  challenge: string;
  attestation: Record<string, unknown>;
};

export type CreateSubOrganizationInput = {
  subOrganizationName: string;
  userName: string;
  userEmail?: string;
  apiKeys?: TurnkeyApiKeyInput[];
  authenticators?: TurnkeyAuthenticatorInput[];
  /** When true, also create the default Ethereum account. Skip for vault-key import. */
  createWallet: boolean;
};

export type CreateSubOrganizationResult = {
  subOrganizationId: string;
  turnkeyUserId?: string;
  walletId?: string;
  addresses: string[];
};

export type InitOtpInput = {
  organizationId: string;
  otpType: "OTP_TYPE_EMAIL";
  contact: string;
  userIdentifier?: string;
};

export type VerifyOtpInput = {
  otpId: string;
  encryptedOtpBundle: string;
};

export type OtpLoginInput = {
  organizationId: string;
  verificationToken: string;
  publicKey: string;
  expirationSeconds?: string;
  clientSignature: {
    publicKey: string;
    scheme: "CLIENT_SIGNATURE_SCHEME_API_P256";
    message: string;
    signature: string;
  };
};

export type TurnkeyApi = {
  createSubOrganization(input: CreateSubOrganizationInput): Promise<CreateSubOrganizationResult>;
  initOtp(input: InitOtpInput): Promise<{ otpId: string; otpEncryptionTargetBundle: string }>;
  verifyOtp(input: VerifyOtpInput): Promise<{ verificationToken: string }>;
  otpLogin(input: OtpLoginInput): Promise<{ session: string }>;
};

let injected: TurnkeyApi | null = null;
let liveClient: TurnkeyApi | null = null;

export function setTurnkeyApiForTests(api: TurnkeyApi | null): void {
  injected = api;
}

export function resetTurnkeyApiClient(): void {
  liveClient = null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
      continue;
    }
    const rec = asRecord(item);
    const address = asString(rec?.address);
    if (address) out.push(address);
  }
  return out;
}

export function parseCreateSubOrganizationResult(response: unknown): CreateSubOrganizationResult {
  const root = asRecord(response);
  const activity = asRecord(root?.activity);
  const result = asRecord(activity?.result) ?? asRecord(root?.activity) ?? root;
  const nested =
    asRecord(result?.createSubOrganizationResultV7) ??
    asRecord(result?.createSubOrganizationResultV8) ??
    asRecord(result?.createSubOrganizationResultV9) ??
    asRecord(result?.createSubOrganizationResult) ??
    result;
  const subOrganizationId =
    asString(nested?.subOrganizationId) ?? asString(root?.subOrganizationId);
  if (!subOrganizationId) throw new Error("turnkey_suborg_missing");
  const wallet = asRecord(nested?.wallet);
  const rootUserIds = asStringArray(nested?.rootUserIds);
  return {
    subOrganizationId,
    turnkeyUserId: rootUserIds[0],
    walletId: asString(wallet?.walletId),
    addresses: asStringArray(wallet?.addresses),
  };
}

export function parseInitOtp(response: unknown): { otpId: string; otpEncryptionTargetBundle: string } {
  const root = asRecord(response);
  const activity = asRecord(root?.activity);
  const result = asRecord(activity?.result);
  const nested = asRecord(result?.initOtpResultV2) ?? asRecord(result?.initOtpResult) ?? result;
  const otpId = asString(nested?.otpId) ?? asString(root?.otpId);
  const otpEncryptionTargetBundle =
    asString(nested?.otpEncryptionTargetBundle) ?? asString(root?.otpEncryptionTargetBundle);
  if (!otpId) throw new Error("turnkey_otp_missing");
  if (!otpEncryptionTargetBundle) throw new Error("turnkey_otp_bundle_missing");
  return { otpId, otpEncryptionTargetBundle };
}

export function parseVerificationToken(response: unknown): string {
  const root = asRecord(response);
  const activity = asRecord(root?.activity);
  const result = asRecord(activity?.result);
  const nested = asRecord(result?.verifyOtpResult) ?? result;
  const token = asString(nested?.verificationToken) ?? asString(root?.verificationToken);
  if (!token) throw new Error("turnkey_otp_verify_failed");
  return token;
}

function parseSession(response: unknown): string {
  const root = asRecord(response);
  const activity = asRecord(root?.activity);
  const result = asRecord(activity?.result);
  const nested = asRecord(result?.otpLoginResult) ?? result;
  const session = asString(nested?.session) ?? asString(root?.session);
  if (!session) throw new Error("turnkey_session_missing");
  return session;
}

export function parseImportBundle(response: unknown): string {
  const root = asRecord(response);
  const activity = asRecord(root?.activity);
  const result = asRecord(activity?.result);
  const nested = asRecord(result?.initImportPrivateKeyResult) ?? result;
  const bundle = asString(nested?.importBundle) ?? asString(root?.importBundle);
  if (!bundle) throw new Error("turnkey_import_bundle_missing");
  return bundle;
}

export function parseImportedKey(response: unknown): { privateKeyId: string; addresses: string[] } {
  const root = asRecord(response);
  const activity = asRecord(root?.activity);
  const result = asRecord(activity?.result);
  const nested = asRecord(result?.importPrivateKeyResult) ?? result;
  const privateKeyId = asString(nested?.privateKeyId) ?? asString(root?.privateKeyId);
  if (!privateKeyId) throw new Error("turnkey_import_failed");
  return { privateKeyId, addresses: asStringArray(nested?.addresses) };
}

async function createLiveTurnkeyApi(config: TurnkeyServerConfig): Promise<TurnkeyApi> {
  const { Turnkey } = await import("@turnkey/sdk-server");
  const client = new Turnkey({
    apiBaseUrl: config.apiBaseUrl,
    defaultOrganizationId: config.organizationId,
    apiPublicKey: config.apiPublicKey,
    apiPrivateKey: config.apiPrivateKey,
  }).apiClient();

  return {
    async createSubOrganization(input) {
      const authenticators = (input.authenticators ?? []).map((item) => ({
        authenticatorName: item.authenticatorName,
        challenge: item.challenge,
        attestation: item.attestation as never,
      }));
      const response = await client.createSubOrganization({
        organizationId: config.organizationId,
        subOrganizationName: input.subOrganizationName,
        rootUsers: [
          {
            userName: input.userName,
            userEmail: input.userEmail,
            apiKeys: (input.apiKeys ?? []).map((key) => ({
              apiKeyName: key.apiKeyName,
              publicKey: key.publicKey,
              curveType: key.curveType ?? "API_KEY_CURVE_P256",
            })),
            authenticators,
            oauthProviders: [],
          },
        ],
        rootQuorumThreshold: 1,
        ...(input.createWallet
          ? {
              wallet: {
                walletName: "PEOPLE Wallet",
                accounts: [TURNKEY_ETHEREUM_ACCOUNT],
              },
            }
          : {}),
      });
      return parseCreateSubOrganizationResult(response);
    },
    async initOtp(input) {
      const response = await client.initOtp({
        organizationId: input.organizationId,
        otpType: input.otpType,
        contact: input.contact,
        appName: "PEOPLE",
        ...(input.userIdentifier ? { userIdentifier: input.userIdentifier } : {}),
      });
      return parseInitOtp(response);
    },
    async verifyOtp(input) {
      const response = await client.verifyOtp({
        otpId: input.otpId,
        encryptedOtpBundle: input.encryptedOtpBundle,
      });
      return { verificationToken: parseVerificationToken(response) };
    },
    async otpLogin(input) {
      const response = await client.otpLogin({
        organizationId: input.organizationId,
        verificationToken: input.verificationToken,
        publicKey: input.publicKey,
        clientSignature: input.clientSignature,
        ...(input.expirationSeconds ? { expirationSeconds: input.expirationSeconds } : {}),
      });
      return { session: parseSession(response) };
    },
  };
}

export async function getTurnkeyApi(): Promise<TurnkeyApi> {
  if (injected) return injected;
  if (!liveClient) {
    liveClient = await createLiveTurnkeyApi(readTurnkeyServerConfig());
  }
  return liveClient;
}
