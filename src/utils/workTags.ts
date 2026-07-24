import {
  normalizeMediaTag,
  normalizeMediaTagList,
  normalizeTagLookupKey,
} from "@/constants/mediaTags";

/**
 * @description Normalise genres et thèmes vers la liste canonique de la bibliothèque.
 * @param genres - Genres bruts (import ou formulaire).
 * @param themes - Thèmes bruts.
 */
export function normalizeWorkTagLists(
  genres: string[],
  themes: string[],
): { genres: string[]; themes: string[] } {
  let nextGenres = normalizeMediaTagList(genres);
  let nextThemes = normalizeMediaTagList(themes);

  // « Amour » → Romance (déjà mappé) : forcer côté genres.
  if (nextThemes.includes("Romance") && !nextGenres.includes("Romance")) {
    nextGenres = [...nextGenres, "Romance"];
  }
  nextThemes = nextThemes.filter((tag) => tag !== "Romance");

  // « Histoire » → Historique (déjà mappé) : forcer côté genres.
  if (nextThemes.includes("Historique") && !nextGenres.includes("Historique")) {
    nextGenres = [...nextGenres, "Historique"];
  }
  nextThemes = nextThemes.filter((tag) => tag !== "Historique");

  nextGenres = nextGenres.filter(
    (tag) => normalizeTagLookupKey(tag) !== "homosexualite",
  );
  nextThemes = nextThemes.filter(
    (tag) => normalizeTagLookupKey(tag) !== "homosexualite",
  );

  return {
    genres: nextGenres,
    themes: nextThemes,
  };
}

/**
 * @description Normalise une seule liste (genres ou thèmes) sans règles croisées.
 * @param tags - Tags bruts.
 */
export function normalizeWorkTags(tags: string[]): string[] {
  return normalizeMediaTagList(tags.map(normalizeMediaTag));
}
