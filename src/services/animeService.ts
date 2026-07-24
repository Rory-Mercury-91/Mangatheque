import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  deriveAnimeListStatus,
  deriveAnimeNsfwFromRating,
  mergeAnimeNsfwLevels,
  normalizeAnimeAiringStatus,
  normalizeAnimeNsfw,
  normalizeAnimeRating,
} from "@/constants/animeStatus";
import { logActivity } from "@/services/activityLogService";
import { upsertAnimeProgress } from "@/services/animeProgressService";
import { fetchJikanAnimeFull } from "@/services/jikan/jikanAnimeApi";
import {
  fetchMalAnimeDetail,
  type MalAnimeDetail,
} from "@/services/tracker/malAnimeApi";
import { fetchTrackerAccessToken } from "@/services/tracker/trackerTokenService";
import type {
  Anime,
  AnimePicture,
  AnimeRecommendationEntry,
  AnimeRelatedEntry,
  AnimeStreamingEntry,
} from "@/types/anime";
import type { AnimeFormValues } from "@/types/animeForm";
import { persistCoverImageUrl } from "@/utils/coverUrl";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import { normalizeMediaTagList } from "@/constants/mediaTags";

/**
 * @description Statut de diffusion canonique à stocker (clés MAL normalisées).
 */
function canonicalizeAiringStatus(value: string | null | undefined): string | null {
  return normalizeAnimeAiringStatus(value) ?? (value?.trim() || null);
}

/**
 * @description Classification MAL canonique à stocker.
 */
function canonicalizeRating(value: string | null | undefined): string | null {
  return normalizeAnimeRating(value) ?? (value?.trim() || null);
}

type AnimeRow = Omit<
  Anime,
  "streaming" | "pictures" | "related" | "recommendations"
> & {
  streaming: unknown;
  pictures: unknown;
  related: unknown;
  recommendations: unknown;
};

/**
 * @description Mappe une ligne Supabase vers le type Anime.
 */
export function mapAnimeRow(row: AnimeRow): Anime {
  return {
    ...row,
    mal_id: Number(row.mal_id),
    adkami_id: row.adkami_id != null ? Number(row.adkami_id) : null,
    adkami_section: row.adkami_section?.trim() || null,
    source_url: row.source_url ?? null,
    genres: row.genres ?? [],
    themes: row.themes ?? [],
    demographics: row.demographics ?? [],
    explicit_genres: row.explicit_genres ?? [],
    studios: row.studios ?? [],
    streaming: (row.streaming as AnimeStreamingEntry[]) ?? [],
    pictures: (row.pictures as AnimePicture[]) ?? [],
    related: ((row.related as AnimeRelatedEntry[]) ?? []).map((entry) => ({
      ...entry,
      type: String(entry.type).toLowerCase(),
    })),
    recommendations: (row.recommendations as AnimeRecommendationEntry[]) ?? [],
  };
}

/**
 * @description Liste tous les animés (plus récents d'abord), paginé côté API.
 */
export async function fetchAnimes(): Promise<Anime[]> {
  const supabase = getSupabaseClient();
  const pageSize = 1000;
  const rows: AnimeRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("animes")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Impossible de charger les animés : ${error.message}`);
    }

    const batch = (data as AnimeRow[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows.map(mapAnimeRow);
}

/**
 * @description Charge un animé par identifiant local.
 */
export async function fetchAnimeById(id: string): Promise<Anime | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("animes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossible de charger l'animé : ${error.message}`);
  }
  return data ? mapAnimeRow(data as AnimeRow) : null;
}

/**
 * @description Recherche un animé local par MAL ID.
 */
export async function fetchAnimeByMalId(malId: number): Promise<Anime | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("animes")
    .select("*")
    .eq("mal_id", malId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossible de chercher l'animé MAL : ${error.message}`);
  }
  return data ? mapAnimeRow(data as AnimeRow) : null;
}

/**
 * @description Ensemble des MAL IDs animés présents en bibliothèque.
 */
