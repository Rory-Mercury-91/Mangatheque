/**
 * @description Remplace un tag par son libellé canonique Mangathèque.
 */
function replaceCanonicalTag(tag: string): string {
  const trimmed = tag.trim();
  if (!trimmed) {
    return "";
  }

  const replacements: Record<string, string> = {
    Quotidien: "Tranche de vie",
    "Slice of Life": "Tranche de vie",
    Fantastique: "Fantasy",
    Fantaisie: "Fantasy",
    Combats: "Action",
    "School Life": "Vie scolaire",
    École: "Vie scolaire",
    Ecole: "Vie scolaire",
    Ijime: "Harcèlement",
    Sorcellerie: "Magie",
    "Cross-dressing": "Crossdressing",
    "Shônen-aï": "Boys' Love",
    "Shonen Ai": "Boys' Love",
    BL: "Boys' Love",
    "Shôjo-aï": "Girls' Love",
    "Shojo-ai": "Girls' Love",
    Yuri: "Girls' Love",
    Robots: "Androïde",
    Robot: "Androïde",
    Yokai: "Yōkai",
  };

  return replacements[trimmed] ?? trimmed;
}

/**
 * @description Déduplique une liste de tags en préservant l'ordre.
 */
function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

/**
 * @description Normalise genres et thèmes vers la liste canonique de la bibliothèque.
 * @param genres - Genres bruts (import ou formulaire).
 * @param themes - Thèmes bruts.
 */
export function normalizeWorkTagLists(
  genres: string[],
  themes: string[],
): { genres: string[]; themes: string[] } {
  let nextGenres = genres.map(replaceCanonicalTag).filter(Boolean);
  let nextThemes = themes.map(replaceCanonicalTag).filter(Boolean);

  const hasAmour =
    nextGenres.includes("Amour") || nextThemes.includes("Amour");
  if (hasAmour) {
    nextGenres = nextGenres.filter((tag) => tag !== "Amour");
    nextThemes = nextThemes.filter((tag) => tag !== "Amour");
    if (!nextGenres.includes("Romance")) {
      nextGenres.push("Romance");
    }
  }

  const hasHistoire =
    nextGenres.includes("Histoire") || nextThemes.includes("Histoire");
  if (hasHistoire) {
    nextGenres = nextGenres.filter((tag) => tag !== "Histoire");
    nextThemes = nextThemes.filter((tag) => tag !== "Histoire");
    if (!nextGenres.includes("Historique")) {
      nextGenres.push("Historique");
    }
  }

  nextGenres = nextGenres.filter((tag) => tag !== "Homosexualité");
  nextThemes = nextThemes.filter((tag) => tag !== "Homosexualité");

  return {
    genres: dedupeTags(nextGenres),
    themes: dedupeTags(nextThemes),
  };
}

/**
 * @description Normalise une seule liste (genres ou thèmes) sans règles croisées.
 * @param tags - Tags bruts.
 */
export function normalizeWorkTags(tags: string[]): string[] {
  return dedupeTags(tags.map(replaceCanonicalTag).filter(Boolean));
}
