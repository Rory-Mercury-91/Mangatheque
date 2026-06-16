import { useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { ArrowLeft, ExternalLink, LayoutGrid, List, Pencil, Plus, Trash2 } from "lucide-react";

import { LoadingOverlay } from "@/components/common/LoadingOverlay";

import { AddVolumeModal } from "@/features/works/AddVolumeModal";
import { EditVolumeModal } from "@/features/works/EditVolumeModal";
import { WorkDetailVolumeCard } from "@/features/works/WorkDetailVolumeCard";
import {
  ChapterReadingProgressPanel,
} from "@/features/works/ChapterReadingProgress";
import { WorkFavoriteBar } from "@/features/works/WorkFavoriteBar";
import { WorkDetailReadingToolbar } from "@/features/works/WorkDetailReadingToolbar";
import {
  persistWorkDetailVolumeViewMode,
  readWorkDetailVolumeViewMode,
  type WorkDetailVolumeViewMode,
} from "@/features/works/workDetailVolumeView";

import { BadgeList } from "@/components/common/BadgeList";

import { CoverImage } from "@/components/common/CoverImage";

import { InfoBadge } from "@/components/common/InfoBadge";

import { OwnerInitialBadge } from "@/components/common/OwnerInitialBadge";

import { WorkSeriesFinancialCards } from "@/features/works/WorkSeriesFinancialCards";

import {

  getWorkStatusColor,

  getWorkStatusLabel,

  normalizeWorkReadingStatus,

} from "@/constants/workStatus";

import {
  getChapterSeriesOwnershipSource,
  shouldHideChapterVolumeGrid,
} from "@/utils/chapterSeries";
import { getTrackingUnitLabelPlural } from "@/utils/volumeDisplay";
import { formatWorkVolumeStatsLine } from "@/utils/workVolumeStats";

import { DeleteWorkModal } from "@/features/works/DeleteWorkModal";

import { WorkFormModal } from "@/features/works/WorkFormModal";

import { useWorkReadingProgress } from "@/hooks/useWorkReadingProgress";
import { useWorkChapterReadingProgress } from "@/hooks/useWorkChapterReadingProgress";
import { useWorkReadingAbandoned } from "@/hooks/useWorkReadingAbandoned";
import { useOwners } from "@/hooks/useOwners";

import { fetchWorkFinancials } from "@/services/financialService";
import {
  fetchWorkFavoritesByWork,
  toggleWorkFavorite,
} from "@/services/workFavoriteService";

import { openExternalUrl } from "@/services/platform/linkService";
import { fetchWorkForEdit } from "@/services/workService";

import type { SeriesFinancials, Work } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";

import "./WorkDetailPage.css";



/**

 * @description Fiche détaillée d'une série (synopsis, métadonnées, tomes).

 */

export function WorkDetailPage() {

  const { workId } = useParams<{ workId: string }>();

  const navigate = useNavigate();

  const { owners } = useOwners();



  const [work, setWork] = useState<Work | null>(null);

  const [volumes, setVolumes] = useState<VolumeFormRow[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);

  const [addVolumeOpen, setAddVolumeOpen] = useState(false);

  const [editVolume, setEditVolume] = useState<VolumeFormRow | null>(null);

  const [volumeViewMode, setVolumeViewMode] = useState<WorkDetailVolumeViewMode>(
    readWorkDetailVolumeViewMode,
  );

  const [deleteOpen, setDeleteOpen] = useState(false);

  const [workFinancials, setWorkFinancials] = useState<SeriesFinancials | null>(

    null,

  );

  const [favoriteOwnerIds, setFavoriteOwnerIds] = useState<string[]>([]);

  const [favoriteSaving, setFavoriteSaving] = useState(false);



  const reload = async () => {

    if (!workId) {

      return;

    }

    setLoading(true);

    setError(null);

    try {

      const [data, financials, favoritesByWork] = await Promise.all([

        fetchWorkForEdit(workId),

        fetchWorkFinancials(workId),

        fetchWorkFavoritesByWork(),

      ]);

      setWork(data.work);

      setVolumes(data.volumes);

      setFavoriteOwnerIds(favoritesByWork.get(workId) ?? []);

      setWorkFinancials(financials);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Erreur de chargement.");

    } finally {

      setLoading(false);

    }

  };



  useEffect(() => {

    void reload();

  }, [workId]);



  const trackableVolumeIds = useMemo(
    () =>
      volumes
        .map((volume) => volume.id)
        .filter((id): id is string => Boolean(id)),
    [volumes],
  );

  const trackingUnitDraft = work?.tracking_unit ?? "volume";
  const chapterCountDraft = work?.volumes_vf_count ?? volumes.length;
  const hideChapterGridDraft = shouldHideChapterVolumeGrid(
    volumes,
    trackingUnitDraft,
  );
  const useChapterSeriesReading = Boolean(work)
    && trackingUnitDraft === "chapter"
    && hideChapterGridDraft
    && chapterCountDraft > 0;

  const readingProgress = useWorkReadingProgress(workId, trackableVolumeIds);

  const chapterReading = useWorkChapterReadingProgress(
    workId,
    chapterCountDraft,
    useChapterSeriesReading,
  );

  const readingAbandoned = useWorkReadingAbandoned(workId);



  const handleVolumeViewMode = (mode: WorkDetailVolumeViewMode) => {
    setVolumeViewMode(mode);
    persistWorkDetailVolumeViewMode(mode);
  };



  if (loading) {

    return (

      <main className="work-detail-page loading-overlay-host">

        <LoadingOverlay message="Chargement de la fiche…" />

      </main>

    );

  }



  if (error || !work) {

    return (

      <main className="work-detail-page">

        <button
          type="button"
          className="btn-back"
          onClick={() => navigate("/library")}
          title="Retour à la bibliothèque"
          aria-label="Retour à la bibliothèque"
        >
          <ArrowLeft size={18} aria-hidden />
          <span className="btn-back-label">Bibliothèque</span>
        </button>

        <p className="work-detail-error">{error ?? "Série introuvable."}</p>

      </main>

    );

  }



  const tags = [...(work.genres ?? []), ...(work.themes ?? [])];

  const ownerById = new Map(owners.map((o) => [o.id, o]));

  const readingStatus = normalizeWorkReadingStatus(work.reading_status);



  const volumeStatsLine = formatWorkVolumeStatsLine(
    volumes,
    work.volumes_vf_count,
    work.volumes_vo_total,
    work.default_price,
    work.price_format,
    work.tracking_unit ?? "volume",
  );

  const trackingUnit = work.tracking_unit ?? "volume";
  const chapterCount = work.volumes_vf_count ?? volumes.length;
  const hideChapterGrid = shouldHideChapterVolumeGrid(volumes, trackingUnit);
  const chapterOwnership = getChapterSeriesOwnershipSource(volumes);
  const chapterMihonOwner = chapterOwnership?.mihonOwnerId
    ? ownerById.get(chapterOwnership.mihonOwnerId)
    : null;
  const chapterPurchaseOwners =
    chapterOwnership?.ownerIds
      .map((id) => ownerById.get(id))
      .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner)) ??
    [];

  const volumeUnitLabel =
    trackingUnit === "chapter" ? "chapitres" : "tomes";

  const showReadingToolbar =
    chapterReading.enabled ||
    (readingProgress.enabled && readingProgress.totalTrackable > 0);

  const readingReadCount = chapterReading.enabled
    ? chapterReading.chaptersRead
    : readingProgress.readCount;

  const readingTotalCount = chapterReading.enabled
    ? chapterReading.totalChapters
    : readingProgress.totalTrackable;

  const readingAllRead = chapterReading.enabled
    ? chapterReading.allRead
    : readingProgress.allRead;

  const readingMarkAllDisabled = chapterReading.enabled
    ? chapterReading.loading || chapterReading.saving
    : readingProgress.loading || readingAbandoned.loading;

  const handleMarkAllRead = () => {
    if (chapterReading.enabled) {
      void chapterReading.markAllAsRead();
      return;
    }
    void readingProgress.markAllAsRead();
  };



  return (

    <main className="work-detail-page">

      <header className="work-detail-header">

        <button
          type="button"
          className="btn-back"
          onClick={() => navigate("/library")}
          title="Retour à la bibliothèque"
          aria-label="Retour à la bibliothèque"
        >
          <ArrowLeft size={18} aria-hidden />
          <span className="btn-back-label">Bibliothèque</span>
        </button>

        <div className="work-detail-actions">

          {work.source_url?.trim() ? (
            <button
              type="button"
              className="work-detail-icon-btn work-detail-icon-btn--secondary"
              title="Ouvrir sur Nautiljon"
              aria-label="Ouvrir sur Nautiljon"
              onClick={() => void openExternalUrl(work.source_url!)}
            >
              <ExternalLink size={18} aria-hidden />
              <span className="work-detail-action-label">Nautiljon</span>
            </button>
          ) : null}

          <button
            type="button"
            className="work-detail-icon-btn work-detail-icon-btn--primary"
            title="Modifier"
            aria-label="Modifier la série"
            onClick={() => setModalOpen(true)}
          >
            <Pencil size={18} aria-hidden />
            <span className="work-detail-action-label">Modifier</span>
          </button>

          <button
            type="button"
            className="work-detail-icon-btn work-detail-icon-btn--danger"
            title="Supprimer"
            aria-label="Supprimer la série"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={18} aria-hidden />
            <span className="work-detail-action-label">Supprimer</span>
          </button>

        </div>

      </header>



      <article className="work-detail-hero">

        <div className="work-detail-cover">

          <CoverImage url={work.cover_url} alt={work.title} zoomable />

        </div>

        <div className="work-detail-info">

          <h1>{work.title}</h1>



          <div className="work-detail-badge-row">

            {work.demographic_type ? (

              <InfoBadge label={work.demographic_type} color="#a78bfa" />

            ) : null}

            <InfoBadge

              label={getWorkStatusLabel(readingStatus)}

              color={getWorkStatusColor(readingStatus)}

            />

          </div>



          {tags.length > 0 ? <BadgeList items={tags} variant="tag" /> : null}



          <div className="work-detail-meta-block">

            {work.publisher_vf ? (

              <p className="work-detail-meta">{work.publisher_vf}</p>

            ) : null}

            {volumeStatsLine ? (
              <p className="work-detail-stats">{volumeStatsLine}</p>
            ) : null}

          </div>



          {work.synopsis ? (

            <p className="work-detail-synopsis">{work.synopsis}</p>

          ) : null}

        </div>

      </article>



      {workFinancials && volumes.length > 0 ? (

        <section className="work-detail-section">

          <h2>Coûts de la série</h2>

          <WorkSeriesFinancialCards

            financials={workFinancials}

            owners={owners}

          />

        </section>

      ) : null}

      <WorkFavoriteBar
        owners={owners}
        favoriteOwnerIds={favoriteOwnerIds}
        disabled={favoriteSaving}
        onToggle={(ownerId, favorited) => {
          if (!workId) {
            return;
          }
          setFavoriteSaving(true);
          void toggleWorkFavorite(workId, ownerId, favorited)
            .then(() => {
              setFavoriteOwnerIds((previous) =>
                favorited
                  ? [...new Set([...previous, ownerId])]
                  : previous.filter((id) => id !== ownerId),
              );
            })
            .finally(() => setFavoriteSaving(false));
        }}
      />

      <section className="work-detail-section">

        <div className="work-detail-section-header">

          <div className="work-detail-section-header-main">
            <h2>
              {trackingUnit === "chapter"
                ? `${getTrackingUnitLabelPlural(trackingUnit)} (${chapterCount})`
                : `Tomes (${volumes.length})`}
            </h2>
            {showReadingToolbar ? (
              <WorkDetailReadingToolbar
                readCount={readingReadCount}
                totalCount={readingTotalCount}
                unitLabel={volumeUnitLabel}
                allRead={readingAllRead}
                markAllDisabled={readingMarkAllDisabled}
                abandoned={readingAbandoned.isAbandoned}
                abandonedDisabled={
                  readingAbandoned.loading ||
                  readingAbandoned.saving ||
                  !readingAbandoned.enabled
                }
                onMarkAllRead={handleMarkAllRead}
                onAbandonedChange={(next) =>
                  void readingAbandoned.setAbandoned(next)
                }
              />
            ) : null}
          </div>

          {!hideChapterGrid ? (
            <div className="work-detail-section-actions">
              {volumes.length > 0 ? (
                <div
                  className="work-detail-volume-view-toggle"
                  role="group"
                  aria-label="Affichage des tomes"
                >
                  <button
                    type="button"
                    className={`work-detail-volume-view-btn${
                      volumeViewMode === "grid" ? " work-detail-volume-view-btn--active" : ""
                    }`}
                    title="Vue grille"
                    aria-label="Vue grille"
                    aria-pressed={volumeViewMode === "grid"}
                    onClick={() => handleVolumeViewMode("grid")}
                  >
                    <LayoutGrid size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={`work-detail-volume-view-btn${
                      volumeViewMode === "list" ? " work-detail-volume-view-btn--active" : ""
                    }`}
                    title="Vue liste"
                    aria-label="Vue liste"
                    aria-pressed={volumeViewMode === "list"}
                    onClick={() => handleVolumeViewMode("list")}
                  >
                    <List size={16} aria-hidden />
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="work-detail-add-volume-btn"
                onClick={() => setAddVolumeOpen(true)}
              >
                <Plus size={16} aria-hidden />
                {trackingUnit === "chapter" ? "Ajouter un chapitre" : "Ajouter un tome"}
              </button>
            </div>
          ) : null}

        </div>

        {hideChapterGrid ? (
          <div className="work-detail-chapter-summary">
            {chapterMihonOwner ? (
              <div className="work-detail-chapter-ownership-row">
                <OwnerInitialBadge owner={chapterMihonOwner} variant="mihon" />
              </div>
            ) : chapterPurchaseOwners.length > 0 ? (
              <div className="work-detail-chapter-ownership-row">
                {chapterPurchaseOwners.map((owner) => (
                  <OwnerInitialBadge
                    key={owner.id}
                    owner={owner}
                    variant="purchase"
                  />
                ))}
              </div>
            ) : (
              <p className="work-detail-empty">
                Aucune appartenance — ouvrez « Modifier », choisissez Mihon ou achat, puis
                enregistrez.
              </p>
            )}
            <p className="work-detail-chapter-summary-text">
              Suivi au niveau série
              {chapterCount > 0 ? ` — ${chapterCount} chapitres VF` : ""}.
            </p>
            <ChapterReadingProgressPanel
              progress={chapterReading}
              totalChapters={chapterCount}
            />
          </div>
        ) : volumes.length === 0 ? (

          <p className="work-detail-empty">
            {trackingUnit === "chapter"
              ? "Aucun chapitre enregistré."
              : "Aucun tome enregistré."}
          </p>

        ) : (

          <ul
            className={`work-detail-volumes${
              volumeViewMode === "list" ? " work-detail-volumes--list" : ""
            }`}
          >
            {volumes.map((vol) => {
              const mihonOwner = vol.mihonOwnerId
                ? ownerById.get(vol.mihonOwnerId)
                : null;
              const purchaseOwners = vol.ownerIds
                .map((id) => ownerById.get(id))
                .filter((owner): owner is NonNullable<typeof owner> =>
                  Boolean(owner),
                );
              const unitPrice = vol.catalogPrice ?? work.default_price ?? null;

              return (
                <li
                  key={vol.id ?? `${vol.volumeNumber}-${vol.volumeLabel ?? ""}-${vol.editionType}`}
                >
                  <WorkDetailVolumeCard
                    volume={vol}
                    trackingUnit={trackingUnit}
                    unitPrice={unitPrice}
                    mihonOwner={mihonOwner}
                    purchaseOwners={purchaseOwners}
                    isRead={vol.id ? readingProgress.isRead(vol.id) : false}
                    isAbandoned={readingAbandoned.isAbandoned}
                    onToggleRead={
                      vol.id
                        ? () => {
                            void readingProgress.toggleRead(vol.id!).catch(() => {
                              // Revert optimiste déjà géré dans le hook
                            });
                          }
                        : undefined
                    }
                    onEdit={
                      vol.id
                        ? () => setEditVolume(vol)
                        : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>

        )}

      </section>



      <EditVolumeModal
        open={editVolume != null}
        workId={work.id}
        workTitle={work.title}
        volume={editVolume}
        allVolumes={volumes}
        owners={owners}
        trackingUnit={trackingUnit}
        defaultPrice={work.default_price}
        onClose={() => setEditVolume(null)}
        onSaved={() => void reload()}
      />

      <AddVolumeModal

        open={addVolumeOpen}

        workId={work.id}

        workTitle={work.title}

        existingVolumes={volumes}

        owners={owners}

        onClose={() => setAddVolumeOpen(false)}

        onSaved={() => void reload()}

      />



      <WorkFormModal

        open={modalOpen}

        workId={work.id}

        owners={owners}

        onClose={() => setModalOpen(false)}

        onSaved={() => void reload()}

      />



      <DeleteWorkModal

        open={deleteOpen}

        workId={work.id}

        workTitle={work.title}

        onClose={() => setDeleteOpen(false)}

        onDeleted={() => navigate("/library")}

      />

    </main>

  );

}


