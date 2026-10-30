/** Upload a validated token icon to the existing factory image route and return its ipfs:// URI. */
export async function uploadTokenIcon(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/factory/nft/image", { method: "POST", body });
  const payload = (await res.json().catch(() => ({}))) as { uri?: unknown; error?: unknown };
  if (!res.ok) throw new Error(typeof payload.error === "string" ? payload.error : `http_${res.status}`);
  if (typeof payload.uri !== "string" || !payload.uri.startsWith("ipfs://")) {
    throw new Error("invalid_upload_response");
  }
  return payload.uri;
}
