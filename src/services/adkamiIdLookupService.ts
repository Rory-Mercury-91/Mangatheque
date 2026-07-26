import { getSupabaseClient } from "@/lib/supabaseClient";
import { isTauriRuntime } from "@/lib/platform";
import type { Anime } from "@/types/anime";
import { fetchAnimes, mapAnimeRow, patchAnimeAdkamiId } from "@/services/animeService";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import {
  collectAnimeMatchTitles,
  detectAdkamiMultiSeason,
  formatAnimeLookupLabel,
  resolveAdkamiSearchQuery,
  searchAdkamiAndDecide,
} from "@/services/adkamiSearchService";
import type { AdkamiSearchHit } from "@/utils/adkamiSearchParser";

const STORAGE_KEY = "mangatheque.adkami.idLookup.v2";
const BASE_DELAY_MS = 1500;
const MAX_RETRIES = 4;

export type AdkamiLookupStatus =
  | "auto_linked"
  | "already_linked"
  | "needs_pick"
  | "not_found"
  | "error"
  | "pending";

export interface AdkamiLookupResultRow {
  animeId: string;
  label: string;
  query: string;
  status: AdkamiLookupStatus;
  hits: AdkamiSearchHit[];
  linkedAdkamiId: number | null;
  linkedSection: string | null;
  multiSeason: boolean | null;
  seasonCount: number | null;
  errorMessage: string | null;
  updatedAt: string;
}

export interface AdkamiLookupJobState {
  status: "idle" | "running" | "paused" | "done";
  queueIds: string[];
  cursor: number;
  results: AdkamiLookupResultRow[];
  lastMessage: string | null;
  /** Si true, relance la recherche même pour les fiches déjà liées. */
  includeLinked: boolean;
}

export type AdkamiLookupProgressListener = (state: AdkamiLookupJobState) => void;

let jobState: AdkamiLookupJobState = loadState();
let listeners = new Set<AdkamiLookupProgressListener>();
let runToken = 0;
let pauseRequested = false;

/**
 * @description État courant du job de recherche ADKami bulk.
 */
export function getAdkamiLookupJobState(): AdkamiLookupJobState {
  return jobState;
}

/**
 * @description Abonne un listener aux changements du job.
 */
export function subscribeAdkamiLookupJob(
  listener: AdkamiLookupProgressListener,
): () => void {
  listeners.add(listener);
  listener(jobState);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * @description Compteurs agrégés pour l'UI Contrôle.
 */
export function summarizeAdkamiLookupResults(
  results: AdkamiLookupResultRow[],
): Record<AdkamiLookupStatus | "multi", number> {
  const summary = {
    auto_linked: 0,
    already_linked: 0,
    needs_pick: 0,
    not_found: 0,
    error: 0,
    pending: 0,
    multi: 0,
  };
  for (const row of results) {
    summary[row.status] += 1;
    if (row.multiSeason) summary.multi += 1;
  }
  return summary;
}

/**
 * @description Démarre (ou reprend) le scan par nom sur toute la bibliothèque animé.
 * @param options.resume - Reprend la file en cours.
 * @param options.includeLinked - Recherche aussi les fiches déjà pourvues d'un ID.
 */
export async function startAdkamiIdLookupJob(
  options?: { resume?: boolean; includeLinked?: boolean },
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("Le scan ADKami nécessite l'application native.");
  }
  if (jobState.status === "running") return;

  pauseRequested = false;
  const resume = Boolean(options?.resume);
  const includeLinked = Boolean(
    resume ? jobState.includeLinked : options?.includeLinked,
  );

  if (!resume || jobState.queueIds.length === 0) {
    const all = await fetchAnimes();
    // Ordre stable par titre pour relecture humaine.
    all.sort((a, b) =>
      formatAnimeLookupLabel(a).localeCompare(formatAnimeLookupLabel(b), "fr"),
    );
    const withoutId = all.filter((a) => !hasAdkamiId(a));
    const withId = all.length - withoutId.length;

    jobState = {
      status: "running",
      queueIds: all.map((a) => a.id),
      cursor: 0,
      results: [],
      includeLinked,
      lastMessage: includeLinked
        ? `${all.length} fiche(s) · recherche complète (déjà liées incluses).`
        : `${all.length} fiche(s) · ${withoutId.length} sans ID · ${withId} déjà liées (ignorées pour la recherche web).`,
    };
  } else {
    jobState = {
      ...jobState,
      status: "running",
      includeLinked,
      lastMessage: "Reprise du scan…",
    };
  }

  persistAndEmit();
  const token = ++runToken;
  void runLoop(token);
}

