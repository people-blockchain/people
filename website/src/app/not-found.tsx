import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-neutral-500">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">This page could not be found.</h1>
        <p className="mt-4 max-w-md text-neutral-600">
          The link may be outdated or you may not have access to this page.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Back to home
        </Link>
      </main>
      <Footer />
    </div>
  );
}
