import { isValidIpfsCid, PinataError, pinataFailure, pinataJwt, type PinataFileNetwork } from "./ipfs.ts";

type FetchLike = typeof fetch;

const LOOKUP_TIMEOUT_MS = 8_000;
const GATEWAY_CACHE_MS = 10 * 60_000;

let gatewayHostCache: { host: string; at: number } | null = null;

/** @internal */
export function resetPinataGatewayCacheForTests(): void {
  gatewayHostCache = null;
}

function hostFromDomain(domain: string): string | null {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed || /[\s/]/.test(trimmed)) return null;
  if (trimmed.endsWith(".mypinata.cloud")) return trimmed;
  return `${trimmed}.mypinata.cloud`;
}

/** This account's dedicated gateway, cached in-process. `rows[0].domain` plus `.mypinata.cloud`. */
export async function pinataDedicatedGatewayHost(fetchImpl: FetchLike = fetch): Promise<string> {
  if (gatewayHostCache && Date.now() - gatewayHostCache.at < GATEWAY_CACHE_MS) return gatewayHostCache.host;
  const jwt = pinataJwt();
  const res = await fetchImpl("https://api.pinata.cloud/v3/gateways", {
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
  const body = (await res.json().catch(() => ({}))) as { data?: { rows?: Array<{ domain?: unknown }> }; rows?: Array<{ domain?: unknown }> };
  const rows = body.data?.rows ?? body.rows ?? [];
  const domain = rows[0] && typeof rows[0].domain === "string" ? rows[0].domain : "";
  const host = hostFromDomain(domain);
  if (!host) throw new PinataError("pin_failed");
  gatewayHostCache = { host, at: Date.now() };
  return host;
}

/** Short-lived URL that reads one private file. The bytes never sit on a public gateway. */
export async function pinataPrivateDownloadUrl(cid: string, fetchImpl: FetchLike = fetch): Promise<string> {
  if (!isValidIpfsCid(cid)) throw new PinataError("pin_failed");
  const host = await pinataDedicatedGatewayHost(fetchImpl);
  const jwt = pinataJwt();
  const res = await fetchImpl("https://api.pinata.cloud/v3/files/private/download_link", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `https://${host}/files/${cid}`,
      date: Math.floor(Date.now() / 1000),
      expires: 60,
      method: "GET",
    }),
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
  const body = (await res.json().catch(() => ({}))) as { data?: unknown };
  const link = typeof body.data === "string" ? body.data : null;
  const nested = body.data && typeof body.data === "object" && "url" in body.data ? body.data.url : null;
  const url = link ?? (typeof nested === "string" ? nested : "");
  if (!url.startsWith("https://")) throw new PinataError("pin_failed");
  return url;
}

type FileRow = { id?: unknown };

function fileRows(body: unknown): FileRow[] {
  if (!body || typeof body !== "object") return [];
  const data = "data" in body ? body.data : null;
  if (Array.isArray(data)) return data as FileRow[];
  if (data && typeof data === "object") {
    if ("files" in data && Array.isArray(data.files)) return data.files as FileRow[];
    if ("rows" in data && Array.isArray(data.rows)) return data.rows as FileRow[];
  }
  return [];
}

/** Every file id this account has stored for `cid` on one network. */
export async function listPinataFileIdsByCid(
  network: PinataFileNetwork,
  cid: string,
  fetchImpl: FetchLike = fetch,
): Promise<string[]> {
  if (!isValidIpfsCid(cid)) throw new PinataError("pin_failed");
  const jwt = pinataJwt();
  const res = await fetchImpl(`https://api.pinata.cloud/v3/files/${network}?cid=${encodeURIComponent(cid)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
  const ids: string[] = [];
  for (const row of fileRows(await res.json().catch(() => ({})))) {
    if (typeof row.id === "string" && row.id && !isValidIpfsCid(row.id)) ids.push(row.id);
  }
  return ids;
}

/** Publish verified bytes on the public network. The returned CID is the IPFS id of those bytes. */
export async function pinPublicFileBytes(
  bytes: Uint8Array,
  filename: string,
  mime: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ id: string; cid: string }> {
  const jwt = pinataJwt();
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(bytes)], { type: mime }), filename);
  form.append("network", "public");
  const res = await fetchImpl("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(18_000),
  });
  if (!res.ok) throw pinataFailure(res.status);
  const body = (await res.json().catch(() => ({}))) as { data?: { id?: unknown; cid?: unknown }; id?: unknown; cid?: unknown };
  const data = body.data ?? body;
  const id = typeof data.id === "string" ? data.id : "";
  const cid = typeof data.cid === "string" ? data.cid : "";
  if (!id || isValidIpfsCid(id) || !isValidIpfsCid(cid)) throw new PinataError("pin_failed");
  return { id, cid };
}
