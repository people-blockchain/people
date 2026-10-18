import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";

export const PEOPLE_CONNECT_ORIGIN = "https://www.peopleblockchain.network";
export const LOCAL_CONNECT_ORIGIN = "http://127.0.0.1:18080";
export const CONNECTION_STATEMENT = "Connect People Wallet to the PEOPLE website. No transactions are authorized.";
const PAIR_MS = 120_000, SESSION_MS = 900_000;
const idPattern = /^[0-9a-f]{32}$/, tokenPattern = /^[0-9a-f]{64}$/;
export type MessageRequest = { id: string; method: "personal_sign"; message: string; expiresAt: string; status: "pending" | "approved" | "rejected" | "expired"; signature?: Hex; code?: number };
export type MobileSession = { id: string; origin: string; chainId: 97401; address: Address; expiresAt: string; methods: ["personal_sign"] };
export type GatewayRecord = {
  id: string; state: "pending" | "connected" | "disconnected"; origin: string;
  browserHash: string; pairHash?: string; phoneHash?: string;
  nonce: string; issuedAt: string; pairExpiresAt: string; expiresAt: string;
  address?: Address; request?: MessageRequest;
};
export interface GatewayStore {
  insert(record: GatewayRecord): Promise<void>;
  read(id: string): Promise<GatewayRecord | null>;
  replace(before: GatewayRecord, after: GatewayRecord): Promise<boolean>;
}
export class GatewayError extends Error {
  code: string; status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
function fail(code: string, status = 400): never { throw new GatewayError(code, status); }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function capability(value: unknown, expected?: string) {
  if (typeof value !== "string" || !tokenPattern.test(value) || !expected) fail("not_authorized", 403);
  if (!timingSafeEqual(Buffer.from(hash(value), "hex"), Buffer.from(expected, "hex"))) fail("not_authorized", 403);
}
export function checkedAddress(value: unknown): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) return fail("invalid_address");
  try { if (!isAddress(value, { strict: true })) return fail("invalid_address"); return getAddress(value); } catch { return fail("invalid_address"); }
}
export function checkedMessage(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > 8192 ||
      /[\p{Cc}\p{Cf}]/u.test(value.replace(/[\n\t]/g, "")) || /[\ud800-\udfff]/u.test(value)) return fail("invalid_message");
  return value;
}
export function buildConnectionMessage(origin: string, address: Address, nonce: string, issuedAt: string, expiresAt: string): string {
  return `${origin} wants you to sign in with your Ethereum account:\n${address}\n\n${CONNECTION_STATEMENT}\n\nURI: ${origin}/connect/mobile\nVersion: 1\nChain ID: 97401\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}`;
}
function signature(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value)) return fail("invalid_signature");
  return value as Hex;
}
async function prove(address: Address, message: string, value: unknown): Promise<Hex> {
  const sig = signature(value);
  try { if (await verifyMessage({ address, message, signature: sig })) return sig; } catch { /* fail closed */ }
  return fail("invalid_signature", 403);
}

