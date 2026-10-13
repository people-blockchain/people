import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  deviceHasStoredKey,
  devicesNeedingMigration,
  loadDevices,
  migrateDeviceKey,
  saveDevices,
  unlockDevicePrivateKey,
  upsertEncryptedDevice,
  type DeviceRecord,
  type NodeKind
} from "./devices.js";

interface DeviceVaultValue {
  devices: DeviceRecord[];
  legacyDevices: DeviceRecord[];
  refreshDevices: () => void;
  isUnlocked: (deviceId: string) => boolean;
  getUnlockedKey: (deviceId: string) => string | undefined;
  getUnlockedKeyByAddress: (address: string) => string | undefined;
  unlockDevice: (deviceId: string, password: string) => Promise<string>;
  lockDevice: (deviceId: string) => void;
  lockAllDevices: () => void;
  migrateDevice: (deviceId: string, password: string) => Promise<void>;
  saveDeviceEncrypted: (input: {
    id: string;
    name: string;
    address: string;
    kind: NodeKind;
    privateKey: string;
    createdAt?: number;
  }, password: string) => Promise<DeviceRecord>;
  removeDevice: (deviceId: string) => void;
}

const DeviceVaultContext = createContext<DeviceVaultValue | null>(null);

export function DeviceVaultProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<DeviceRecord[]>(() => loadDevices());
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});

  const refreshDevices = useCallback(() => {
    setDevices(loadDevices());
  }, []);

  const legacyDevices = useMemo(() => devicesNeedingMigration(devices), [devices]);

  const isUnlocked = useCallback((deviceId: string) => Boolean(unlocked[deviceId]), [unlocked]);

  const getUnlockedKey = useCallback((deviceId: string) => unlocked[deviceId], [unlocked]);

  const getUnlockedKeyByAddress = useCallback(
    (address: string) => {
      const device = devices.find((item) => item.address === address && deviceHasStoredKey(item));
      if (!device) {
        return undefined;
      }
      return unlocked[device.id];
    },
    [devices, unlocked]
  );

  const unlockDevice = useCallback(async (deviceId: string, password: string) => {
    const list = loadDevices();
    const device = list.find((item) => item.id === deviceId);
    if (!device) {
      throw new Error("device_not_found");
    }
    if (deviceNeedsMigrationLocal(device)) {
      throw new Error("device_needs_migration");
    }
    const privateKey = await unlockDevicePrivateKey(device, password);
    setUnlocked((prev) => ({ ...prev, [deviceId]: privateKey }));
    return privateKey;
  }, []);

  const lockDevice = useCallback((deviceId: string) => {
    setUnlocked((prev) => {
      const next = { ...prev };
      delete next[deviceId];
      return next;
    });
  }, []);

  const lockAllDevices = useCallback(() => {
    setUnlocked({});
  }, []);

  const migrateDevice = useCallback(async (deviceId: string, password: string) => {
    const list = loadDevices();
    const device = list.find((item) => item.id === deviceId);
    if (!device?.privateKey) {
      throw new Error("device_not_legacy");
    }
    const plaintext = device.privateKey;
    const next = await migrateDeviceKey(deviceId, password);
    setDevices(next);
    setUnlocked((prev) => ({ ...prev, [deviceId]: plaintext }));
  }, []);

  const saveDeviceEncrypted = useCallback(
    async (
      input: {
        id: string;
        name: string;
        address: string;
        kind: NodeKind;
        privateKey: string;
        createdAt?: number;
      },
      password: string
    ) => {
      const next = await upsertEncryptedDevice(input, password);
      setDevices(next);
      const saved = next.find((item) => item.address === input.address)!;
      setUnlocked((prev) => ({ ...prev, [saved.id]: input.privateKey }));
      return saved;
    },
    []
  );

  const removeDevice = useCallback((deviceId: string) => {
    const next = loadDevices().filter((item) => item.id !== deviceId);
    saveDevices(next);
    setDevices(next);
    setUnlocked((prev) => {
      const copy = { ...prev };
      delete copy[deviceId];
      return copy;
    });
  }, []);

  const value = useMemo(
    () => ({
      devices,
      legacyDevices,
      refreshDevices,
      isUnlocked,
      getUnlockedKey,
      getUnlockedKeyByAddress,
      unlockDevice,
      lockDevice,
      lockAllDevices,
      migrateDevice,
      saveDeviceEncrypted,
      removeDevice
    }),
    [
      devices,
      legacyDevices,
      refreshDevices,
      isUnlocked,
      getUnlockedKey,
      getUnlockedKeyByAddress,
      unlockDevice,
      lockDevice,
      lockAllDevices,
      migrateDevice,
      saveDeviceEncrypted,
      removeDevice
    ]
  );

  return <DeviceVaultContext.Provider value={value}>{children}</DeviceVaultContext.Provider>;
}

function deviceNeedsMigrationLocal(device: DeviceRecord): boolean {
  return Boolean(device.privateKey) && !device.encryptedPrivateKey;
}

export function useDeviceVault(): DeviceVaultValue {
  const ctx = useContext(DeviceVaultContext);
  if (!ctx) {
    throw new Error("useDeviceVault must be used within DeviceVaultProvider");
  }
  return ctx;
}
