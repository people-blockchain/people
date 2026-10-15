import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PREDICT_ENABLED } from "@/lib/features";
import "./predict.css";
export const metadata: Metadata = { title: "People Predict", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  // hidden: PeoplePredict (feature flag)
  if (!PREDICT_ENABLED) notFound();
  return children;
}
