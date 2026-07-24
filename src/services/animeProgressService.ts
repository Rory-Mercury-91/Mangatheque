import { getSupabaseClient } from "@/lib/supabaseClient";
import type { AnimeListStatus, UserAnimeProgress } from "@/types/anime";
import { normalizeAnimeListStatus } from "@/constants/animeStatus";

/**
 * @description Charge toutes les progressions animé (foyer).
 */
export async function fetchAllAnimeProgress(): Promise<UserAnimeProgress[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("user_anime_progress").select("*");
  if (error) {
    throw new Error(`Impossible de charger les progressions : ${error.message}`);
  }
  return (data ?? []).map(mapProgressRow);
}

/**
 * @description Progressions d'un utilisateur donné.
 */
export async function fetchAnimeProgressForUser(
  userId: string,
): Promise<Map<string, UserAnimeProgress>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_anime_progress")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Impossible de charger la progression : ${error.message}`);
  }

  const map = new Map<string, UserAnimeProgress>();
  for (const row of data ?? []) {
    const progress = mapProgressRow(row);
    map.set(progress.anime_id, progress);
  }
  return map;
}

/**
 * @description Progression d'un utilisateur pour un animé.
 */
export async function fetchAnimeProgress(
  userId: string,
  animeId: string,
): Promise<UserAnimeProgress | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_anime_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossible de charger la progression : ${error.message}`);
  }
  return data ? mapProgressRow(data) : null;
}

export interface UpsertAnimeProgressInput {
  listStatus: AnimeListStatus;
  episodesWatched: number;
  startedAt?: string | null;
  finishedAt?: string | null;
}

/**
 * @description Crée ou met à jour la progression visionnage.
 */
export async function upsertAnimeProgress(
  userId: string,
  animeId: string,
  input: UpsertAnimeProgressInput,
): Promise<UserAnimeProgress> {
  const supabase = getSupabaseClient();
  const row = {
    user_id: userId,
    anime_id: animeId,
    list_status: normalizeAnimeListStatus(input.listStatus),
    episodes_watched: Math.max(0, Math.floor(input.episodesWatched)),
    started_at: input.startedAt ?? null,
    finished_at: input.finishedAt ?? null,
  };

  const { data, error } = await supabase
    .from("user_anime_progress")
    .upsert(row, { onConflict: "user_id,anime_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Enregistrement progression impossible : ${error.message}`);
  }
  return mapProgressRow(data);
}

function mapProgressRow(row: Record<string, unknown>): UserAnimeProgress {
  return {
    user_id: String(row.user_id),
    anime_id: String(row.anime_id),
    list_status: normalizeAnimeListStatus(String(row.list_status)),
    episodes_watched: Number(row.episodes_watched ?? 0),
    started_at: (row.started_at as string | null) ?? null,
    finished_at: (row.finished_at as string | null) ?? null,
    updated_at: String(row.updated_at),
  };
}