/**
 * @description Demande une pause après la fiche en cours.
 */
export function pauseAdkamiIdLookupJob(): void {
  if (jobState.status !== "running") return;
  pauseRequested = true;
  jobState = {
    ...jobState,
    lastMessage: "Pause demandée…",
  };
  persistAndEmit();
}

/**
 * @description Réinitialise le job et les résultats persistés.
 */
export function resetAdkamiIdLookupJob(): void {
  runToken += 1;
  pauseRequested = false;
  jobState = {
    status: "idle",
    queueIds: [],
    cursor: 0,
    results: [],
    lastMessage: null,
    includeLinked: false,
  };
  persistAndEmit();
}

/**
 * @description Applique un choix manuel depuis le picker bulk.
 */
export async function applyAdkamiLookupPick(
  animeId: string,
  hit: AdkamiSearchHit,
): Promise<AdkamiLookupResultRow> {
  await patchAnimeAdkamiId(animeId, hit.adkamiId, hit.section);

  const existing = jobState.results.find((r) => r.animeId === animeId);
  const row: AdkamiLookupResultRow = {
    animeId,
    label: existing?.label ?? animeId,
    query: existing?.query ?? hit.title,
    status: "auto_linked",
    hits: existing?.hits ?? [hit],
    linkedAdkamiId: hit.adkamiId,
    linkedSection: hit.section,
    multiSeason: null,
    seasonCount: null,
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  };

  jobState = {
    ...jobState,
    results: upsertResult(jobState.results, row),
    lastMessage: `ID ${hit.adkamiId} lié manuellement.`,
  };
  persistAndEmit();
  requestSupabaseDataReload();
  return row;
}

/**
 * @description Relance la détection multi-saison pour une fiche déjà liée.
 */
export async function refreshAdkamiLookupMultiSeason(
  animeId: string,
): Promise<AdkamiLookupResultRow | null> {
  const existing = jobState.results.find((r) => r.animeId === animeId);
  if (!existing?.linkedAdkamiId) return null;
  const detected = await detectAdkamiMultiSeason(
    existing.linkedAdkamiId,
    existing.linkedSection ?? "anime",
  );
  const row: AdkamiLookupResultRow = {
    ...existing,
    multiSeason: detected.multiSeason,
    seasonCount: detected.seasonCount,
    updatedAt: new Date().toISOString(),
  };
  jobState = {
    ...jobState,
    results: upsertResult(jobState.results, row),
  };
  persistAndEmit();
  return row;
}

