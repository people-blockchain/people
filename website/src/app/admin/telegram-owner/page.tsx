import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Telegram owner chat", robots: { index: false } };

/** Friendly landing for /api/bugs/admin/telegram-owner when the visitor is not a site admin. */
export default function TelegramOwnerForbiddenPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Нет доступа администратора</h1>
      <p className="mt-4 opacity-80">
        Эта страница доступна только администратору сайта. Войдите на сайте через email-аккаунт администратора
        и откройте ссылку снова, или используйте одноразовую ссылку владельца для @PeopleVerifyBot.
      </p>
      <p className="mt-6 text-sm opacity-60">
        Admin access required. Sign in with the admin email account and retry, or use the one-time owner link for
        @PeopleVerifyBot.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Link href="/login" className="underline">Войти / Sign in</Link>
        <Link href="/" className="underline">На главную / Home</Link>
      </div>
    </main>
  );
}
