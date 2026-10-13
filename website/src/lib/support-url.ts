/** `https://t.me/Bot?start=support` → `...?start=support_<siteLocale>` so the bot answers in the site locale. */
export function supportUrlWithLocale(url: string, lang: string): string {
  if (!/^[a-z]{2,3}$/.test(lang)) return url;
  return url.replace(/([?&]start=)(support|bug)(?=&|$)/, `$1$2_${lang}`);
}