async function runLoop(token: number): Promise<void> {
  while (
    token === runToken &&
    jobState.status === "running" &&
    jobState.cursor < jobState.queueIds.length
  ) {
    if (pauseRequested) {
      jobState = {
        ...jobState,
        status: "paused",
        lastMessage: `En pause · ${jobState.cursor}/${jobState.queueIds.length}`,
      };
      persistAndEmit();
      return;
    }

    const animeId = jobState.queueIds[jobState.cursor]!;
    const anime = await fetchAnimeByIdSafe(animeId);
    if (!anime) {
      jobState = {
        ...jobState,
        cursor: jobState.cursor + 1,
        results: upsertResult(jobState.results, {
          animeId,
          label: animeId,
          query: "",
          status: "error",
          hits: [],
          linkedAdkamiId: null,
          linkedSection: null,
          multiSeason: null,
          seasonCount: null,
          errorMessage: "Fiche introuvable.",
          updatedAt: new Date().toISOString(),
        }),
        lastMessage: `Fiche absente · ${jobState.cursor + 1}/${jobState.queueIds.length}`,
      };
      persistAndEmit();
      await sleep(BASE_DELAY_MS);
      continue;
    }

    if (hasAdkamiId(anime) && !jobState.includeLinked) {
      jobState = {
        ...jobState,
        cursor: jobState.cursor + 1,
        results: upsertResult(jobState.results, {
          animeId,
          label: formatAnimeLookupLabel(anime),
          query: resolveAdkamiSearchQuery(anime),
          status: "already_linked",
          hits: [],
          linkedAdkamiId: anime.adkami_id,
          linkedSection: anime.adkami_section,
          multiSeason: null,
          seasonCount: null,
          errorMessage: null,
          updatedAt: new Date().toISOString(),
        }),
        lastMessage: `Déjà lié · ${formatAnimeLookupLabel(anime)} (${jobState.cursor + 1}/${jobState.queueIds.length})`,
      };
      persistAndEmit();
      // Pas de délai HTTP : simple marquage local.
      continue;
    }

    const query = resolveAdkamiSearchQuery(anime);
    if (!query) {
      jobState = {
        ...jobState,
        cursor: jobState.cursor + 1,
        results: upsertResult(jobState.results, {
          animeId,
          label: formatAnimeLookupLabel(anime),
          query: "",
          status: "not_found",
          hits: [],
          linkedAdkamiId: null,
          linkedSection: null,
          multiSeason: null,
          seasonCount: null,
          errorMessage: "Aucun titre exploitable.",
          updatedAt: new Date().toISOString(),
        }),
        lastMessage: `Sans titre · ${formatAnimeLookupLabel(anime)}`,
      };
      persistAndEmit();
      await sleep(BASE_DELAY_MS);
      continue;
    }

    try {
      const decision = await searchWithRetry(query, collectAnimeMatchTitles(anime));
      let row: AdkamiLookupResultRow;

      if (decision.kind === "auto") {
        if (hasAdkamiId(anime)) {
          // Ne pas écraser silencieusement un ID existant.
          if (anime.adkami_id === decision.hit.adkamiId) {
            row = {
              animeId,
              label: formatAnimeLookupLabel(anime),
              query,
              status: "already_linked",
              hits: decision.hits,
              linkedAdkamiId: anime.adkami_id,
              linkedSection: anime.adkami_section,
              multiSeason: null,
              seasonCount: null,
              errorMessage: null,
              updatedAt: new Date().toISOString(),
            };
          } else {
            row = {
              animeId,
              label: formatAnimeLookupLabel(anime),
              query,
              status: "needs_pick",
              hits: decision.hits,
              linkedAdkamiId: anime.adkami_id,
              linkedSection: anime.adkami_section,
              multiSeason: null,
              seasonCount: null,
              errorMessage: `ID actuel ${anime.adkami_id} ≠ suggestion ${decision.hit.adkamiId}`,
              updatedAt: new Date().toISOString(),
            };
          }
        } else {
          await patchAnimeAdkamiId(
            animeId,
            decision.hit.adkamiId,
            decision.hit.section,
          );
          row = {
            animeId,
            label: formatAnimeLookupLabel(anime),
            query,
            status: "auto_linked",
            hits: decision.hits,
            linkedAdkamiId: decision.hit.adkamiId,
            linkedSection: decision.hit.section,
            multiSeason: null,
            seasonCount: null,
            errorMessage: null,
            updatedAt: new Date().toISOString(),
          };
        }
      } else if (decision.kind === "pick") {
        row = {
          animeId,
          label: formatAnimeLookupLabel(anime),
          query,
          status: "needs_pick",
          hits: decision.hits,
          linkedAdkamiId: anime.adkami_id,
          linkedSection: anime.adkami_section,
          multiSeason: null,
          seasonCount: null,
          errorMessage: hasAdkamiId(anime)
            ? `ID actuel ${anime.adkami_id} — confirmer ou changer`
            : null,
          updatedAt: new Date().toISOString(),
        };
      } else {
        row = {
          animeId,
          label: formatAnimeLookupLabel(anime),
          query,
          status: hasAdkamiId(anime) ? "already_linked" : "not_found",
          hits: [],
          linkedAdkamiId: anime.adkami_id,
          linkedSection: anime.adkami_section,
          multiSeason: null,
          seasonCount: null,
          errorMessage: hasAdkamiId(anime)
            ? "Aucun résultat web — ID existant conservé"
            : null,
          updatedAt: new Date().toISOString(),
        };
      }

      jobState = {
        ...jobState,
        cursor: jobState.cursor + 1,
        results: upsertResult(jobState.results, row),
        lastMessage: `${statusLabel(row.status)} · ${row.label} (${jobState.cursor + 1}/${jobState.queueIds.length})`,
      };
      persistAndEmit();
    } catch (error) {
      jobState = {
        ...jobState,
        cursor: jobState.cursor + 1,
        results: upsertResult(jobState.results, {
          animeId,
          label: formatAnimeLookupLabel(anime),
          query,
          status: "error",
          hits: [],
          linkedAdkamiId: null,
          linkedSection: null,
          multiSeason: null,
          seasonCount: null,
          errorMessage:
            error instanceof Error ? error.message : "Erreur inconnue",
          updatedAt: new Date().toISOString(),
        }),
        lastMessage: `Erreur · ${formatAnimeLookupLabel(anime)}`,
      };
      persistAndEmit();
    }

    await sleep(BASE_DELAY_MS);
  }

  if (token !== runToken) return;

  if (jobState.cursor >= jobState.queueIds.length) {
    jobState = {
      ...jobState,
      status: "done",
      lastMessage: `Terminé · ${jobState.results.length} résultat(s).`,
    };
    requestSupabaseDataReload();
    persistAndEmit();
  }
}

