import { ANIME_LIST_STATUS_LABELS } from "@/constants/animeStatus";
import { getUserReadingStatusLabel } from "@/constants/userReadingStatus";
import { downloadTextFile } from "@/services/platform/textFileDownloadService";
import type { TextFileDownloadResult } from "@/services/platform/textFileDownloadService";
import {
  buildReadingHistoryText,
  formatReadingProgressForExport,
  sortReadingWorksForExport,
} from "@/services/readingHistoryExportService";
import type { AnimeWatchItem } from "@/types/animeStats";
import type { ReadingWorkItem } from "@/types/readingStats";
import { formatDateFr } from "@/utils/dateFormat";

const ANIME_STATUS_EXPORT_ORDER = [
  "watching",
  "plan_to_watch",
  "completed",
  "on_hold",
  "dropped",
] as const;

/**
 * @description Trie les animés pour un rapport lisible (statut puis titre).
 */
export function sortAnimeItemsForExport(
  items: AnimeWatchItem[],
): AnimeWatchItem[] {
  const statusRank = new Map(
    ANIME_STATUS_EXPORT_ORDER.map((status, index) => [status, index]),
  );

  return [...items].sort((a, b) => {
    const rankA = statusRank.get(a.listStatus) ?? 99;
    const rankB = statusRank.get(b.listStatus) ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
  });
}

/**
 * @description Formate la progression épisodes pour l'export.
 */
export function formatAnimeProgressForExport(item: AnimeWatchItem): string {
  const total = item.episodesTotal != null ? String(item.episodesTotal) : "?";
  return `Ép. ${item.episodesWatched} / ${total}`;
}

/**
 * @description Échappe le HTML pour un export sûr.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @description Construit un historique visionnage en texte brut.
 */
