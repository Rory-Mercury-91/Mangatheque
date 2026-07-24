import { invoke } from "@tauri-apps/api/core";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { isTauriRuntime } from "@/lib/platform";
import type { Anime } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import { resolveErrorMessage } from "@/utils/errorMessage";
import {
  normalizeAdkamiTitle,
  parseAdkamiAgendaHtml,
  type AdkamiAgendaEntry,
} from "@/utils/adkamiAgendaParser";
import {
  ADKAMI_AGENDA_HISTORY_DAYS,
  endOfWeekExclusive,
  formatAdkamiAgendaDate,
  startOfWeekMonday,
} from "@/utils/adkamiAgendaWeek";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import { parseAdkamiMalMappingXml } from "@/utils/adkamiMalMappingParser";
import { parseAdkamiUrl } from "@/utils/animeExternalLinks";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";

const MAPPING_IMPORT_STORAGE_KEY = "mangatheque.adkamiMapping.lastImportAt";
const AGENDA_SYNC_STORAGE_KEY = "mangatheque.adkamiAgenda.lastSyncAt";
const AGENDA_SYNCED_WEEKS_KEY = "mangatheque.adkamiAgenda.syncedWeeks";
const AGENDA_LAST_ERROR_KEY = "mangatheque.adkamiAgenda.lastError";

export interface AnimeAgendaRow {
  id: string;
  adkami_id: number;
  anime_id: string | null;
  episode_number: number | null;
  episode_label: string;
  title: string;
  release_at: string;
  day_label: string | null;
  cover_url: string | null;
  page_url: string | null;
  matched: boolean;
  synced_at: string;
}

export interface AdkamiAgendaSyncStats {
  scanned: number;
  matched: number;
  linkedByTitle: number;
  unmatchedLibrary: number;
  weekKey: string;
}

export interface AdkamiMappingImportStats {
  scanned: number;
  updated: number;
  skipped: number;
}

/**
 * @description Télécharge le HTML agenda ADKami (Tauri desktop / mobile).
 */
async function fetchAdkamiAgendaHtml(weekMonday?: Date): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error(
      "La synchronisation agenda ADKami nécessite l'application native.",
    );
  }
  const date =
    weekMonday != null ? formatAdkamiAgendaDate(startOfWeekMonday(weekMonday)) : null;
  try {
    return await invoke<string>("fetch_adkami_agenda_html", {
      date,
    });
  } catch (error) {
    throw new Error(
      resolveErrorMessage(error, "Impossible de télécharger l'agenda ADKami."),
    );
  }
}

function readSyncedWeeks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AGENDA_SYNCED_WEEKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSyncedWeeks(map: Record<string, string>): void {
  localStorage.setItem(AGENDA_SYNCED_WEEKS_KEY, JSON.stringify(map));
}

/**
 * @description Indique si une semaine a déjà été synchronisée localement.
 */
export function isAdkamiWeekSynced(weekMonday: Date): boolean {
  const key = formatAdkamiAgendaDate(startOfWeekMonday(weekMonday));
  return Boolean(readSyncedWeeks()[key]);
}

/**
 * @description Mémorise qu'une semaine a été synchronisée.
 */
function markAdkamiWeekSynced(weekMonday: Date): void {
  const monday = startOfWeekMonday(weekMonday);
  const key = formatAdkamiAgendaDate(monday);
  const map = readSyncedWeeks();
  map[key] = new Date().toISOString();
  const earliest = new Date();
  earliest.setDate(earliest.getDate() - ADKAMI_AGENDA_HISTORY_DAYS);
  for (const weekKey of Object.keys(map)) {
    const parts = weekKey.split("-").map(Number);
    if (parts.length !== 3) {
      delete map[weekKey];
      continue;
    }
    const d = new Date(2000 + parts[0]!, parts[1]! - 1, parts[2]!);
    if (d < earliest) delete map[weekKey];
  }
  writeSyncedWeeks(map);
}