async function searchWithRetry(
  query: string,
  matchTitles: string[],
): Promise<Awaited<ReturnType<typeof searchAdkamiAndDecide>>> {
  let attempt = 0;
  let delay = 5000;
  while (true) {
    try {
      return await searchAdkamiAndDecide(query, matchTitles);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      const retryable = /HTTP 429|HTTP 403|429|trop de requ/i.test(message);
      attempt += 1;
      if (!retryable || attempt > MAX_RETRIES) {
        throw error;
      }
      jobState = {
        ...jobState,
        lastMessage: `Rate-limit · nouvel essai dans ${Math.round(delay / 1000)} s…`,
      };
      persistAndEmit();
      await sleep(delay);
      delay = Math.min(delay * 3, 60_000);
    }
  }
}

async function fetchAnimeByIdSafe(id: string): Promise<Anime | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("animes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapAnimeRow(data as Parameters<typeof mapAnimeRow>[0]);
}

/**
 * @description Indique si la fiche a déjà un ID ADKami utilisable.
 */
function hasAdkamiId(anime: Anime): boolean {
  return anime.adkami_id != null && Number(anime.adkami_id) > 0;
}

function upsertResult(
  rows: AdkamiLookupResultRow[],
  next: AdkamiLookupResultRow,
): AdkamiLookupResultRow[] {
  const idx = rows.findIndex((r) => r.animeId === next.animeId);
  if (idx < 0) return [...rows, next];
  const copy = [...rows];
  copy[idx] = next;
  return copy;
}

function statusLabel(status: AdkamiLookupStatus): string {
  switch (status) {
    case "auto_linked":
      return "Lié";
    case "already_linked":
      return "Déjà lié";
    case "needs_pick":
      return "À choisir";
    case "not_found":
      return "Introuvable";
    case "error":
      return "Erreur";
    default:
      return "En attente";
  }
}

function persistAndEmit(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobState));
  } catch {
    // ignore quota
  }
  for (const listener of listeners) {
    listener(jobState);
  }
}

function loadState(): AdkamiLookupJobState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as AdkamiLookupJobState;
    if (!parsed || !Array.isArray(parsed.queueIds) || !Array.isArray(parsed.results)) {
      return emptyState();
    }
    return {
      ...parsed,
      includeLinked: Boolean(parsed.includeLinked),
      status:
        parsed.status === "running" ? "paused" : parsed.status ?? "idle",
      lastMessage: parsed.lastMessage ?? null,
    };
  } catch {
    return emptyState();
  }
}

function emptyState(): AdkamiLookupJobState {
  return {
    status: "idle",
    queueIds: [],
    cursor: 0,
    results: [],
    lastMessage: null,
    includeLinked: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
