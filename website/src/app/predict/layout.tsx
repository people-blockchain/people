import type { Metadata } from "next";
import "./predict.css";
export const metadata: Metadata = { title: "People Predict", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
