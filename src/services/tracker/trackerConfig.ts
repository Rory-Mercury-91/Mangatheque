import type { TrackerProvider } from "@/types/tracker";

/**
 * @description Identifiant client AniList (app foyer, une seule clé).
 */
export function getAniListClientId(): string {
  return String(import.meta.env.VITE_ANILIST_CLIENT_ID ?? "").trim();
}

/**
 * @description Identifiant client MyAnimeList (app foyer, une seule clé).
 */
export function getMalClientId(): string {
  return String(import.meta.env.VITE_MAL_CLIENT_ID ?? "").trim();
}

/**
 * @description Indique si le provider est configuré côté env.
 */
export function isTrackerProviderConfigured(provider: TrackerProvider): boolean {
  if (provider === "anilist") {
    return getAniListClientId().length > 0;
  }
  return getMalClientId().length > 0;
}

/**
 * @description Message d'aide si les clés app sont absentes.
 */
export function getTrackerConfigHelpMessage(provider: TrackerProvider): string {
  if (provider === "anilist") {
    return "Configurez VITE_ANILIST_CLIENT_ID dans .env (et le secret GitHub Actions).";
  }
  return "Configurez VITE_MAL_CLIENT_ID dans .env (et le secret GitHub Actions).";
}