/**
 * @description Date ISO du dernier import mapping XML (localStorage).
 */
export function getAdkamiMappingLastImportAt(): string | null {
  return localStorage.getItem(MAPPING_IMPORT_STORAGE_KEY);
}

/**
 * @description Indique s'il faut rappeler l'import mapping (> 30 jours ou jamais).
 */
export function shouldRemindAdkamiMappingImport(): boolean {
  const raw = getAdkamiMappingLastImportAt();
  if (!raw) return true;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > 30 * 24 * 60 * 60 * 1000;
}

/**
 * @description Applique un export XML MAL↔ADKami sur le catalogue local.
 * Plusieurs saisons MAL peuvent recevoir le même adkami_id (page unique ADKami).
 */
export async function importAdkamiMalMappingXml(
  xml: string,
): Promise<AdkamiMappingImportStats> {
  const mappings = parseAdkamiMalMappingXml(xml);
  const supabase = getSupabaseClient();
  let updated = 0;
  let skipped = 0;

  for (const mapping of mappings) {
    const { data, error } = await supabase
      .from("animes")
      .update({ adkami_id: mapping.adkamiId })
      .eq("mal_id", mapping.malId)
      .select("id");

    if (error) {
      throw new Error(`Import mapping ADKami : ${error.message}`);
    }
    if (data && data.length > 0) {
      updated += data.length;
    } else {
      skipped += 1;
    }
  }

  localStorage.setItem(MAPPING_IMPORT_STORAGE_KEY, new Date().toISOString());
  requestSupabaseDataReload();
  return { scanned: mappings.length, updated, skipped };
}

/**
 * @description Score de proximité titre agenda ↔ fiche (saisons distinctes).
 */
function scoreAnimeTitleAgainstAgenda(anime: Anime, entryTitle: string): number {
  const entryFull = normalizeTitleForComparison(entryTitle);
  const entryBase = normalizeAdkamiTitle(entryTitle);
  let best = 0;
  for (const candidate of [
    anime.title,
    anime.title_fr,
    anime.title_en,
    anime.title_ja,
    resolveAnimeDisplayTitle(anime),
  ]) {
    if (!candidate?.trim()) continue;
    const full = normalizeTitleForComparison(candidate);
    const base = normalizeAdkamiTitle(candidate);
    if (full === entryFull) best = Math.max(best, 3);
    else if (full === entryBase || base === entryFull) best = Math.max(best, 2);
    else if (base === entryBase) best = Math.max(best, 1);
  }
  return best;
}

/**
 * @description Choisit la saison catalogue la plus proche du titre agenda ADKami.
 */
function pickAnimeForAgendaEntry(
  candidates: Anime[],
  entryTitle: string,
): Anime | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  let best = candidates[0]!;
  let bestScore = -1;
  for (const anime of candidates) {
    const score = scoreAnimeTitleAgainstAgenda(anime, entryTitle);
    if (score > bestScore) {
      bestScore = score;
      best = anime;
    }
  }
  return best;
}

/**
 * @description Charge les sorties agenda d'une semaine (lié au foyer).
 * Couverture : priorité à la fiche animé en BDD.
 */