export async function fetchLocalAnimeMalIds(): Promise<Set<number>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("animes").select("mal_id");
  if (error) {
    throw new Error(`Impossible de lister les MAL IDs : ${error.message}`);
  }
  return new Set((data ?? []).map((row) => Number(row.mal_id)));
}

/**
 * @description Animés locaux qui référencent un manga MAL dans leurs relations.
 * @param mangaMalId - Identifiant MAL du manga.
 */
export async function fetchAnimesRelatedToMangaMalId(
  mangaMalId: number,
): Promise<Anime[]> {
  const animes = await fetchAnimes();
  return animes.filter((anime) =>
    anime.related.some(
      (entry) =>
        entry.malId === mangaMalId &&
        String(entry.type).toLowerCase() === "manga",
    ),
  );
}

/**
 * @description Enrichit les relations (et tags vides) via Jikan, puis persiste.
 * @param anime - Animé local éventuellement sans relations MAL.
 * @returns Animé mis à jour (ou inchangé si rien à ajouter).
 */
export async function enrichAnimeRelationsFromJikan(
  anime: Anime,
): Promise<Anime> {
  let jikan: Awaited<ReturnType<typeof fetchJikanAnimeFull>>;
  try {
    jikan = await fetchJikanAnimeFull(anime.mal_id);
  } catch (err) {
    console.error("[jikan] Enrichissement relations impossible :", err);
    return anime;
  }
  if (!jikan) return anime;

  const relatedByKey = new Map<string, AnimeRelatedEntry>();
  for (const item of anime.related) {
    const type = String(item.type).toLowerCase();
    relatedByKey.set(`${type}:${item.malId}`, { ...item, type });
  }
  let changed = relatedByKey.size !== anime.related.length;
  for (const item of jikan.related) {
    const type = String(item.type).toLowerCase();
    const key = `${type}:${item.malId}`;
    const existing = relatedByKey.get(key);
    if (!existing) {
      relatedByKey.set(key, { ...item, type });
      changed = true;
    } else if (!existing.url && item.url) {
      existing.url = item.url;
      changed = true;
    }
  }

  const nextRelated = Array.from(relatedByKey.values());
  const nextThemes =
    anime.themes.length > 0
      ? anime.themes
      : normalizeMediaTagList(jikan.themes);
  const nextDemographics =
    anime.demographics.length > 0
      ? anime.demographics
      : normalizeMediaTagList(jikan.demographics);
  const nextExplicit =
    anime.explicit_genres.length > 0
      ? anime.explicit_genres
      : normalizeMediaTagList(jikan.explicitGenres);
  const nextStreaming =
    anime.streaming.length > 0 ? anime.streaming : jikan.streaming;

  const themesChanged = nextThemes !== anime.themes;
  const demosChanged = nextDemographics !== anime.demographics;
  const explicitChanged = nextExplicit !== anime.explicit_genres;
  const streamingChanged = nextStreaming !== anime.streaming;

  if (
    !changed &&
    !themesChanged &&
    !demosChanged &&
    !explicitChanged &&
    !streamingChanged
  ) {
    return anime;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("animes")
    .update({
      related: nextRelated,
      themes: nextThemes,
      demographics: nextDemographics,
      explicit_genres: nextExplicit,
      streaming: nextStreaming,
    })
    .eq("id", anime.id)
    .select("*")
    .single();

  if (error) {
    console.error("[jikan] Persistance relations :", error.message);
    return {
      ...anime,
      related: nextRelated,
      themes: nextThemes,
      demographics: nextDemographics,
      explicit_genres: nextExplicit,
      streaming: nextStreaming,
    };
  }

  return mapAnimeRow(data as AnimeRow);
}

function buildAnimeRowFromForm(form: AnimeFormValues) {
  if (form.malId == null) {
    throw new Error("Un identifiant MyAnimeList est requis.");
  }
  if (!form.title.trim()) {
    throw new Error("Le titre est obligatoire.");
  }

  return {
    mal_id: form.malId,
    title: form.title.trim(),
    title_en: form.titleEn.trim() || null,
    title_ja: form.titleJa.trim() || null,
    title_fr: form.titleFr.trim() || null,
    cover_url: persistCoverImageUrl(form.coverUrl),
    source_url: form.sourceUrl.trim() || null,
    adkami_id: form.adkamiId,
    adkami_section: form.adkamiId
      ? form.adkamiSection.trim() || "anime"
      : null,
    media_type: form.mediaType.trim() || null,
    source: form.source.trim() || null,
    status: canonicalizeAiringStatus(form.status),
    season: form.season.trim() || null,
    year: form.year,
    episodes: form.episodes,
    duration_seconds: form.durationSeconds,
    broadcast_day: form.broadcastDay.trim() || null,
    broadcast_time: form.broadcastTime.trim() || null,
    rating: canonicalizeRating(form.rating),
    nsfw: normalizeAnimeNsfw(form.nsfw),
    synopsis: form.synopsis.trim() || null,
    genres: normalizeMediaTagList(form.genres),
    themes: normalizeMediaTagList(form.themes),
    demographics: normalizeMediaTagList(form.demographics),
    explicit_genres: normalizeMediaTagList(form.explicitGenres),
    studios: form.studios,
    streaming: form.streaming
      .map((entry) => ({
        name: entry.name.trim(),
        url: entry.url.trim(),
      }))
      .filter((entry) => entry.name && entry.url),
    pictures: form.pictures,
    related: form.related,
    recommendations: form.recommendations,
  };
}

/**
 * @description Crée un animé + progression initiale pour l'utilisateur courant.
 * @param form - Valeurs du formulaire.
 * @param options.onDuplicate - `throw` (défaut, UI) ou `return` (sync idempotente).
 */
export async function createAnime(
  form: AnimeFormValues,
  options?: { onDuplicate?: "throw" | "return" },
): Promise<Anime> {
  const onDuplicate = options?.onDuplicate ?? "throw";
  const supabase = getSupabaseClient();
  const existing = await fetchAnimeByMalId(form.malId!);
  if (existing) {
    if (onDuplicate === "return") return existing;
    throw new Error(
      `L'animé « ${existing.title} » (MAL ${existing.mal_id}) est déjà en bibliothèque.`,
    );
  }

  const row = buildAnimeRowFromForm(form);
  const { data, error } = await supabase
    .from("animes")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    if (/duplicate|unique|already|23505/i.test(error.message)) {
      const raced = await fetchAnimeByMalId(form.malId!);
      if (raced) {
        if (onDuplicate === "return") return raced;
        throw new Error(
          `L'animé « ${raced.title} » (MAL ${raced.mal_id}) est déjà en bibliothèque.`,
        );
      }
    }
    throw new Error(`Création impossible : ${error.message}`);
  }

  const anime = mapAnimeRow(data as AnimeRow);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const abandoned = form.listStatus === "dropped";
    await upsertAnimeProgress(user.id, anime.id, {
      listStatus: deriveAnimeListStatus(
        form.episodesWatched,
        form.episodes,
        abandoned,
      ),
      episodesWatched: form.episodesWatched,
      startedAt: form.startedAt,
      finishedAt: form.finishedAt,
    });
  }

  await logActivity({
    actionType: "anime_create",
    entityType: "anime",
    entityId: anime.id,
    entityTitle: anime.title,
    reason: `Animé « ${anime.title} » ajouté.`,
  });

  return anime;
}

