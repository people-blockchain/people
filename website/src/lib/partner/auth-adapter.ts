import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import { logAdapterError } from "./auth-errors";

function pickUser(data: AdapterUser): AdapterUser {
  return {
    id: data.id,
    name: data.name ?? null,
    email: data.email ?? null,
    emailVerified: data.emailVerified ?? null,
    image: data.image ?? null,
  };
}

function pickAccount(data: AdapterAccount): AdapterAccount {
  return {
    userId: data.userId,
    type: data.type,
    provider: data.provider,
    providerAccountId: data.providerAccountId,
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expires_at: data.expires_at,
    token_type: data.token_type,
    scope: data.scope,
    id_token: data.id_token,
    session_state: data.session_state,
  };
}

function pickVerificationToken(data: { identifier: string; token: string; expires: Date }) {
  return {
    identifier: data.identifier,
    token: data.token,
    expires: data.expires,
  };
}

/**
 * Restrict adapter writes to columns that exist on the bootstrap schema and log
 * failures without dumping tokens. Extra OAuth fields (expires_in, etc.) are dropped.
 */
export function wrapAuthAdapter(base: Adapter): Adapter {
  return {
    ...base,
    async createUser(data) {
      try {
        return await base.createUser!(pickUser(data));
      } catch (error) {
        logAdapterError("createUser", error);
        throw error;
      }
    },
    async linkAccount(data) {
      try {
        await base.linkAccount!(pickAccount(data));
      } catch (error) {
        logAdapterError("linkAccount", error);
        throw error;
      }
    },
    async createVerificationToken(data) {
      try {
        return await base.createVerificationToken!(pickVerificationToken(data));
      } catch (error) {
        logAdapterError("createVerificationToken", error);
        throw error;
      }
    },
    async useVerificationToken(params) {
      try {
        return await base.useVerificationToken!(params);
      } catch (error) {
        logAdapterError("useVerificationToken", error);
        throw error;
      }
    },
  };
}
