import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, FileJson } from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import type { WorkMihonSource } from "@/services/mihon/workMihonSourceService";
import {
  canUseGuidedNautiljonWebview,
  openCatalogLink,
} from "@/services/platform/linkService";
import type { Work } from "@/types/database";
import { formatMihonSourceDisplay } from "@/utils/mihonSourceDisplay";
import "@/components/common/ghostActionBtn.css";
import "./MihonImportQueueTable.css";

/** Colonnes triables du tableau sas Mihon. */
export type MihonQueueSortKey = "title" | "mal" | "anilist" | "source";

export type MihonQueueSortDir = "asc" | "desc";

interface DisplaySource {
  key: string;
  label: string;
  title: string;
  obsolete: boolean;
  url: string | null;
}

export interface MihonImportQueueTableProps {
  works: Work[];
  sourcesByWorkId: Map<string, WorkMihonSource[]>;
  knownSourceNames: ReadonlyMap<string, string>;
  sortKey: MihonQueueSortKey;
  sortDir: MihonQueueSortDir;
  jsonImportingId: string | null;
  promotingId: string | null;
  deletingId: string | null;
  ignoringId: string | null;
  busy: boolean;
  onSortChange: (key: MihonQueueSortKey) => void;
  onAttachJson: (workId: string) => void;
  onEnrichNautiljon: (work: Work) => void;
  onPromote: (work: Work) => void;
  onIgnore: (work: Work) => void;
  onDelete: (work: Work) => void;
}

/**
 * @description Construit la liste d'affichage des sources d'une fiche.
 */
function resolveDisplaySources(
  work: Work,
  sources: WorkMihonSource[],
  knownSourceNames: ReadonlyMap<string, string>,
): DisplaySource[] {
  if (sources.length > 0) {
    return sources.map((source) => {
      const display = formatMihonSourceDisplay(
        source.sourceId,
        source.sourceName,
        knownSourceNames,
      );
      return {
        key: source.id,
        label: display.label,
        title: display.title,
        obsolete: display.obsolete,
        url: display.obsolete ? null : source.catalogUrl?.trim() || null,
      };
    });
  }

  if (!work.mihon_source_id && !work.mihon_source_name) {
    return [];
  }

  const display = formatMihonSourceDisplay(
    work.mihon_source_id,
    work.mihon_source_name,
    knownSourceNames,
  );
  return [
    {
      key: "legacy",
      label: display.label,
      title: display.title,
      obsolete: display.obsolete,
      url: display.obsolete ? null : work.mihon_catalog_url?.trim() || null,
    },
  ];
}

/**
 * @description En-tête de colonne triable.
 */
function SortableTh({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSortChange,
}: {
  label: string;
  columnKey: MihonQueueSortKey;
  sortKey: MihonQueueSortKey;
  sortDir: MihonQueueSortDir;
  onSortChange: (key: MihonQueueSortKey) => void;
}) {
  const active = sortKey === columnKey;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? `${sortDir}ending` : "none"}>
      <button
        type="button"
        className={`mihon-queue-sort-btn${active ? " is-active" : ""}`}
        onClick={() => onSortChange(columnKey)}
      >
        <span>{label}</span>
        <Icon size={14} aria-hidden />
      </button>
    </th>
  );
}

/**
 * @description Tableau triable de la file d'attente sas Mihon.
 */
