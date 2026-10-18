import { PeopleMobileConnect } from "@/components/wallet/PeopleMobileConnect";
export const metadata = { title: "People Wallet — connect", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function MobileConnectPage() {
  return <main className="mx-auto max-w-xl space-y-6 px-5 py-12"><h1 className="text-3xl font-semibold">People Wallet</h1><PeopleMobileConnect diagnostic /></main>;
}
