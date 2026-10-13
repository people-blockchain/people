import { decryptPrivateKey, encryptPrivateKey } from "./walletStorage.js";

export type NodeKind = "full" | "light";

export interface DeviceRecord {
  id: string;
  name: string;
  address: string;
  kind: NodeKind;
  /** AES-GCM payload from encryptPrivateKey — preferred storage. */
  encryptedPrivateKey?: string;
  /**
   * Legacy plaintext key. Never written by new code; migrate via migrateDeviceKey.
   * @deprecated
   */
  privateKey?: string;
  createdAt: number;
}

export const DEVICE_KEY = "ovn-devices";

export function loadDevices(): DeviceRecord[] {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "[]") as DeviceRecord[];
  } catch {
    return [];
  }
}

/** Persist devices without ever writing plaintext privateKey. */
export function saveDevices(devices: DeviceRecord[]): void {
  const sanitized = devices.map(({ privateKey: _legacy, ...rest }) => rest);
  localStorage.setItem(DEVICE_KEY, JSON.stringify(sanitized));
}

export function deviceHasStoredKey(device: DeviceRecord): boolean {
  return Boolean(device.encryptedPrivateKey || device.privateKey);
}

export function deviceNeedsMigration(device: DeviceRecord): boolean {
  return Boolean(device.privateKey) && !device.encryptedPrivateKey;
}

export function devicesNeedingMigration(devices: DeviceRecord[] = loadDevices()): DeviceRecord[] {
  return devices.filter(deviceNeedsMigration);
}

export async function buildEncryptedDevice(
  input: {
    id: string;
    name: string;
    address: string;
    kind: NodeKind;
    privateKey: string;
    createdAt?: number;
  },
  password: string
): Promise<DeviceRecord> {
  const encryptedPrivateKey = await encryptPrivateKey(input.privateKey, password);
  return {
    id: input.id,
    name: input.name,
    address: input.address,
    kind: input.kind,
    encryptedPrivateKey,
    createdAt: input.createdAt ?? Date.now()
  };
}

export async function upsertEncryptedDevice(
  input: {
    id: string;
    name: string;
    address: string;
    kind: NodeKind;
    privateKey: string;
    createdAt?: number;
  },
  password: string
): Promise<DeviceRecord[]> {
  const record = await buildEncryptedDevice(input, password);
  const next = [...loadDevices().filter((item) => item.address !== input.address && item.id !== input.id), record];
  saveDevices(next);
  return next;
}

/** Re-encrypt a legacy plaintext device and strip privateKey from disk. */
export async function migrateDeviceKey(deviceId: string, password: string): Promise<DeviceRecord[]> {
  const devices = loadDevices();
  const device = devices.find((item) => item.id === deviceId);
  if (!device?.privateKey) {
    throw new Error("device_not_legacy");
  }
  const encryptedPrivateKey = await encryptPrivateKey(device.privateKey, password);
  const next = devices.map((item) =>
    item.id === deviceId
      ? {
          id: item.id,
          name: item.name,
          address: item.address,
          kind: item.kind,
          encryptedPrivateKey,
          createdAt: item.createdAt
        }
      : item
  );
  saveDevices(next);
  return next;
}

export async function unlockDevicePrivateKey(device: DeviceRecord, password: string): Promise<string> {
  if (device.encryptedPrivateKey) {
    return decryptPrivateKey(device.encryptedPrivateKey, password);
  }
  if (device.privateKey) {
    throw new Error("device_needs_migration");
  }
  throw new Error("device_no_key");
}