/** First-party application transport only; never sends an on-chain transaction. */
export class MobileWalletGateway {
  private store: GatewayStore; private origin: string; private now: () => number;
  constructor(store: GatewayStore, origin = PEOPLE_CONNECT_ORIGIN, now: () => number = Date.now) {
    if (![PEOPLE_CONNECT_ORIGIN, LOCAL_CONNECT_ORIGIN].includes(origin)) fail("invalid_origin");
    this.store = store; this.origin = origin; this.now = now;
  }
  private session(record: GatewayRecord): MobileSession | undefined {
    if (!record.address) return undefined;
    return { id: record.id, origin: record.origin, chainId: 97401, address: record.address, expiresAt: record.expiresAt, methods: ["personal_sign"] };
  }
  private view(record: GatewayRecord) {
    const expired = Date.parse(record.expiresAt) <= this.now();
    if (expired) return { state: "expired" };
    if (record.state === "disconnected") return { state: "disconnected" };
    const request = record.request && record.request.status === "pending" && Date.parse(record.request.expiresAt) <= this.now()
      ? { ...record.request, status: "expired" as const, code: 4080 } : record.request;
    return { state: record.state, ...(this.session(record) ? { session: this.session(record) } : {}), ...(request ? { request } : {}) };
  }
  private requireLive(record: GatewayRecord, state: GatewayRecord["state"]) {
    if (Date.parse(record.expiresAt) <= this.now()) fail("expired", 410);
    if (record.state !== state) fail("wrong_state", 409);
  }
  private async commit(before: GatewayRecord, after: GatewayRecord) {
    if (!await this.store.replace(before, after)) fail("state_changed", 409);
  }
  async execute(input: unknown, requestOrigin: string | null): Promise<unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail("invalid_request");
    const body = input as Record<string, unknown>;
    const actions: Record<string, string[]> = {
      create: [], challenge: ["id", "pairToken", "address"], connect: ["id", "pairToken", "address", "message", "signature", "phoneToken"],
      status: ["id", "browserToken"], request: ["id", "browserToken", "message"], poll: ["id", "phoneToken"],
      respond: ["id", "phoneToken", "requestId", "decision", "signature"], disconnect: ["id", "role", "token"],
    };
    if (body.version !== 1 || typeof body.action !== "string" || !Object.hasOwn(actions, body.action)) return fail("invalid_request");
    const action = body.action;
    if (Object.keys(body).some(k => !["version", "action", ...actions[action]].includes(k))) return fail("unknown_field");
    const browser = ["create", "status", "request"].includes(action) || (action === "disconnect" && body.role === "browser");
    if ((browser && requestOrigin !== this.origin) || (requestOrigin !== null && requestOrigin !== this.origin)) return fail("invalid_origin", 403);
    if (action === "create") {
      const id = randomBytes(16).toString("hex"), browserToken = randomBytes(32).toString("hex"), pairToken = randomBytes(32).toString("hex");
      const now = this.now(), issuedAt = new Date(now).toISOString(), expiresAt = new Date(now + PAIR_MS).toISOString();
      await this.store.insert({ id, state: "pending", origin: this.origin, browserHash: hash(browserToken), pairHash: hash(pairToken), nonce: randomBytes(16).toString("hex"), issuedAt, pairExpiresAt: expiresAt, expiresAt });
      return { id, browserToken, link: `${this.origin}/connect/mobile#id=${id}&token=${pairToken}`, expiresAt };
    }
    if (typeof body.id !== "string" || !idPattern.test(body.id)) return fail("invalid_id");
    const record = await this.store.read(body.id);
    if (!record || record.origin !== this.origin) return fail("not_found", 404);
    if (action === "status") { capability(body.browserToken, record.browserHash); return this.view(record); }
    if (action === "poll") { capability(body.phoneToken, record.phoneHash); return this.view(record); }
    if (action === "challenge" || action === "connect") {
      capability(body.pairToken, record.pairHash); this.requireLive(record, "pending");
      const address = checkedAddress(body.address);
      const message = buildConnectionMessage(record.origin, address, record.nonce, record.issuedAt, record.pairExpiresAt);
      if (action === "challenge") return { id: record.id, origin: record.origin, chainId: 97401, address, message, nonce: record.nonce, issuedAt: record.issuedAt, expiresAt: record.pairExpiresAt };
      if (body.message !== message) return fail("message_changed", 409);
      if (typeof body.phoneToken !== "string" || !tokenPattern.test(body.phoneToken)) return fail("invalid_phone_token");
      if (hash(body.phoneToken) === record.pairHash || hash(body.phoneToken) === record.browserHash) return fail("role_token_reuse");
      await prove(address, message, body.signature);
      // Verification may await native crypto: check expiry again immediately before CAS.
      this.requireLive(record, "pending");
      const next: GatewayRecord = { ...record, state: "connected", address, pairHash: undefined, phoneHash: hash(body.phoneToken), expiresAt: new Date(this.now() + SESSION_MS).toISOString() };
      await this.commit(record, next); return { session: this.session(next) };
    }
    if (action === "request") {
      capability(body.browserToken, record.browserHash); this.requireLive(record, "connected");
      if (record.request?.status === "pending" && Date.parse(record.request.expiresAt) > this.now()) return fail("request_pending", 409);
      const request: MessageRequest = { id: randomBytes(16).toString("hex"), method: "personal_sign", message: checkedMessage(body.message), expiresAt: new Date(Math.min(this.now() + PAIR_MS, Date.parse(record.expiresAt))).toISOString(), status: "pending" };
      await this.commit(record, { ...record, request }); return { request };
    }
    if (action === "respond") {
      capability(body.phoneToken, record.phoneHash); this.requireLive(record, "connected");
      const pending = record.request;
      if (!pending || pending.id !== body.requestId || pending.status !== "pending") return fail("request_changed", 409);
      if (Date.parse(pending.expiresAt) <= this.now()) return fail("request_expired", 410);
      let request: MessageRequest;
      if (body.decision === "reject" && !Object.hasOwn(body, "signature")) request = { ...pending, status: "rejected", code: 4001 };
      else if (body.decision === "approve") {
        const sig = await prove(record.address!, pending.message, body.signature);
        if (Date.parse(pending.expiresAt) <= this.now() || Date.parse(record.expiresAt) <= this.now()) return fail("request_expired", 410);
        request = { ...pending, status: "approved", signature: sig };
      } else return fail("invalid_decision");
      await this.commit(record, { ...record, request }); return { request };
    }
    if (action === "disconnect") {
      if (body.role === "browser") capability(body.token, record.browserHash);
      else if (body.role === "phone") capability(body.token, record.phoneHash);
      else return fail("invalid_role");
      if (record.state !== "disconnected") await this.commit(record, { ...record, state: "disconnected", pairHash: undefined, request: undefined });
      return { state: "disconnected" };
    }
    return fail("invalid_action");
  }
}