export function buildAnimeHistoryText(
  items: AnimeWatchItem[],
  exportedAt: Date = new Date(),
): string {
  const sorted = sortAnimeItemsForExport(items);
  const yyyy = exportedAt.getFullYear();
  const mm = String(exportedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(exportedAt.getDate()).padStart(2, "0");
  const dateLabel = formatDateFr(`${yyyy}-${mm}-${dd}`);

  const header = [
    "Historique de visionnage — Mangathèque",
    `Exporté le : ${dateLabel}`,
    `Nombre d'animés : ${sorted.length}`,
    "",
    "---",
    "",
  ].join("\n");

  if (sorted.length === 0) {
    return `${header}Aucun animé dans ce filtre.\n`;
  }

  const blocks = sorted.map((item) =>
    [
      `Nom de l'œuvre : ${item.title}`,
      `Progression : ${formatAnimeProgressForExport(item)}`,
      `Statut : ${ANIME_LIST_STATUS_LABELS[item.listStatus]}`,
    ].join("\n"),
  );

  return `${header}${blocks.join("\n\n")}\n`;
}

/**
 * @description Construit un HTML stylisé (lectures + animé, sections optionnelles).
 */
export function buildMediaHistoryHtml(options: {
  readingItems?: ReadingWorkItem[];
  animeItems?: AnimeWatchItem[];
  exportedAt?: Date;
}): string {
  const exportedAt = options.exportedAt ?? new Date();
  const reading = sortReadingWorksForExport(options.readingItems ?? []);
  const anime = sortAnimeItemsForExport(options.animeItems ?? []);
  const yyyy = exportedAt.getFullYear();
  const mm = String(exportedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(exportedAt.getDate()).padStart(2, "0");
  const dateLabel = formatDateFr(`${yyyy}-${mm}-${dd}`);

  const readingRows = reading
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(formatReadingProgressForExport(item))}</td>
        <td>${escapeHtml(getUserReadingStatusLabel(item.userReadingStatus))}</td>
        <td>${item.progressPercent} %</td>
      </tr>`,
    )
    .join("");

  const animeRows = anime
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(formatAnimeProgressForExport(item))}</td>
        <td>${escapeHtml(ANIME_LIST_STATUS_LABELS[item.listStatus])}</td>
        <td>${item.progressPercent} %</td>
      </tr>`,
    )
    .join("");

  const readingSection =
    options.readingItems != null
      ? `
    <section>
      <h2>Lectures <span class="count">${reading.length}</span></h2>
      ${
        reading.length === 0
          ? `<p class="empty">Aucune série dans ce filtre.</p>`
          : `<table>
        <thead>
          <tr>
            <th>Œuvre</th>
            <th>Progression</th>
            <th>Statut</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>${readingRows}</tbody>
      </table>`
      }
    </section>`
      : "";

  const animeSection =
    options.animeItems != null
      ? `
    <section>
      <h2>Animé <span class="count">${anime.length}</span></h2>
      ${
        anime.length === 0
          ? `<p class="empty">Aucun animé dans ce filtre.</p>`
          : `<table>
        <thead>
          <tr>
            <th>Œuvre</th>
            <th>Progression</th>
            <th>Statut</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>${animeRows}</tbody>
      </table>`
      }
    </section>`
      : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Historique Mangathèque — ${escapeHtml(dateLabel)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #12141a;
      --panel: #1a1d26;
      --border: #2d3340;
      --text: #e8eaed;
      --muted: #9aa0a6;
      --accent: #818cf8;
      --row: #151820;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 1.5rem;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
    }
    header {
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    h1 { margin: 0 0 0.35rem; font-size: 1.55rem; }
    .meta { margin: 0; color: var(--muted); font-size: 0.92rem; }
    section {
      margin: 0 0 1.75rem;
      padding: 1rem 1.1rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
    }
    h2 {
      margin: 0 0 0.85rem;
      font-size: 1.15rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .count {
      display: inline-flex;
      min-width: 1.6rem;
      justify-content: center;
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      background: rgba(129, 140, 248, 0.18);
      color: var(--accent);
      font-size: 0.8rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }
    th, td {
      text-align: left;
      padding: 0.55rem 0.65rem;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 600; font-size: 0.8rem; }
    tbody tr:nth-child(even) { background: var(--row); }
    .empty { margin: 0; color: var(--muted); }
    @media print {
      body { background: #fff; color: #111; padding: 0; }
      section { border-color: #ccc; background: #fff; break-inside: avoid; }
      th { color: #444; }
      tbody tr:nth-child(even) { background: #f5f5f5; }
      .count { background: #eee; color: #333; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Historique Mangathèque</h1>
    <p class="meta">Exporté le ${escapeHtml(dateLabel)}</p>
  </header>
  ${readingSection}
  ${animeSection}
</body>
</html>
`;
}

/**
 * @description Nom de fichier HTML d'export combiné.
 */
export function buildMediaHistoryHtmlFilename(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `historique-mangatheque-${yyyy}-${mm}-${dd}.html`;
}

/**
 * @description Exporte un HTML stylisé lectures ± animé.
 */
export async function exportMediaHistoryToHtmlFile(options: {
  readingItems?: ReadingWorkItem[];
  animeItems?: AnimeWatchItem[];
}): Promise<TextFileDownloadResult> {
  const now = new Date();
  const content = buildMediaHistoryHtml({ ...options, exportedAt: now });
  return downloadTextFile({
    content,
    filename: buildMediaHistoryHtmlFilename(now),
    mimeType: "text/html",
    dialogTitle: "Exporter l'historique (HTML)",
    fileFilterName: "Page HTML",
    extensions: ["html"],
  });
}

/**
 * @description Conserve l'export texte lectures (compatibilité).
 */
export async function exportReadingHistoryTextFallback(
  items: ReadingWorkItem[],
): Promise<TextFileDownloadResult> {
  const now = new Date();
  return downloadTextFile({
    content: buildReadingHistoryText(items, now),
    filename: `historique-lecture-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.txt`,
    mimeType: "text/plain",
    dialogTitle: "Exporter l'historique de lecture",
    fileFilterName: "Fichier texte",
    extensions: ["txt"],
  });
}