export function MihonImportQueueTable({
  works,
  sourcesByWorkId,
  knownSourceNames,
  sortKey,
  sortDir,
  jsonImportingId,
  promotingId,
  deletingId,
  ignoringId,
  busy,
  onSortChange,
  onAttachJson,
  onEnrichNautiljon,
  onPromote,
  onIgnore,
  onDelete,
}: MihonImportQueueTableProps) {
  return (
    <div className="mihon-queue-table-wrap">
      <table className="mihon-queue-table">
        <thead>
          <tr>
            <th scope="col" className="mihon-queue-col-cover">
              Image
            </th>
            <SortableTh
              label="Série"
              columnKey="title"
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={onSortChange}
            />
            <SortableTh
              label="MAL ID"
              columnKey="mal"
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={onSortChange}
            />
            <SortableTh
              label="AniList ID"
              columnKey="anilist"
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={onSortChange}
            />
            <SortableTh
              label="Source"
              columnKey="source"
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={onSortChange}
            />
            <th scope="col">Joindre JSON</th>
            <th scope="col">Enrichir Nautiljon</th>
            <th scope="col">Bibliothèque</th>
            <th scope="col">Ignoré / Supprimer</th>
          </tr>
        </thead>
        <tbody>
          {works.map((work) => {
            const sources = sourcesByWorkId.get(work.id) ?? [];
            const displaySources = resolveDisplaySources(
              work,
              sources,
              knownSourceNames,
            );
            const rowBusy =
              busy ||
              jsonImportingId === work.id ||
              promotingId === work.id ||
              deletingId === work.id ||
              ignoringId === work.id;

            return (
              <tr key={work.id}>
                <td className="mihon-queue-col-cover">
                  <span className="mihon-queue-cover" aria-hidden>
                    <CoverImage
                      url={work.cover_url}
                      alt={work.title}
                      variant="tile"
                    />
                  </span>
                </td>
                <td className="mihon-queue-col-title">
                  <Link to={`/work/${work.id}`} className="mihon-queue-title">
                    {work.title}
                  </Link>
                </td>
                <td className="mihon-queue-col-id">
                  {work.mal_id != null ? (
                    <span className="mihon-queue-id-value">{work.mal_id}</span>
                  ) : (
                    <span className="mihon-queue-id-empty">—</span>
                  )}
                </td>
                <td className="mihon-queue-col-id">
                  {work.anilist_id != null ? (
                    <span className="mihon-queue-id-value">
                      {work.anilist_id}
                    </span>
                  ) : (
                    <span className="mihon-queue-id-empty">—</span>
                  )}
                </td>
                <td className="mihon-queue-col-source">
                  {displaySources.length === 0 ? (
                    <span className="mihon-queue-id-empty">—</span>
                  ) : (
                    <ul className="mihon-queue-sources">
                      {displaySources.map((source) => (
                        <li key={source.key}>
                          {source.url ? (
                            <button
                              type="button"
                              className="mihon-queue-source-link"
                              title={source.title}
                              aria-label={`Ouvrir sur ${source.label}`}
                              onClick={() =>
                                void openCatalogLink(source.url!, source.label)
                              }
                            >
                              {source.label}
                            </button>
                          ) : (
                            <span
                              className={
                                source.obsolete
                                  ? "mihon-queue-source-obsolete"
                                  : undefined
                              }
                              title={source.title}
                            >
                              {source.label}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    disabled={rowBusy || jsonImportingId != null}
                    title="Joindre un JSON Nautiljon"
                    aria-label={`Joindre un JSON pour ${work.title}`}
                    onClick={() => onAttachJson(work.id)}
                  >
                    <FileJson size={14} aria-hidden />
                    <span className="ghost-action-label">
                      {jsonImportingId === work.id
                        ? "Import…"
                        : "Joindre JSON"}
                    </span>
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    disabled={rowBusy}
                    title={
                      canUseGuidedNautiljonWebview()
                        ? "Ouvrir Nautiljon (WebView) puis Importer"
                        : "Ouvrir la recherche Nautiljon dans le navigateur"
                    }
                    aria-label={`Enrichir ${work.title} via Nautiljon`}
                    onClick={() => onEnrichNautiljon(work)}
                  >
                    <span className="ghost-action-label">
                      {jsonImportingId === work.id
                        ? "Nautiljon…"
                        : "Enrichir"}
                    </span>
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    disabled={rowBusy}
                    title="Sortir du sas vers la bibliothèque (sans Nautiljon)"
                    aria-label={`Promouvoir ${work.title} vers la bibliothèque`}
                    onClick={() => onPromote(work)}
                  >
                    <span className="ghost-action-label">
                      {promotingId === work.id ? "Promotion…" : "Bibliothèque"}
                    </span>
                  </button>
                </td>
                <td>
                  <div className="mihon-queue-danger-actions">
                    <button
                      type="button"
                      className="ghost-action-btn mihon-queue-ignore"
                      disabled={rowBusy}
                      title="Ignorer définitivement à l'import (ne plus réinjecter)"
                      aria-label={`Ignorer ${work.title}`}
                      onClick={() => onIgnore(work)}
                    >
                      <span className="ghost-action-label">
                        {ignoringId === work.id ? "Ignore…" : "Ignorer"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ghost-action-btn mihon-queue-delete"
                      disabled={rowBusy}
                      title="Supprimer du sas (réapparaîtra à un prochain import)"
                      aria-label={`Supprimer ${work.title} du sas`}
                      onClick={() => onDelete(work)}
                    >
                      <span className="ghost-action-label">
                        {deletingId === work.id ? "Suppression…" : "Supprimer"}
                      </span>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * @description Trie les fiches sas selon la colonne et le sens choisis.
 * @param works - Fiches filtrées.
 * @param sourcesByWorkId - Sources multi par œuvre.
 * @param knownSourceNames - Index noms de sources.
 * @param sortKey - Colonne.
 * @param sortDir - Sens.
 */
export function sortMihonQueueWorks(
  works: Work[],
  sourcesByWorkId: Map<string, WorkMihonSource[]>,
  knownSourceNames: ReadonlyMap<string, string>,
  sortKey: MihonQueueSortKey,
  sortDir: MihonQueueSortDir,
): Work[] {
  const factor = sortDir === "asc" ? 1 : -1;
  const sorted = [...works];

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "mal": {
        const av = a.mal_id;
        const bv = b.mal_id;
        if (av == null && bv == null) cmp = 0;
        else if (av == null) cmp = 1;
        else if (bv == null) cmp = -1;
        else cmp = av - bv;
        break;
      }
      case "anilist": {
        const av = a.anilist_id;
        const bv = b.anilist_id;
        if (av == null && bv == null) cmp = 0;
        else if (av == null) cmp = 1;
        else if (bv == null) cmp = -1;
        else cmp = av - bv;
        break;
      }
      case "source": {
        const labelOf = (work: Work) => {
          const sources = resolveDisplaySources(
            work,
            sourcesByWorkId.get(work.id) ?? [],
            knownSourceNames,
          );
          return sources.map((s) => s.label).join(", ");
        };
        cmp = labelOf(a).localeCompare(labelOf(b), "fr", {
          sensitivity: "base",
        });
        break;
      }
      case "title":
      default:
        cmp = a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
        break;
    }

    if (cmp !== 0) return cmp * factor;
    return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
  });

  return sorted;
}
