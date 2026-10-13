import { isWalletAddress } from "./address.js";

export interface AddressBookEntry {
  address: string;
  label: string;
  favorite: boolean;
  createdAt: number;
}

const ADDRESS_BOOK_KEY = "ovn-address-book";

export function loadAddressBook(): AddressBookEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADDRESS_BOOK_KEY) ?? "[]") as AddressBookEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAddressBook(entries: AddressBookEntry[]): void {
  localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(entries));
}

export function upsertAddressBookEntry(input: {
  address: string;
  label: string;
  favorite?: boolean;
}): AddressBookEntry[] {
  const address = input.address.trim();
  if (!isWalletAddress(address)) {
    throw new Error("invalid_address");
  }
  const label = input.label.trim() || address.slice(0, 10);
  const current = loadAddressBook();
  const existing = current.find((item) => item.address.toLowerCase() === address.toLowerCase());
  const next = current.filter((item) => item.address.toLowerCase() !== address.toLowerCase());
  next.push({
    address,
    label,
    favorite: input.favorite ?? existing?.favorite ?? false,
    createdAt: existing?.createdAt ?? Date.now()
  });
  next.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.label.localeCompare(b.label));
  saveAddressBook(next);
  return next;
}

export function toggleAddressFavorite(address: string): AddressBookEntry[] {
  const next = loadAddressBook().map((item) =>
    item.address.toLowerCase() === address.toLowerCase() ? { ...item, favorite: !item.favorite } : item
  );
  next.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.label.localeCompare(b.label));
  saveAddressBook(next);
  return next;
}

export function removeAddressBookEntry(address: string): AddressBookEntry[] {
  const next = loadAddressBook().filter((item) => item.address.toLowerCase() !== address.toLowerCase());
  saveAddressBook(next);
  return next;
}
