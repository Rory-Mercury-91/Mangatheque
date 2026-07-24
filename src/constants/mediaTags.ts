/**
 * Dictionnaire commun genres / thèmes / démographies (manga + animé).
 * Clés = forme normalisée (minuscules, sans accents) ; valeurs = libellés FR canoniques.
 */

/** Alias EN/FR/Nautiljon/MAL → libellé FR Mangathèque. */
const MEDIA_TAG_CANONICAL: Record<string, string> = {
  // Démographies
  shonen: "Shônen",
  shounen: "Shônen",
  shojo: "Shôjo",
  shoujo: "Shôjo",
  seinen: "Seinen",
  josei: "Josei",
  kids: "Kodomo",
  kid: "Kodomo",
  kodomo: "Kodomo",
  kodomomuke: "Kodomo",
  autre: "Autre",
  other: "Autre",

  // Genres MAL / Jikan
  action: "Action",
  adventure: "Aventure",
  aventure: "Aventure",
  "avant garde": "Avant-garde",
  "avant-garde": "Avant-garde",
  dementia: "Avant-garde",
  "award winning": "Primé",
  "award-winning": "Primé",
  prime: "Primé",
  "boys love": "Boys' Love",
  "boys' love": "Boys' Love",
  bl: "Boys' Love",
  yaoi: "Boys' Love",
  "shonen ai": "Boys' Love",
  "shounen ai": "Boys' Love",
  "shonen-ai": "Boys' Love",
  "shônen-aï": "Boys' Love",
  "shonen-aï": "Boys' Love",
  comedy: "Comédie",
  comedie: "Comédie",
  comédie: "Comédie",
  drama: "Drame",
  drame: "Drame",
  ecchi: "Ecchi",
  erotica: "Érotique",
  erotique: "Érotique",
  érotique: "Érotique",
  fantasy: "Fantasy",
  fantastique: "Fantasy",
  fantaisie: "Fantasy",
  "girls love": "Girls' Love",
  "girls' love": "Girls' Love",
  gl: "Girls' Love",
  yuri: "Girls' Love",
  "shojo ai": "Girls' Love",
  "shoujo ai": "Girls' Love",
  "shojo-ai": "Girls' Love",
  "shôjo-aï": "Girls' Love",
  gourmet: "Gastronomie",
  gastronomie: "Gastronomie",
  cooking: "Gastronomie",
  food: "Gastronomie",
  hentai: "Hentai",
  horror: "Horreur",
  horreur: "Horreur",
  mystery: "Mystère",
  mystere: "Mystère",
  mystère: "Mystère",
  romance: "Romance",
  amour: "Romance",
  "sci-fi": "Science-fiction",
  "sci fi": "Science-fiction",
  scifi: "Science-fiction",
  "science fiction": "Science-fiction",
  "science-fiction": "Science-fiction",
  "slice of life": "Tranche de vie",
  "slice-of-life": "Tranche de vie",
  quotidien: "Tranche de vie",
  "tranche de vie": "Tranche de vie",
  sports: "Sport",
  sport: "Sport",
  suspense: "Suspense",
  thriller: "Suspense",
  supernatural: "Surnaturel",
  surnaturel: "Surnaturel",
  "work life": "Vie au travail",
  "work-life": "Vie au travail",
  workplace: "Vie au travail",
  "vie au travail": "Vie au travail",

  // Thèmes fréquents MAL / Nautiljon
  school: "Vie scolaire",
  "school life": "Vie scolaire",
  ecole: "Vie scolaire",
  école: "Vie scolaire",
  "vie scolaire": "Vie scolaire",
  mecha: "Mecha",
  military: "Militaire",
  militaire: "Militaire",
  music: "Musique",
  musique: "Musique",
  psychological: "Psychologie",
  psychologie: "Psychologie",
  parody: "Parodie",
  parodie: "Parodie",
  samurai: "Samouraï",
  samourai: "Samouraï",
  samouraï: "Samouraï",
  vampire: "Vampire",
  "magical girl": "Magical Girl",
  "magical girls": "Magical Girl",
  "mahou shoujo": "Magical Girl",
  "martial arts": "Arts martiaux",
  "arts martiaux": "Arts martiaux",
  "super power": "Super-pouvoirs",
  "super powers": "Super-pouvoirs",
  "super-pouvoirs": "Super-pouvoirs",
  historical: "Historique",
  historique: "Historique",
  histoire: "Historique",
  space: "Espace",
  espace: "Espace",
  police: "Police",
  demons: "Démons",
  demon: "Démons",
  démons: "Démons",
  game: "Jeu",
  jeu: "Jeu",
  cars: "Voitures",
  voitures: "Voitures",
  harem: "Harem",
  isekai: "Isekai",
  reincarnation: "Réincarnation",
  reincarnations: "Réincarnation",
  réincarnation: "Réincarnation",
  "time travel": "Voyage dans le temps",
  "voyage dans le temps": "Voyage dans le temps",
  "adult cast": "Adultes",
  anthropomorphic: "Anthropomorphe",
  anthropomorphe: "Anthropomorphe",
  cgdct: "CGDCT",
  childcare: "Garde d'enfants",
  "combat sports": "Sports de combat",
  "sports de combat": "Sports de combat",
  crossdressing: "Crossdressing",
  "cross-dressing": "Crossdressing",
  delinquents: "Délinquance",
  délinquance: "Délinquance",
  detective: "Détective",
  détective: "Détective",
  educational: "Éducatif",
  educatif: "Éducatif",
  éducatif: "Éducatif",
  "gag humor": "Humour absurde",
  gore: "Gore",
  "high stakes game": "Jeu à enjeux",
  idols: "Idoles",
  idoles: "Idoles",
  iyashikei: "Iyashikei",
  "love polygon": "Triangle amoureux",
  "triangle amoureux": "Triangle amoureux",
  mythology: "Mythologie",
  mythologie: "Mythologie",
  "organized crime": "Crime organisé",
  "crime organise": "Crime organisé",
  "crime organisé": "Crime organisé",
  "otaku culture": "Culture otaku",
  "culture otaku": "Culture otaku",
  "performing arts": "Arts de la scène",
  pets: "Animaux de compagnie",
  racing: "Course",
  "reverse harem": "Reverse harem",
  "romantic subtext": "Sous-texte romantique",
  showbiz: "Showbiz",
  "strategy game": "Jeu de stratégie",
  survival: "Survie",
  "team sports": "Sports d'équipe",
  "video game": "Jeu vidéo",
  "video games": "Jeu vidéo",
  "jeu video": "Jeu vidéo",
  "jeu vidéo": "Jeu vidéo",
  "visual arts": "Arts visuels",
  magic: "Magie",
  magie: "Magie",
  sorcellerie: "Magie",
  combats: "Action",
  ijime: "Harcèlement",
  harcelement: "Harcèlement",
  harcèlement: "Harcèlement",
  robots: "Androïde",
  robot: "Androïde",
  androide: "Androïde",
  androïde: "Androïde",
  yokai: "Yōkai",
  youkai: "Yōkai",
  yōkai: "Yōkai",
  medical: "Médical",
  medicals: "Médical",
  médical: "Médical",
};

/**
 * @description Clé de recherche insensible à la casse / accents / tirets.
 */
export function normalizeTagLookupKey(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’ʻ]/g, "'")
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @description Libellé FR d’affichage pour un genre, thème ou démographie.
 * @param tag - Valeur brute (MAL EN, Nautiljon FR, etc.).
 */
export function formatMediaTagLabel(tag: string | null | undefined): string {
  const raw = String(tag ?? "").trim();
  if (!raw) return "";
  const key = normalizeTagLookupKey(raw);
  return MEDIA_TAG_CANONICAL[key] ?? raw;
}

/**
 * @description Forme canonique FR à stocker (même logique que l’affichage).
 */
export function normalizeMediaTag(tag: string): string {
  return formatMediaTagLabel(tag);
}

/**
 * @description Normalise une liste de tags (dédupliquée, ordre conservé).
 */
export function normalizeMediaTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const canonical = normalizeMediaTag(tag);
    if (!canonical) continue;
    const dedupeKey = normalizeTagLookupKey(canonical);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(canonical);
  }
  return result;
}