export async function fetchAnimeAgendaEntriesForWeek(
  weekMonday: Date,
): Promise<AnimeAgendaRow[]> {
  const monday = startOfWeekMonday(weekMonday);
  const end = endOfWeekExclusive(monday);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("anime_agenda_entries")
    .select("*, animes(cover_url)")
    .eq("matched", true)
    .gte("release_at", monday.toISOString())
    .lt("release_at", end.toISOString())
    .order("release_at", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger le planning animé : ${error.message}`);
  }

  return ((data ?? []) as Array<
    AnimeAgendaRow & { animes?: { cover_url: string | null } | null }
  >).map((row) => {
    const { animes, ...rest } = row;
    return {
      ...rest,
      cover_url: animes?.cover_url?.trim() || rest.cover_url,
    };
  });
}

/**
 * @description Charge toutes les sorties agenda liées au foyer (historique).
 * @deprecated Préférer fetchAnimeAgendaEntriesForWeek.
 */
export async function fetchAnimeAgendaEntries(): Promise<AnimeAgendaRow[]> {
  return fetchAnimeAgendaEntriesForWeek(startOfWeekMonday());
}

/**
 * @description Animés en suivi sans lien ADKami (alerte agenda).
 */
export async function fetchAnimesMissingAdkamiLink(): Promise<Anime[]> {
  const supabase = getSupabaseClient();
  const { data: animes, error } = await supabase
    .from("animes")
    .select("*")
    .is("adkami_id", null)
    .order("title");

  if (error) {
    throw new Error(`Impossible de lister les animés : ${error.message}`);
  }

  const { data: progress, error: progressError } = await supabase
    .from("user_anime_progress")
    .select("anime_id, list_status")
    .in("list_status", ["watching", "plan_to_watch", "on_hold"]);

  if (progressError) {
    throw new Error(
      `Impossible de charger les progressions : ${progressError.message}`,
    );
  }

  const activeIds = new Set((progress ?? []).map((row) => row.anime_id as string));
  return ((animes ?? []) as Anime[]).filter((anime) => activeIds.has(anime.id));
}

/**
 * @description Purge les sorties plus anciennes que l'historique (1 an).
 */
async function pruneAgendaOlderThanHistory(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ADKAMI_AGENDA_HISTORY_DAYS);
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("anime_agenda_entries")
    .delete()
    .lt("release_at", cutoff.toISOString());
  if (error) {
    console.warn("Purge historique agenda :", error.message);
  }
}

/**
 * @description Synchronise une semaine ADKami avec la bibliothèque animé.
 * @param weekMonday - Lundi de la semaine (défaut : semaine courante).
 */
export async function runAdkamiAgendaSync(
  weekMonday: Date = startOfWeekMonday(),
): Promise<AdkamiAgendaSyncStats> {
  const monday = startOfWeekMonday(weekMonday);
  const weekEnd = endOfWeekExclusive(monday);
  const weekKey = formatAdkamiAgendaDate(monday);
  const html = await fetchAdkamiAgendaHtml(monday);
  // Parsing HTML potentiellement lourd : céder le thread après le fetch natif
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
  const agenda = parseAdkamiAgendaHtml(html);
  const supabase = getSupabaseClient();

  const { data: animesData, error: animesError } = await supabase
    .from("animes")
    .select("*");
  if (animesError) {
    throw new Error(`Catalogue animé : ${animesError.message}`);
  }
  const animes = (animesData ?? []) as Anime[];

  const byAdkami = new Map<number, Anime[]>();
  const byTitle = new Map<string, Anime[]>();
  for (const anime of animes) {
    if (anime.adkami_id != null) {
      const key = Number(anime.adkami_id);
      const list = byAdkami.get(key) ?? [];
      list.push(anime);
      byAdkami.set(key, list);
    }
    for (const candidate of [
      anime.title,
      anime.title_fr,
      anime.title_en,
      anime.title_ja,
      resolveAnimeDisplayTitle(anime),
    ]) {
      if (!candidate?.trim()) continue;
      const key = normalizeAdkamiTitle(candidate);
      if (!key) continue;
      const list = byTitle.get(key) ?? [];
      if (!list.some((a) => a.id === anime.id)) {
        list.push(anime);
      }
      byTitle.set(key, list);
    }
  }

  let matched = 0;
  let linkedByTitle = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const entry of agenda) {
    if (entry.isSpecial) continue;

    let candidates = byAdkami.get(entry.adkamiId) ?? [];
    const sectionFromUrl =
      parseAdkamiUrl(entry.pageUrl)?.section ?? "anime";

    if (candidates.length === 0) {
      const key = normalizeAdkamiTitle(entry.title);
      const titleHits = byTitle.get(key) ?? [];
      const unlinkable = titleHits.filter((a) => a.adkami_id == null);
      for (const anime of unlinkable) {
        const { error } = await supabase
          .from("animes")
          .update({
            adkami_id: entry.adkamiId,
            adkami_section: sectionFromUrl,
          })
          .eq("id", anime.id);
        if (!error) {
          const linked = {
            ...anime,
            adkami_id: entry.adkamiId,
            adkami_section: sectionFromUrl,
          };
          candidates = [...candidates, linked];
          linkedByTitle += 1;
        }
      }
      if (candidates.length > 0) {
        byAdkami.set(entry.adkamiId, candidates);
      }
    } else {
      // Met à jour la section si l'agenda indique hentai/drama et la fiche est encore « anime »
      for (const anime of candidates) {
        const current = anime.adkami_section?.trim() || "anime";
        if (sectionFromUrl !== "anime" && current === "anime") {
          const { error } = await supabase
            .from("animes")
            .update({ adkami_section: sectionFromUrl })
            .eq("id", anime.id);
          if (!error) {
            anime.adkami_section = sectionFromUrl;
          }
        }
      }
    }

    const anime = pickAnimeForAgendaEntry(candidates, entry.title);
    if (!anime) continue;

    matched += 1;
    rows.push({
      adkami_id: entry.adkamiId,
      anime_id: anime.id,
      episode_number: entry.episodeNumber,
      episode_label: entry.episodeLabel,
      title: entry.title,
      release_at: new Date(entry.releaseAtUnix * 1000).toISOString(),
      day_label: entry.dayLabel,
      cover_url: anime.cover_url ?? entry.coverUrl,
      page_url: entry.pageUrl,
      matched: true,
      synced_at: new Date().toISOString(),
    });
  }

  const { error: clearError } = await supabase
    .from("anime_agenda_entries")
    .delete()
    .gte("release_at", monday.toISOString())
    .lt("release_at", weekEnd.toISOString());
  if (clearError) {
    throw new Error(`Purge agenda semaine : ${clearError.message}`);
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("anime_agenda_entries")
      .insert(rows);
    if (insertError) {
      throw new Error(`Enregistrement agenda : ${insertError.message}`);
    }
  }

  await pruneAgendaOlderThanHistory();
  markAdkamiWeekSynced(monday);
  localStorage.setItem(AGENDA_SYNC_STORAGE_KEY, new Date().toISOString());
  // Laisse le thread UI respirer avant le broadcast global
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
  requestSupabaseDataReload();

  const missing = await fetchAnimesMissingAdkamiLink();
  return {
    scanned: agenda.length,
    matched,
    linkedByTitle,
    unmatchedLibrary: missing.length,
    weekKey,
  };
}

/**
 * @description Dernière erreur de sync agenda (session) — visible jusqu'à fermeture.
 */
export function getAdkamiAgendaLastError(): string | null {
  try {
    return sessionStorage.getItem(AGENDA_LAST_ERROR_KEY);
  } catch {
    return null;
  }
}

/**
 * @description Mémorise une erreur de sync agenda pour affichage ultérieur.
 */
export function setAdkamiAgendaLastError(message: string): void {
  try {
    sessionStorage.setItem(AGENDA_LAST_ERROR_KEY, message);
  } catch {
    // ignore quota / mode privé
  }
}

/**
 * @description Efface l'erreur de sync agenda mémorisée.
 */
export function clearAdkamiAgendaLastError(): void {
  try {
    sessionStorage.removeItem(AGENDA_LAST_ERROR_KEY);
  } catch {
    // ignore
  }
}

/**
 * @description Dernière sync agenda (localStorage).
 */
export function getAdkamiAgendaLastSyncAt(): string | null {
  return localStorage.getItem(AGENDA_SYNC_STORAGE_KEY);
}

/**
 * @description Expose le parser agenda pour tests / debug.
 */
export function debugParseAgenda(html: string): AdkamiAgendaEntry[] {
  return parseAdkamiAgendaHtml(html);
}
