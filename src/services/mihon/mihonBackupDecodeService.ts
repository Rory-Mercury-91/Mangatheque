import { ungzip } from "pako";
import protobuf from "protobufjs";
import { isMihonTrackerPlanToRead } from "@/utils/trackerReadingStatus";

/** Proto minimal Mihon / Tachiyomi (backup gzip + protobuf). */
const MIHON_SIMPLE_PROTO = `
syntax = "proto3";
message Backup {
  repeated BackupManga backupManga = 1;
}
message BackupManga {
  int64 source = 1;
  string url = 2;
  string title = 3;
  string author = 5;
  string description = 6;
  repeated string genre = 7;
  int32 status = 8;
  string thumbnailUrl = 9;
  repeated BackupChapter chapters = 16;
  repeated BackupTracking tracking = 18;
}
message BackupChapter {
  bool read = 4;
}
message BackupTracking {
  int32 syncId = 1;
  int32 mediaIdInt = 3;
  string title = 5;
  float lastChapterRead = 6;
  float score = 8;
  int32 status = 9;
  int64 mediaId = 100;
}
`;

const PG_INT_MAX = 2_147_483_647;

type MihonTrackingRaw = {
  syncId?: number;
  mediaIdInt?: number;
  mediaId?: string | number;
  title?: string;
  lastChapterRead?: number;
  score?: number;
  status?: number;
};

type MihonMangaRaw = {
  source?: string | number;
  url?: string;
  title?: string;
  author?: string;
  description?: string;
  genre?: string[];
  status?: number;
  thumbnailUrl?: string;
  chapters?: Array<{ read?: boolean }>;
  tracking?: MihonTrackingRaw[];
};

/** Entrée normalisée extraite d'un backup Mihon. */
export interface MihonBackupEntry {
  title: string;
  description: string;
  genres: string[];
  thumbnailUrl: string;
  /** ID source Mihon (extension). */
  sourceId: string | null;
  /** Chemin ou URL relative côté source. */
  sourcePath: string | null;
  /** MAL syncId = 1 */
  malId: number | null;
  /** AniList syncId = 2 */
  anilistId: number | null;
  chaptersTotal: number;
  /** Max entre chapitres lus locaux et lastChapterRead tracking. */
  chaptersRead: number;
  /** True si MAL ou AniList est lié. */
  isTracked: boolean;
}

/**
 * @description Parse un identifiant média Mihon (mediaId / mediaIdInt).
 */
function parseMediaId(raw: string | number | undefined): number | null {
  const value = Number(raw ?? 0);
  if (!Number.isFinite(value) || value <= 0 || value > PG_INT_MAX) {
    return null;
  }
  return Math.floor(value);
}

/**
 * @description Décode un fichier backup Mihon (.tachibk / gzip protobuf).
 * @param file - Fichier sélectionné par l'utilisateur.
 * @returns Entrées manga normalisées.
 */
export async function decodeMihonBackupFile(
  file: File,
): Promise<MihonBackupEntry[]> {
  const buffer = await file.arrayBuffer();
  let inflated: Uint8Array;
  try {
    inflated = ungzip(new Uint8Array(buffer));
  } catch {
    throw new Error(
      "Fichier backup illisible (gzip attendu). Exportez une sauvegarde Mihon (.tachibk).",
    );
  }

  const root = protobuf.parse(MIHON_SIMPLE_PROTO, { keepCase: true }).root;
  const Backup = root.lookupType("Backup");
  let message: protobuf.Message;
  try {
    message = Backup.decode(inflated);
  } catch {
    throw new Error(
      "Impossible de décoder le protobuf Mihon. Vérifiez le fichier de sauvegarde.",
    );
  }

  const json = Backup.toObject(message, {
    longs: String,
    enums: String,
    defaults: true,
    arrays: true,
    objects: true,
  }) as { backupManga?: MihonMangaRaw[] };

  const mangas = Array.isArray(json.backupManga) ? json.backupManga : [];
  return mangas.map(normalizeMihonManga);
}

/**
 * @description Normalise une entrée manga brute du backup.
 */
function normalizeMihonManga(manga: MihonMangaRaw): MihonBackupEntry {
  const title = String(manga.title ?? "").trim() || "Sans titre";
  const tracking = Array.isArray(manga.tracking) ? manga.tracking : [];
  const malTracking = tracking.find((t) => Number(t.syncId ?? 0) === 1);
  const anilistTracking = tracking.find((t) => Number(t.syncId ?? 0) === 2);
  const chapters = Array.isArray(manga.chapters) ? manga.chapters : [];
  const localRead = chapters.filter((c) => Boolean(c.read)).length;
  const malTrackedRead = isMihonTrackerPlanToRead(
    malTracking?.syncId,
    malTracking?.status,
  )
    ? 0
    : Number(malTracking?.lastChapterRead ?? 0) || 0;
  const anilistTrackedRead = isMihonTrackerPlanToRead(
    anilistTracking?.syncId,
    anilistTracking?.status,
  )
    ? 0
    : Number(anilistTracking?.lastChapterRead ?? 0) || 0;
  const trackedRead = Math.max(malTrackedRead, anilistTrackedRead);
  const chaptersRead = Math.max(localRead, Math.floor(trackedRead));
  const malId = parseMediaId(malTracking?.mediaId ?? malTracking?.mediaIdInt);
  const anilistId = parseMediaId(
    anilistTracking?.mediaId ?? anilistTracking?.mediaIdInt,
  );
  const sourceId = String(manga.source ?? "").trim() || null;
  const sourcePath = String(manga.url ?? "").trim() || null;

  return {
    title,
    description: String(manga.description ?? "").trim(),
    genres: Array.isArray(manga.genre)
      ? manga.genre.map((g) => String(g).trim()).filter(Boolean)
      : [],
    thumbnailUrl: String(manga.thumbnailUrl ?? "").trim(),
    sourceId,
    sourcePath,
    malId,
    anilistId,
    chaptersTotal: chapters.length,
    chaptersRead,
    isTracked: Boolean(malId || anilistId),
  };
}
