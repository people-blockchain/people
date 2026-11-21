import { signFactoryTx } from "@/lib/people-sign";
import { networkJson } from "@/lib/network-client";
import { lookupReferralCodeWallet, planParticipantRegistration, readStoredReferralCode } from "@/lib/referral-ref";
import { sessionHasLocalKey, signSessionFactoryTx, type SignableWalletSession } from "@/lib/wallet-session-sign";

export type { RegistrationPlan, RegistrationStep } from "@/lib/referral-ref";
export { planParticipantRegistration } from "@/lib/referral-ref";

function participantTx(
  privateKey: string,
  chainId: string,
  address: string,
  nonce: number,
  type: "registerParticipant" | "participantReferral",
  parent?: string
) {
  return signFactoryTx(privateKey, {
    chainId,
    id: `${address}-${type}-${nonce}-${Date.now()}`,
    from: address,
    to: address,
    amount: 0,
    fee: 0,
    nonce,
    timestamp: Date.now(),
    type,
    ...(parent ? { payload: { parent } } : {}),
  });
}

async function submitTx(tx: ReturnType<typeof signFactoryTx>) {
  return networkJson<{ accepted?: boolean; error?: string }>("tx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tx),
  });
}

const RETRYABLE = /insufficient|balance|funds|nonce|mempool/i;

export async function runParticipantRegistration(
  privateKey: string,
  address: string,
  options?: {
    requestFaucet?: () => Promise<void>;
    maxAttempts?: number;
    sleepMs?: (ms: number) => Promise<void>;
    lookupCodeWallet?: (code: string) => Promise<string | null>;
  }
): Promise<{ ok: boolean; error?: string }> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const sleep = options?.sleepMs ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const code = readStoredReferralCode();
  const codeWallet = code ? await (options?.lookupCodeWallet ?? lookupReferralCodeWallet)(code) : null;
  const plan = planParticipantRegistration(address, codeWallet);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const health = await networkJson<{ chainId: string }>("health");
      const account = await networkJson<{ nonce?: number }>(`address/${address}`);
      let nonce = Number(account.nonce ?? 0);

      for (const step of plan.steps) {
        const tx =
          step === "register"
            ? participantTx(privateKey, health.chainId, address, nonce, "registerParticipant")
            : participantTx(
                privateKey,
                health.chainId,
                address,
                nonce,
                "participantReferral",
                plan.referrer!
              );
        const result = await submitTx(tx);
        if (!result.accepted) {
          const message = result.error ?? "tx_rejected";
          if (RETRYABLE.test(message) && options?.requestFaucet) {
            await options.requestFaucet();
            await sleep(800);
            break;
          }
          if (/already registered|Participant already/i.test(message) && step === "register") {
            nonce += 1;
            continue;
          }
          if (/already|duplicate|referral/i.test(message) && step === "referral") {
            return { ok: true };
          }
          throw new Error(message);
        }
        nonce += 1;
      }
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts - 1 && RETRYABLE.test(message) && options?.requestFaucet) {
        try {
          await options.requestFaucet();
        } catch {
          /* faucet may be disabled */
        }
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (/already registered|Participant already/i.test(message)) {
        return { ok: true };
      }
      return { ok: false, error: message };
    }
  }
  return { ok: false, error: "registration_retries_exhausted" };
}

export async function runParticipantRegistrationFromSession(
  session: SignableWalletSession,
  options?: {
    requestFaucet?: () => Promise<void>;
    maxAttempts?: number;
    sleepMs?: (ms: number) => Promise<void>;
    lookupCodeWallet?: (code: string) => Promise<string | null>;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (sessionHasLocalKey(session) && session.privateKey) {
    return runParticipantRegistration(session.privateKey, session.address, options);
  }
  const maxAttempts = options?.maxAttempts ?? 4;
  const sleep = options?.sleepMs ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const code = readStoredReferralCode();
  const codeWallet = code ? await (options?.lookupCodeWallet ?? lookupReferralCodeWallet)(code) : null;
  const plan = planParticipantRegistration(session.address, codeWallet);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const health = await networkJson<{ chainId: string }>("health");
      const account = await networkJson<{ nonce?: number }>(`address/${session.address}`);
      let nonce = Number(account.nonce ?? 0);
      for (const step of plan.steps) {
        const tx = await signSessionFactoryTx(session, {
          chainId: health.chainId,
          id: `${session.address}-${step}-${nonce}-${Date.now()}`,
          from: session.address,
          to: session.address,
          amount: 0,
          fee: 0,
          nonce,
          timestamp: Date.now(),
          type: step === "register" ? "registerParticipant" : "participantReferral",
          ...(step === "referral" && plan.referrer ? { payload: { parent: plan.referrer } } : {}),
        });
        const result = await submitTx(tx);
        if (!result.accepted) {
          const message = result.error ?? "tx_rejected";
          if (RETRYABLE.test(message) && options?.requestFaucet) {
            await options.requestFaucet();
            await sleep(800);
            break;
          }
          if (/already registered|Participant already/i.test(message) && step === "register") {
            nonce += 1;
            continue;
          }
          if (/already|duplicate|referral/i.test(message) && step === "referral") {
            return { ok: true };
          }
          throw new Error(message);
        }
        nonce += 1;
      }
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts - 1 && RETRYABLE.test(message) && options?.requestFaucet) {
        try {
          await options.requestFaucet();
        } catch {
          /* faucet may be disabled */
        }
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (/already registered|Participant already/i.test(message)) {
        return { ok: true };
      }
      return { ok: false, error: message };
    }
  }
  return { ok: false, error: "registration_retries_exhausted" };
}
