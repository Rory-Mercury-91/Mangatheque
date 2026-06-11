import { isTauriRuntime } from "@/lib/platform";

const PROXY_BASE = "http://127.0.0.1:40000";

/**
 * @description Transforme une URL Nautiljon en URL proxy locale (hotlink + cache Tauri).
 * @param url - URL brute de la couverture.
 * @returns URL affichable dans l'app, ou chaîne vide si absente.
 */
export function proxyCoverImage(url: string | null | undefined): string {
  if (!url?.trim()) {
    return "";
  }

  const raw = url.trim();

  if (!raw.includes("nautiljon.com")) {
    return raw;
  }

  if (!isTauriRuntime()) {
    return raw;
  }

  return `${PROXY_BASE}/api/proxy-image?url=${encodeURIComponent(raw)}`;
}

/** Placeholder SVG si la couverture est indisponible. */
export const NO_COVER_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="170" viewBox="0 0 120 170">
      <rect width="120" height="170" fill="#1a1d26"/>
      <text x="60" y="88" text-anchor="middle" fill="#6b7280" font-size="11" font-family="sans-serif">Pas de couverture</text>
    </svg>`,
  );
