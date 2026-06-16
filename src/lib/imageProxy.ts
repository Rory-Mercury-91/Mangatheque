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

const resolvedCoverCache = new Map<string, string>();

/**
 * @description Convertit une data URL en blob URL (moins coûteux pour le DOM mobile).
 */
function dataUrlToBlobUrl(dataUrl: string): string {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
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
  const cached = resolvedCoverCache.get(raw);
  if (cached) {
    return cached;
  }

  if (!needsNautiljonProxy(raw)) {
    resolvedCoverCache.set(raw, raw);
    return raw;
  }

  if (!isTauriRuntime()) {
    resolvedCoverCache.set(raw, raw);
    return raw;
  }

  if (isMobileRuntime()) {
    try {
      const dataUrl = await invoke<string>("fetch_cover_image_data_url", { url: raw });
      const blobUrl = dataUrl.startsWith("data:") ? dataUrlToBlobUrl(dataUrl) : dataUrl;
      resolvedCoverCache.set(raw, blobUrl);
      return blobUrl;
    } catch (err) {
      console.warn("Proxy image mobile indisponible :", err);
      return "";
    }
  }

  if (isDesktopRuntime()) {
    const proxied = httpProxyUrl(raw);
    resolvedCoverCache.set(raw, proxied);
    return proxied;
  }

  resolvedCoverCache.set(raw, raw);
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
