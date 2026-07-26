/**
 * @description Normalise un n° d'épisode (1 décimale : 24.5, 24.9… — sans forcer au demi).
 * @param value - Valeur brute.
 */
export function normalizeEpisodeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 10) / 10;
}

/**
 * @description Affiche un n° d'épisode (entier ou demi) sans artefacts float.
 * @param value - Numéro d'épisode.
 */
export function formatEpisodeNumber(value: number): string {
  const n = normalizeEpisodeCount(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * @description Convertit un numéro d'épisode ADKami en numéro local (MAL).
 * @param adkamiEpisode - Numéro absolu côté ADKami.
 * @param offset - `adkami_episode_offset` de la fiche (ou from − 1).
 */
export function toLocalEpisodeNumber(
  adkamiEpisode: number,
  offset: number = 0,
): number {
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  return normalizeEpisodeCount(adkamiEpisode - safeOffset);
}

/**
 * @description Indique si l'épisode agenda est déjà vu (compteur MAL / local).
 * Les sorties futures ne sont jamais considérées comme vues.
 * Avec un offset, compare le compteur local à (épisode ADKami − offset).
 * @param episodeNumber - Numéro d'épisode de la case agenda (ADKami).
 * @param episodesWatched - Compteur d'épisodes déjà vus pour la série.
 * @param releaseAt - Date/heure de diffusion (ISO) ; si future, retourne false.
 * @param episodeOffset - Décalage ADKami → local (`adkami_episode_offset`).
 */
export function isAgendaEpisodeWatched(
  episodeNumber: number | null | undefined,
  episodesWatched: number | null | undefined,
  releaseAt?: string | Date | null,
  episodeOffset: number = 0,
): boolean {
  if (episodeNumber == null || episodeNumber <= 0) return false;
  if (releaseAt != null) {
    const release =
      typeof releaseAt === "string" ? new Date(releaseAt) : releaseAt;
    if (!Number.isNaN(release.getTime()) && release.getTime() > Date.now()) {
      return false;
    }
  }
  const localEpisode = toLocalEpisodeNumber(episodeNumber, episodeOffset);
  if (localEpisode <= 0) return false;
  return normalizeEpisodeCount(episodesWatched ?? 0) >= localEpisode;
}

/**
 * @description Libellé uniforme « Épisode X » (numéro local si offset, sinon ADKami).
 * Ignore le libellé brut ADKami (« Episode 16 », « Ép. 84 ») pour un affichage cohérent.
 * @param episodeNumber - Numéro ADKami.
 * @param _episodeLabel - Conservé pour compatibilité d'appel (non utilisé pour le rendu).
 * @param episodeOffset - Décalage ADKami → local.
 */
export function formatAgendaEpisodeLabel(
  episodeNumber: number | null | undefined,
  _episodeLabel?: string | null,
  episodeOffset: number = 0,
): string {
  const offset = Number.isFinite(episodeOffset) ? episodeOffset : 0;
  if (episodeNumber != null && episodeNumber > 0) {
    const local = toLocalEpisodeNumber(episodeNumber, offset);
    if (local > 0) {
      return `Épisode ${formatEpisodeNumber(local)}`;
    }
    return `Épisode ${formatEpisodeNumber(episodeNumber)}`;
  }
  return "Épisode";
}
