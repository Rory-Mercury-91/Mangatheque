import { getUserReadingStatusLabel } from "@/constants/userReadingStatus";
import { downloadTextFile } from "@/services/platform/textFileDownloadService";
import type { TextFileDownloadResult } from "@/services/platform/textFileDownloadService";
import type { ReadingWorkItem } from "@/types/readingStats";
import { formatDateFr } from "@/utils/dateFormat";

const STATUS_EXPORT_ORDER = [
  "ongoing",
  "to_read",
  "completed",
  "abandoned",
] as const;

/**
 * @description Formate la progression courante (tomes et/ou chapitres) pour l'export.
 * @param item - Ligne série du suivi de lecture.
 * @returns Libellé de progression lisible, ou tiret si aucune donnée.
 */
export function formatReadingProgressForExport(item: ReadingWorkItem): string {
  const parts: string[] = [];

  if (item.volumesTotal > 0 || item.volumesRead > 0) {
    parts.push(
      item.volumesTotal > 0
        ? `Tome ${item.volumesRead} / ${item.volumesTotal}`
        : `Tome ${item.volumesRead}`,
    );
  }

  if (item.chaptersTotal > 0 || item.chaptersRead > 0) {
    parts.push(
      item.chaptersTotal > 0
        ? `Chap. ${item.chaptersRead} / ${item.chaptersTotal}`
        : `Chap. ${item.chaptersRead}`,
    );
  }

  if (parts.length === 0) {
    return "—";
  }

  return parts.join(" · ");
}

/**
 * @description Trie les séries pour un rapport lisible (statut puis titre).
 * @param items - Séries à exporter.
 * @returns Copie triée.
 */
export function sortReadingWorksForExport(
  items: ReadingWorkItem[],
): ReadingWorkItem[] {
  const statusRank = new Map(
    STATUS_EXPORT_ORDER.map((status, index) => [status, index]),
  );

  return [...items].sort((a, b) => {
    const rankA = statusRank.get(a.userReadingStatus) ?? 99;
    const rankB = statusRank.get(b.userReadingStatus) ?? 99;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
  });
}

/**
 * @description Construit le contenu texte de l'historique de lecture.
 * @param items - Séries du filtre propriétaire courant.
 * @param exportedAt - Date d'export (défaut : maintenant).
 * @returns Contenu `.txt` prêt à télécharger.
 */
export function buildReadingHistoryText(
  items: ReadingWorkItem[],
  exportedAt: Date = new Date(),
): string {
  const sorted = sortReadingWorksForExport(items);
  const yyyy = exportedAt.getFullYear();
  const mm = String(exportedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(exportedAt.getDate()).padStart(2, "0");
  const dateLabel = formatDateFr(`${yyyy}-${mm}-${dd}`);

  const header = [
    "Historique de lecture — Mangathèque",
    `Exporté le : ${dateLabel}`,
    `Nombre de séries : ${sorted.length}`,
    "",
    "---",
    "",
  ].join("\n");

  if (sorted.length === 0) {
    return `${header}Aucune série dans ce filtre.\n`;
  }

  const blocks = sorted.map((item) =>
    [
      `Nom de l'œuvre : ${item.title}`,
      `Chapitre actuel : ${formatReadingProgressForExport(item)}`,
      `Statut : ${getUserReadingStatusLabel(item.userReadingStatus)}`,
    ].join("\n"),
  );

  return `${header}${blocks.join("\n\n")}\n`;
}

/**
 * @description Génère un nom de fichier d'export horodaté.
 * @param date - Date de référence.
 * @returns Nom de fichier `.txt`.
 */
export function buildReadingHistoryFilename(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `historique-lecture-${yyyy}-${mm}-${dd}.txt`;
}

/**
 * @description Exporte l'historique de lecture en fichier `.txt` téléchargeable.
 * @param items - Séries du filtre propriétaire courant.
 * @returns Résultat du téléchargement.
 */
export async function exportReadingHistoryToTextFile(
  items: ReadingWorkItem[],
): Promise<TextFileDownloadResult> {
  const now = new Date();
  const content = buildReadingHistoryText(items, now);
  const filename = buildReadingHistoryFilename(now);

  return downloadTextFile({
    content,
    filename,
    mimeType: "text/plain",
    dialogTitle: "Exporter l'historique de lecture",
    fileFilterName: "Fichier texte",
    extensions: ["txt"],
  });
}
