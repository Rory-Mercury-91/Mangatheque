import { invoke } from "@tauri-apps/api/core";
import {
  isDesktopRuntime,
  isMobileRuntime,
  isTauriRuntime,
} from "@/lib/platform";

const PROXY_BASE = "http://127.0.0.1:40000";

/**
 * @description Indique si l'URL doit passer par le proxy Nautiljon (referer requis).
 */
function needsNautiljonProxy(url: string): boolean {
  return url.includes("nautiljon.com");
}

/**
 * @description URL proxy HTTP locale (desktop — serveur Rust sur le port 40000).
 */
function httpProxyUrl(url: string): string {
  return `${PROXY_BASE}/api/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * @description Résout une URL de couverture pour affichage (async, compatible mobile).
 * @param url - URL brute de la couverture.
 * @returns URL affichable (directe, proxy HTTP ou data URL).
 */
export async function resolveCoverImageUrl(
  url: string | null | undefined,
): Promise<string> {
  if (!url?.trim()) {
    return "";
  }

  const raw = url.trim();

  if (!needsNautiljonProxy(raw)) {
    return raw;
  }

  if (!isTauriRuntime()) {
    return raw;
  }

  if (isMobileRuntime()) {
    try {
      return await invoke<string>("fetch_cover_image_data_url", { url: raw });
    } catch (err) {
      console.warn("Proxy image mobile indisponible :", err);
      return "";
    }
  }

  if (isDesktopRuntime()) {
    return httpProxyUrl(raw);
  }

  return raw;
}

/**
 * @description Variante synchrone pour le desktop (legacy).
 * @deprecated Préférer resolveCoverImageUrl.
 */
export function proxyCoverImage(url: string | null | undefined): string {
  if (!url?.trim()) {
    return "";
  }

  const raw = url.trim();

  if (!needsNautiljonProxy(raw) || !isDesktopRuntime()) {
    return raw;
  }

  return httpProxyUrl(raw);
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
