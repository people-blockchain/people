"use client";
import { hexToBytes, recoverMessageAddress, type Hex } from "viem";
import type { MobileSession, MessageRequest } from "./service";
type State = { state: string; session?: MobileSession; request?: MessageRequest };
export async function mobileWalletApi(body: Record<string, unknown>, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 20_000);
  try {
    const response = await fetch("/api/mobile-wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, ...body }), cache: "no-store", credentials: "omit", signal: controller.signal });
    const json = await response.json();
    if (!response.ok) throw new Error(typeof json.error === "string" ? json.error : "mobile_wallet_unavailable");
    return json;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
/** Capability stays in this browser's memory. Unsupported writes never reach a wallet/node. */
export class PeopleMobileProvider {
  private session: MobileSession; private token: string; private closed = false; private busy = false;
  private listeners = new Set<(...args: unknown[]) => void>();
  private timer?: ReturnType<typeof setTimeout>; private monitoring = false; private monitorEpoch = 0;
  private reading?: Promise<{ state: State; epoch: number }>; private cached?: State; private readAt = 0; private cacheEpoch = 0;
  constructor(session: MobileSession, browserToken: string) { this.session = session; this.token = browserToken; }
  on(event: string, listener: (...args: unknown[]) => void) { if (event === "disconnect") this.listeners.add(listener); }
  removeListener(event: string, listener: (...args: unknown[]) => void) { if (event === "disconnect") this.listeners.delete(listener); }
  private closeLocal() {
    if (this.closed) return;
    this.closed = true; this.token = ""; this.stopMonitoring();
    for (const listener of this.listeners) listener({ code: 4900, message: "PEOPLE mobile connection ended" });
  }
  private async readState(): Promise<State> {
    for (;;) {
      if (this.cached && Date.now() - this.readAt < 5000) return this.cached;
      if (!this.reading) {
        const epoch = this.cacheEpoch;
        this.reading = mobileWalletApi({ action: "status", id: this.session.id, browserToken: this.token }).then(value => {
          const state = value as State;
          if (epoch === this.cacheEpoch) { this.cached = state; this.readAt = Date.now(); }
          return { state, epoch };
        });
      }
      try {
        const { state, epoch } = await this.reading;
        this.reading = undefined;
        if (epoch === this.cacheEpoch) return state;
      } catch (error) {
        this.reading = undefined;
        throw error;
      }
    }
  }
  startMonitoring() {
    if (this.monitoring || this.closed) return;
    this.monitoring = true; const epoch = ++this.monitorEpoch;
    const tick = async () => {
      if (!this.monitoring || this.closed || epoch !== this.monitorEpoch) return;
      if (Date.parse(this.session.expiresAt) <= Date.now()) { this.closeLocal(); return; }
      if (document.visibilityState !== "hidden") {
        try { const state = await this.readState(); if (!this.monitoring || epoch !== this.monitorEpoch) return; if (state.state !== "connected" || state.session?.address !== this.session.address) { this.closeLocal(); return; } }
        catch { /* A transient read error never authorizes a signature; expiry still bounds this loop. */ }
      }
      if (this.monitoring && epoch === this.monitorEpoch) this.timer = setTimeout(tick, 5000);
    };
    void tick();
  }
  stopMonitoring() { this.monitoring = false; this.monitorEpoch++; clearTimeout(this.timer); }
  async disconnect() {
    if (this.closed) return;
    const token = this.token; this.closeLocal();
    await mobileWalletApi({ action: "disconnect", id: this.session.id, role: "browser", token });
  }
  async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
    if (this.closed || Date.parse(this.session.expiresAt) <= Date.now()) throw new Error("mobile_wallet_disconnected");
    if (method === "eth_chainId") return "0x17c79";
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [this.session.address];
    if (method !== "personal_sign") throw Object.assign(new Error("mobile_wallet_method_unsupported"), { code: 4200 });
    if (this.busy) throw new Error("mobile_wallet_request_pending");
    if (!params || params.length !== 2 || typeof params[0] !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(params[0]) || typeof params[1] !== "string" || params[1].toLowerCase() !== this.session.address.toLowerCase()) throw new Error("mobile_wallet_invalid_request");
    const message = new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(params[0] as Hex));
    this.busy = true;
    try {
      const { request } = await mobileWalletApi({ action: "request", id: this.session.id, browserToken: this.token, message }) as { request: MessageRequest };
      this.cacheEpoch++; this.cached = undefined; this.reading = undefined;
      const deadline = Math.min(Date.parse(request.expiresAt), Date.parse(this.session.expiresAt));
      let readFailures = 0;
      while (!this.closed && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (this.closed || document.visibilityState === "hidden") throw new Error("mobile_wallet_review_cancelled");
        if (Date.now() >= deadline) throw new Error("mobile_wallet_request_expired");
        let state: State;
        try { state = await this.readState(); readFailures = 0; }
        catch { if (++readFailures >= 5) throw new Error("mobile_wallet_unavailable"); continue; }
        if (this.closed || Date.now() >= deadline) throw new Error("mobile_wallet_request_expired");
        if (state.state !== "connected" || state.session?.address !== this.session.address) { this.closeLocal(); throw new Error("mobile_wallet_disconnected"); }
        const result = state.request;
        if (result?.id !== request.id || result.message !== message) throw new Error("mobile_wallet_request_changed");
        if (result.status === "rejected") throw Object.assign(new Error("mobile_wallet_rejected"), { code: 4001 });
        if (result.status === "approved" && result.signature) {
          const recovered = await recoverMessageAddress({ message, signature: result.signature });
          if (this.closed || Date.now() >= deadline) throw new Error("mobile_wallet_request_expired");
          if (recovered.toLowerCase() !== this.session.address.toLowerCase()) throw new Error("mobile_wallet_bad_signature");
          return result.signature;
        }
        if (result.status === "expired") break;
      }
      throw new Error("mobile_wallet_request_expired");
    } finally { this.busy = false; }
  }
}

type Pairing = { id: string; browserToken: string; expiresAt: string };
type PairObserver = { connected: (session: MobileSession) => void; expired: () => void; invalid: () => void; retrying: () => void };
/** Only reads retry. A pair has a fixed deadline; invalid session data ends observation. */
export function observeMobilePair(pair: Pairing, observer: PairObserver) {
  let active = true; let timer: ReturnType<typeof setTimeout>;
  const stop = () => { active = false; clearTimeout(timer); };
  const expiry = Date.parse(pair.expiresAt);
  if (!Number.isFinite(expiry)) { stop(); observer.invalid(); return stop; }
  const poll = async () => {
    if (!active) return;
    if (Date.now() >= expiry) { stop(); observer.expired(); return; }
    if (document.visibilityState !== "hidden") {
      let state: State | undefined;
      try { state = await mobileWalletApi({ action: "status", id: pair.id, browserToken: pair.browserToken }) as State; }
      catch { if (active) observer.retrying(); }
      if (!active) return;
      if (state !== undefined) {
        if (!state || typeof state !== "object" || !["pending", "connected", "expired", "disconnected"].includes(state.state)) { stop(); observer.invalid(); return; }
        if (state.state === "connected") {
          stop();
          try {
            if (!state.session || state.session.id !== pair.id) throw new Error("invalid_mobile_session");
            observer.connected(state.session);
          } catch { observer.invalid(); }
          return;
        }
        if (state.state !== "pending") { stop(); observer.expired(); return; }
      }
    }
    if (active) timer = setTimeout(poll, 5000);
  };
  timer = setTimeout(poll, 1000);
  return stop;
}
