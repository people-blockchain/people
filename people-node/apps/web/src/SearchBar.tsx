import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addressPath, isWalletAddress } from "./address.js";
import { usePrefs } from "./PrefsContext.js";

export function SearchBar() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    if (isWalletAddress(trimmed)) {
      navigate(addressPath(trimmed));
      return;
    }
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t.searchPlaceholder}
        aria-label={t.search}
      />
      <button type="button" className="ghost" onClick={() => setQuery("")}>
        {t.walletClear}
      </button>
      <button type="submit">{t.search}</button>
    </form>
  );
}
