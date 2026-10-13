const STORAGE_KEY = "ppl_founder_device_id";

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

export function getOrCreateFounderDeviceId(): string {
  const store = storage();
  if (!store) return crypto.randomUUID();
  try {
    const existing = store.getItem(STORAGE_KEY)?.trim();
    if (existing && existing.length >= 16) return existing;
    const id = crypto.randomUUID();
    store.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
