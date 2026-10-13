/** Common ISO 3166-1 alpha-2 codes for self-declared founder country (not exhaustive). */
export const FOUNDER_COUNTRY_OPTIONS: { code: string; name: string }[] = [
  { code: "GE", name: "Georgia" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "PL", name: "Poland" },
  { code: "UA", name: "Ukraine" },
  { code: "RU", name: "Russia" },
  { code: "TR", name: "Turkey" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "VN", name: "Vietnam" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "EG", name: "Egypt" },
  { code: "NG", name: "Nigeria" },
  { code: "ZA", name: "South Africa" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "AM", name: "Armenia" },
  { code: "AZ", name: "Azerbaijan" },
];

export function countryFlagEmoji(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🌐";
  const points = [...c].map((ch) => 0x1f1e6 - 65 + ch.charCodeAt(0));
  return String.fromCodePoint(...points);
}
