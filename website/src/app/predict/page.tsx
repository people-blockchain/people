import type { Metadata } from "next";
import { PredictApp } from "./PredictApp";
export const metadata: Metadata = { title: "People Predict", description: "Binary prediction markets on PEOPLE Blockchain testnet. Test PPL only; no monetary prizes.", robots: { index: false, follow: false } };
export default function Page() { return <PredictApp view="markets" />; }
