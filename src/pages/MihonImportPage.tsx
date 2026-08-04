import {
  ExternalLink,
  FileUp,
  Link2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
} from "lucide-react";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { OwnerOwnershipPill } from "@/components/common/OwnerOwnershipPill";
import { LibraryPagination } from "@/features/library/LibraryPagination";
import { MihonImportQueueTable } from "@/features/mihon/MihonImportQueueTable";
import { useMihonImportPage } from "@/features/mihon/useMihonImportPage";
import { NautiljonImportOptionsModal } from "@/features/nautiljon/NautiljonImportOptionsModal";
import "@/components/common/ghostActionBtn.css";
import "./MihonImportPage.css";

/**
 * @description Libellé discret de la dernière maj du cache file.
 */
function formatQueueCacheAge(savedAt: number | null): string | null {
  if (savedAt == null) return null;
  const agoSec = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (agoSec < 60) return "à l'instant";
  if (agoSec < 3600) {
    const min = Math.round(agoSec / 60);
    return `il y a ${min} min`;
  }
  return new Date(savedAt).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * @description Sas d'import Mihon (mode dév) : backup → fiches pending → enrichissement Nautiljon.
 */
export function MihonImportPage() {
  const {
    navigate,
    devMode,
    owners,
    mobile,
    fileInputId,
    fileInputRef,
    pending,
    sourcesByWorkId,
    knownSourceNames,
    loadingList,
    importing,
    refreshingIndex,
    backupMihonOwnerId,
    setBackupMihonOwnerId,
    progress,
    lastResult,
    setLastResult,
    indexStats,
    error,
    copyHint,
    lastEnriched,
    nautiljonOptionsOpen,
    nautiljonEnrichProgress,
    nautiljonPendingPayload,
    deletingId,
    ignoringId,
    unignoringId,
    promotingId,
    resetting,
    quickFilter,
    setQuickFilter,
    sourceFilterId,
    setSourceFilterId,
    searchQuery,
    setSearchQuery,
    jsonImportingId,
    resolvingTrackers,
    resolvingTitles,
    sortKey,
    sortDir,
    currentPage,
    setCurrentPage,
    totalPages,
    pageSize,
    queueCacheSavedAt,
    ignoredEntries,
    sourceFilterOptions,
    filteredPending,
    filteredIgnored,
    paginatedPending,
    paginatedIgnored,
    handleSortChange,
    skipDetails,
    attachDetails,
    ownershipDetails,
    errorDetails,
    selectedBackupOwner,
    missingTrackerCount,
    missingBothTrackerCount,
    handleFileChange,
    handleAttachJsonClick,
    handleEnrichNautiljonBrowse,
    handleNautiljonOptionsConfirm,
    handleNautiljonOptionsClose,
    handleResolveTrackers,
    handleResolveTitles,
    handlePromoteToLibrary,
    handleRefreshIndex,
    handleResetQueue,
    handleDelete,
    handleIgnore,
    handleUnignore,
    reloadPending,
  } = useMihonImportPage();

  const cacheAgeLabel = formatQueueCacheAge(queueCacheSavedAt);

  if (!devMode) {
    return (
      <div className="mihon-import-page">
        <p className="mihon-import-hint" role="status">
          Activez le <strong>mode dév</strong> (Journal → Contrôle) pour accéder
          au sas d&apos;import Mihon.
        </p>
      </div>
    );
  }

  return (
    <div className="mihon-import-page">
      <header className="mihon-import-header">
        <div>
          <h1>Sas Mihon</h1>
          {indexStats ? (
            <p className="mihon-import-index-stats">
              Index sources : {indexStats.total} entrée
              {indexStats.total > 1 ? "s" : ""}
              {indexStats.lastFetchedAt
                ? ` · maj ${new Date(indexStats.lastFetchedAt).toLocaleString("fr-FR")}`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="mihon-import-actions">
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".tachibk,.gz,application/gzip,application/octet-stream"
            hidden
            disabled={importing}
            onChange={(e) => void handleFileChange(e)}
          />
          <button
            type="button"
            className="ghost-action-btn"
            disabled={
              importing ||
              refreshingIndex ||
              resolvingTrackers ||
              resolvingTitles ||
              missingTrackerCount === 0
            }
            title="Résoudre les IDs MAL ↔ AniList manquants"
            aria-label="Résoudre les IDs trackers manquants"
            onClick={() => void handleResolveTrackers()}
          >
            <Link2
              size={16}
              className={resolvingTrackers ? "mihon-import-spin" : undefined}
              aria-hidden
            />
            {mobile ? null : (
              <span className="ghost-action-label">
                {resolvingTrackers
                  ? "Résolution…"
                  : `Résoudre IDs (${missingTrackerCount})`}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={
              importing ||
              refreshingIndex ||
              resolvingTrackers ||
              resolvingTitles ||
              missingBothTrackerCount === 0
            }
            title="Rechercher les MAL manquants via le titre (Jikan)"
            aria-label="Résoudre les titres sans tracker"
            onClick={() => void handleResolveTitles()}
          >
            <Search
              size={16}
              className={resolvingTitles ? "mihon-import-spin" : undefined}
              aria-hidden
            />
            {mobile ? null : (
              <span className="ghost-action-label">
                {resolvingTitles
                  ? "Titres…"
                  : `Résoudre titres (${missingBothTrackerCount})`}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={
              importing ||
              refreshingIndex ||
              resolvingTrackers ||
              resolvingTitles
            }
            title="Télécharge l'index Keiyoushi et résout les noms de sources manquants"
            aria-label="Mise à jour Index Mihon"
            onClick={() => void handleRefreshIndex()}
          >
            <RefreshCw
              size={16}
              className={refreshingIndex ? "mihon-import-spin" : undefined}
              aria-hidden
            />
            {mobile ? null : (
              <span className="ghost-action-label">
                {refreshingIndex ? "Index…" : "MAJ index sources"}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={importing || !backupMihonOwnerId}
            title={
              backupMihonOwnerId
                ? selectedBackupOwner
                  ? `Importer le backup pour le compte Mihon de ${selectedBackupOwner.name}`
                  : "Importer Backup"
                : "Choisissez d'abord un propriétaire Mihon"
            }
            aria-label="Importer Backup"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={16} aria-hidden />
            {mobile ? null : (
              <span className="ghost-action-label">
                {importing ? "Import…" : "Importer un backup"}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={importing || loadingList}
            title="Actualiser"
            aria-label="Actualiser"
            onClick={() => void reloadPending()}
          >
            <RotateCw size={16} aria-hidden />
            {mobile ? null : (
              <span className="ghost-action-label">Actualiser</span>
            )}
          </button>
          <button
            type="button"
            className="ghost-action-btn mihon-import-delete"
            disabled={
              importing ||
              resetting ||
              loadingList ||
              pending.length === 0
            }
            title="Réinitialiser"
            aria-label="Réinitialiser"
            onClick={() => void handleResetQueue()}
          >
            <RotateCcw size={16} aria-hidden />
            {mobile ? null : (
              <span className="ghost-action-label">
                {resetting ? "Réinit…" : "Réinitialiser"}
              </span>
            )}
          </button>
        </div>
      </header>

      <section
        className="mihon-import-owner-bar"
        aria-label="Compte Mihon de la sauvegarde"
      >
        <span className="mihon-import-owner-label">Compte Mihon</span>
        <div className="mihon-import-owner-pills" role="group">
          {owners.map((owner) => (
            <OwnerOwnershipPill
              key={owner.id}
              owner={owner}
              variant="mihon"
              mihonNameOnly
              active={backupMihonOwnerId === owner.id}
              disabled={importing}
              onClick={() =>
                setBackupMihonOwnerId((current) =>
                  current === owner.id ? null : owner.id,
                )
              }
            />
          ))}
        </div>
        <p className="mihon-import-owner-hint">
          {selectedBackupOwner
            ? `Les entrées de la prochaine sauvegarde seront attribuées à ${selectedBackupOwner.name}. Les séries déjà présentes ne sont pas dupliquées : le compte Mihon est seulement ajouté.`
            : "Sélectionnez le propriétaire avant d'importer une sauvegarde."}
        </p>
      </section>

      {error ? (
        <p className="mihon-import-error" role="alert">
          {error}
        </p>
      ) : null}
      {copyHint ? (
        <p className="mihon-import-info" role="status">
          {copyHint}
        </p>
      ) : null}
      {lastEnriched ? (
        <div className="mihon-import-open-bar" role="status">
          <p>
            Dernière fiche enrichie : <strong>{lastEnriched.title}</strong>
          </p>
          <button
            type="button"
            className="ghost-action-btn"
            title="Ouvrir la fiche"
            aria-label={`Ouvrir la fiche ${lastEnriched.title}`}
            onClick={() => navigate(`/work/${lastEnriched.workId}`)}
          >
            <ExternalLink size={16} aria-hidden />
            <span className="ghost-action-label">Ouvrir la fiche</span>
          </button>
        </div>
      ) : null}

      {progress ? (
        <div className="mihon-import-progress" role="status">
          <p>
            {progress.current}/{progress.total || "…"} — {progress.item}
          </p>
          <p className="mihon-import-progress-stats">
            Créés {progress.created} · Rattachés {progress.attached} · Mihon{" "}
            {progress.ownershipAdded} · Ignorés {progress.skipped} · Erreurs{" "}
            {progress.errors}
          </p>
          {progress.total > 0 ? (
            <div className="mihon-import-progress-bar">
              <span
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((progress.current / progress.total) * 100),
                  )}%`,
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {lastResult && !progress ? (
        <div className="mihon-import-result" role="status">
          <div className="mihon-import-result-head">
            <p>
              Dernier import terminé :{" "}
              <strong>{lastResult.created}</strong> créées ·{" "}
              <strong>{lastResult.attached}</strong> rattachées ·{" "}
              <strong>{lastResult.ownershipAdded}</strong> comptes Mihon ·{" "}
              <strong>{lastResult.skipped}</strong> ignorées ·{" "}
              <strong>{lastResult.errors}</strong> erreurs
              {" "}sur {lastResult.total}
            </p>
            <button
              type="button"
              className="ghost-action-btn"
              onClick={() => setLastResult(null)}
            >
              Fermer
            </button>
          </div>
          <p className="mihon-import-progress-stats">
            {lastResult.withMalId} avec MAL · {lastResult.withoutTrackerIds} sans
            ID tracker · {lastResult.withCatalogUrl} avec URL catalogue
          </p>
          {errorDetails.length > 0 ? (
            <details className="mihon-import-details mihon-import-details--error">
              <summary>Erreurs ({errorDetails.length})</summary>
              <ul>
                {errorDetails.slice(0, 100).map((row, index) => (
                  <li key={`err-${row.title}-${index}`}>
                    <strong>{row.title}</strong> — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {attachDetails.length > 0 ? (
            <details className="mihon-import-details">
              <summary>
                Sources rattachées à une fiche existante ({attachDetails.length})
              </summary>
              <ul>
                {attachDetails.slice(0, 100).map((row, index) => (
                  <li key={`attach-${row.title}-${index}`}>
                    <strong>{row.title}</strong> — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {ownershipDetails.length > 0 ? (
            <details className="mihon-import-details">
              <summary>
                Comptes Mihon ajoutés sans doublon ({ownershipDetails.length})
              </summary>
              <ul>
                {ownershipDetails.slice(0, 100).map((row, index) => (
                  <li key={`own-${row.title}-${index}`}>
                    <strong>{row.title}</strong> — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {skipDetails.length > 0 ? (
            <details className="mihon-import-details">
              <summary>Ignorées ({skipDetails.length})</summary>
              <ul>
                {skipDetails.slice(0, 100).map((row, index) => (
                  <li key={`skip-${row.title}-${index}`}>
                    <strong>{row.title}</strong> — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="mihon-import-list-head">
        <div className="mihon-import-list-title">
          <h2>
            {quickFilter === "ignored" ? "Ignorées" : "File d'attente"}
            {!loadingList
              ? ` (${
                  quickFilter === "ignored"
                    ? filteredIgnored.length
                    : filteredPending.length
                })`
              : ""}
          </h2>
          {cacheAgeLabel ? (
            <p className="mihon-import-cache-age" role="status">
              Cache local · maj {cacheAgeLabel}
              {" · "}
              <button
                type="button"
                className="mihon-import-cache-refresh"
                disabled={loadingList || importing}
                onClick={() => void reloadPending({ silent: false })}
              >
                Actualiser
              </button>
            </p>
          ) : null}
        </div>
        <div className="mihon-import-list-tools">
          <label className="mihon-import-search">
            <span className="sr-only">Rechercher dans la file</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher un titre, source, ID…"
              autoComplete="off"
            />
          </label>
          <label className="mihon-import-source-filter">
            <span className="sr-only">Filtrer par source Mihon</span>
            <select
              value={sourceFilterId}
              onChange={(event) => setSourceFilterId(event.target.value)}
              aria-label="Filtrer par source Mihon"
            >
              <option value="">Toutes les sources</option>
              {sourceFilterOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <div className="mihon-import-filters" role="group" aria-label="Filtres rapides">
            <button
              type="button"
              className={quickFilter === "all" ? "is-active" : ""}
              onClick={() => setQuickFilter("all")}
            >
              Tous
            </button>
            <button
              type="button"
              className={quickFilter === "sans-mal" ? "is-active" : ""}
              onClick={() => setQuickFilter("sans-mal")}
            >
              Sans MAL
            </button>
            <button
              type="button"
              className={quickFilter === "avec-mal" ? "is-active" : ""}
              onClick={() => setQuickFilter("avec-mal")}
            >
              Avec MAL
            </button>
            <button
              type="button"
              className={quickFilter === "sans-anilist" ? "is-active" : ""}
              onClick={() => setQuickFilter("sans-anilist")}
            >
              Sans AniList
            </button>
            <button
              type="button"
              className={quickFilter === "avec-anilist" ? "is-active" : ""}
              onClick={() => setQuickFilter("avec-anilist")}
            >
              Avec AniList
            </button>
            <button
              type="button"
              className={quickFilter === "ignored" ? "is-active" : ""}
              onClick={() => setQuickFilter("ignored")}
            >
              Ignorées ({ignoredEntries.length})
            </button>
          </div>
        </div>
      </div>

      {loadingList ? (
        <LoadingOverlayHost compact>
          <LoadingOverlay message="Chargement de la file…" />
        </LoadingOverlayHost>
      ) : null}

      {!loadingList && quickFilter === "ignored" && filteredIgnored.length === 0 ? (
        <p className="mihon-import-hint" role="status">
          {ignoredEntries.length === 0
            ? "Aucune série ignorée."
            : "Aucune entrée ignorée pour cette recherche."}
        </p>
      ) : null}

      {!loadingList &&
      quickFilter !== "ignored" &&
      filteredPending.length === 0 ? (
        <p className="mihon-import-hint" role="status">
          {pending.length === 0
            ? "Aucune fiche en attente d'enrichissement."
            : "Aucune fiche pour ce filtre."}
        </p>
      ) : null}

      {!loadingList &&
      quickFilter !== "ignored" &&
      filteredPending.length > 0 ? (
        <>
          <p className="mihon-import-page-meta" role="status">
            Affichage{" "}
            {(currentPage - 1) * pageSize + 1}
            –
            {Math.min(currentPage * pageSize, filteredPending.length)} sur{" "}
            {filteredPending.length}
          </p>
          <MihonImportQueueTable
            works={paginatedPending}
            sourcesByWorkId={sourcesByWorkId}
            knownSourceNames={knownSourceNames}
            sortKey={sortKey}
            sortDir={sortDir}
            jsonImportingId={jsonImportingId}
            promotingId={promotingId}
            deletingId={deletingId}
            ignoringId={ignoringId}
            busy={resolvingTrackers || resolvingTitles || importing}
            onSortChange={handleSortChange}
            onAttachJson={(workId) => void handleAttachJsonClick(workId)}
            onEnrichNautiljon={(work) => void handleEnrichNautiljonBrowse(work)}
            onPromote={(work) => void handlePromoteToLibrary(work)}
            onIgnore={(work) => void handleIgnore(work)}
            onDelete={(work) => void handleDelete(work)}
          />
          <LibraryPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      ) : null}

      {!loadingList &&
      quickFilter === "ignored" &&
      filteredIgnored.length > 0 ? (
        <>
          <p className="mihon-import-page-meta" role="status">
            Affichage{" "}
            {(currentPage - 1) * pageSize + 1}
            –
            {Math.min(currentPage * pageSize, filteredIgnored.length)} sur{" "}
            {filteredIgnored.length}
          </p>
          <div className="mihon-ignored-table-wrap">
            <table className="mihon-ignored-table">
              <thead>
                <tr>
                  <th scope="col">Série</th>
                  <th scope="col">MAL ID</th>
                  <th scope="col">AniList ID</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedIgnored.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.title}</td>
                    <td>{entry.malId ?? "—"}</td>
                    <td>{entry.anilistId ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-action-btn"
                        disabled={unignoringId === entry.id}
                        title="Retirer de la liste des ignorées (réimportable)"
                        onClick={() => void handleUnignore(entry)}
                      >
                        {unignoringId === entry.id
                          ? "Restauration…"
                          : "Ne plus ignorer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <LibraryPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      ) : null}

      <NautiljonImportOptionsModal
        open={nautiljonOptionsOpen}
        payload={nautiljonPendingPayload}
        owners={owners}
        enrichProgress={nautiljonEnrichProgress}
        onClose={handleNautiljonOptionsClose}
        onConfirm={(options) => {
          void handleNautiljonOptionsConfirm(options);
        }}
      />
    </div>
  );
}