/**
 * @description Met à jour un animé existant.
 */
export async function updateAnime(
  animeId: string,
  form: AnimeFormValues,
): Promise<Anime> {
  const supabase = getSupabaseClient();
  const row = buildAnimeRowFromForm(form);

  if (form.malId != null) {
    const other = await fetchAnimeByMalId(form.malId);
    if (other && other.id !== animeId) {
      throw new Error(
        `MAL ${form.malId} est déjà lié à « ${other.title} ».`,
      );
    }
  }

  const { data, error } = await supabase
    .from("animes")
    .update(row)
    .eq("id", animeId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Mise à jour impossible : ${error.message}`);
  }

  const anime = mapAnimeRow(data as AnimeRow);
  await logActivity({
    actionType: "anime_update",
    entityType: "anime",
    entityId: anime.id,
    entityTitle: anime.title,
    reason: `Animé « ${anime.title} » modifié.`,
  });
  return anime;
}

/**
 * @description Supprime un animé du catalogue.
 */
export async function deleteAnime(animeId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const existing = await fetchAnimeById(animeId);
  const { error } = await supabase.from("animes").delete().eq("id", animeId);
  if (error) {
    throw new Error(`Suppression impossible : ${error.message}`);
  }
  if (existing) {
    await logActivity({
      actionType: "anime_delete",
      entityType: "anime",
      entityId: animeId,
      entityTitle: existing.title,
      reason: `Animé « ${existing.title} » supprimé.`,
    });
  }
}

/**
 * @description Fusionne MAL + Jikan puis remplit un formulaire.
 */
export async function buildAnimeFormFromMalId(
  malId: number,
): Promise<AnimeFormValues> {
  const token = await fetchTrackerAccessToken("mal");
  if (!token) {
    throw new Error("Connectez MyAnimeList pour importer un animé.");
  }

  const mal = await fetchMalAnimeDetail(token, malId);
  let jikan = null as Awaited<ReturnType<typeof fetchJikanAnimeFull>>;
  try {
    jikan = await fetchJikanAnimeFull(malId);
  } catch {
    jikan = null;
  }

  return mergeMalJikanToForm(mal, jikan);
}

/**
 * @description Fusionne détail MAL et enrichissement Jikan en valeurs formulaire.
 */
export function mergeMalJikanToForm(
  mal: MalAnimeDetail,
  jikan: Awaited<ReturnType<typeof fetchJikanAnimeFull>>,
): AnimeFormValues {
  const relatedByKey = new Map<string, AnimeFormValues["related"][number]>();
  for (const item of mal.related) {
    const type = String(item.type).toLowerCase();
    relatedByKey.set(`${type}:${item.malId}`, { ...item, type });
  }
  for (const item of jikan?.related ?? []) {
    const type = String(item.type).toLowerCase();
    const key = `${type}:${item.malId}`;
    const existing = relatedByKey.get(key);
    if (!existing) {
      relatedByKey.set(key, { ...item, type });
    } else {
      if (!existing.url && item.url) existing.url = item.url;
      if (!existing.image && "image" in item) {
        // Jikan n'a pas d'image ; conserver MAL
      }
    }
  }

  const titleFr = jikan?.titleFr ?? "";
  const list = mal.listStatus;

  return {
    malId: mal.id,
    title: mal.title,
    titleEn: mal.titleEn ?? "",
    titleJa: mal.titleJa ?? "",
    titleFr,
    coverUrl: mal.coverUrl ?? "",
    sourceUrl: "",
    adkamiId: null,
    adkamiSection: "anime",
    mediaType: mal.mediaType ?? "tv",
    source: mal.source ?? "",
    status: canonicalizeAiringStatus(mal.status) ?? "",
    season: mal.season ?? jikan?.season ?? "",
    year: mal.year ?? jikan?.year ?? null,
    episodes: mal.episodes,
    durationSeconds: mal.durationSeconds,
    broadcastDay: mal.broadcastDay ?? "",
    broadcastTime: mal.broadcastTime ?? "",
    rating: canonicalizeRating(mal.rating) ?? "",
    nsfw: mergeAnimeNsfwLevels(
      mal.nsfw,
      deriveAnimeNsfwFromRating(mal.rating),
    ),
    synopsis: mal.synopsis ?? "",
    genres: normalizeMediaTagList(mal.genres),
    themes: normalizeMediaTagList(jikan?.themes ?? []),
    demographics: normalizeMediaTagList(jikan?.demographics ?? []),
    explicitGenres: normalizeMediaTagList(jikan?.explicitGenres ?? []),
    studios: mal.studios,
    streaming: jikan?.streaming ?? [],
    pictures: mal.pictures,
    related: Array.from(relatedByKey.values()),
    recommendations: mal.recommendations,
    listStatus: list?.status ?? "plan_to_watch",
    episodesWatched: list?.episodesWatched ?? 0,
    startedAt: list?.startedAt ?? null,
    finishedAt: list?.finishedAt ?? null,
  };
}

/**
 * @description Convertit une entité Anime en valeurs de formulaire.
 */
export function animeToFormValues(anime: Anime): AnimeFormValues {
  return {
    malId: anime.mal_id,
    title: anime.title,
    titleEn: anime.title_en ?? "",
    titleJa: anime.title_ja ?? "",
    titleFr: anime.title_fr ?? "",
    coverUrl: anime.cover_url ?? "",
    sourceUrl: anime.source_url ?? "",
    adkamiId: anime.adkami_id,
    adkamiSection: anime.adkami_section?.trim() || "anime",
    mediaType: anime.media_type ?? "",
    source: anime.source ?? "",
    status: canonicalizeAiringStatus(anime.status) ?? "",
    season: anime.season ?? "",
    year: anime.year,
    episodes: anime.episodes,
    durationSeconds: anime.duration_seconds,
    broadcastDay: anime.broadcast_day ?? "",
    broadcastTime: anime.broadcast_time ?? "",
    rating: canonicalizeRating(anime.rating) ?? "",
    nsfw: normalizeAnimeNsfw(anime.nsfw),
    synopsis: anime.synopsis ?? "",
    genres: anime.genres,
    themes: anime.themes,
    demographics: anime.demographics,
    explicitGenres: anime.explicit_genres,
    studios: anime.studios,
    streaming: anime.streaming,
    pictures: anime.pictures,
    related: anime.related,
    recommendations: anime.recommendations,
    listStatus: "plan_to_watch",
    episodesWatched: 0,
    startedAt: null,
    finishedAt: null,
  };
}

/**
 * @description Met à jour uniquement le synopsis (sans journal d’activité).
 * @param animeId - Identifiant de l’animé.
 * @param synopsis - Synopsis nettoyé / traduit.
 */
export async function patchAnimeSynopsis(
  animeId: string,
  synopsis: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("animes")
    .update({ synopsis: synopsis.trim() || null })
    .eq("id", animeId);
  if (error) {
    throw new Error(`Mise à jour du synopsis impossible : ${error.message}`);
  }
}

/**
 * @description Met à jour uniquement les liens streaming.
 * @param animeId - Identifiant de l’animé.
 * @param streaming - Liste name + URL.
 */
export async function patchAnimeStreaming(
  animeId: string,
  streaming: AnimeStreamingEntry[],
): Promise<void> {
  const supabase = getSupabaseClient();
  const cleaned = streaming
    .map((entry) => ({
      name: entry.name.trim(),
      url: entry.url.trim(),
    }))
    .filter((entry) => entry.name && entry.url);

  const { error } = await supabase
    .from("animes")
    .update({ streaming: cleaned })
    .eq("id", animeId);
  if (error) {
    throw new Error(`Mise à jour du streaming impossible : ${error.message}`);
  }
}

/**
 * @description Recherche locale par titre (anti-doublon souple).
 */
export async function findAnimeByTitle(
  title: string,
  excludeId?: string,
): Promise<Anime | null> {
  const needle = normalizeTitleForComparison(title);
  if (!needle) return null;
  const all = await fetchAnimes();
  return (
    all.find(
      (anime) =>
        anime.id !== excludeId &&
        normalizeTitleForComparison(anime.title) === needle,
    ) ?? null
  );
}
