import { Logo } from "@/components/Logo";

/** Instant route feedback while the login segment resolves on the server. */
export default function LoginLoading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 text-ink"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Logo alt="PEOPLE" className="h-9 opacity-80" />
      <p className="mt-6 text-sm font-medium text-ink-3">…</p>
    </div>
  );
}
