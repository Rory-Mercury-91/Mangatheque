import { useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { ArrowLeft, ExternalLink, LayoutGrid, List, Pencil, Plus, Trash2 } from "lucide-react";

import { LoadingOverlay } from "@/components/common/LoadingOverlay";

import { AddVolumeModal } from "@/features/works/AddVolumeModal";
import { EditVolumeModal } from "@/features/works/EditVolumeModal";
import { WorkDetailVolumeCard } from "@/features/works/WorkDetailVolumeCard";
import { WorkChapterTrackingPanel } from "@/features/works/WorkChapterTrackingPanel";
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

import { WorkSeriesFinancialCards } from "@/features/works/WorkSeriesFinancialCards";

import {

  getWorkStatusColor,

  getWorkStatusLabel,

  normalizeWorkReadingStatus,

} from "@/constants/workStatus";

import {
  getChapterSeriesOwnershipSource,
  isChapterSeriesPlaceholder,
} from "@/utils/chapterSeries";
import { formatWorkStatsLine } from "@/utils/workVolumeStats";
import {
  formatWorkSectionTrackingTitle,
  resolveWorkTrackingProfile,
} from "@/utils/workTracking";

import { DeleteWorkModal } from "@/features/works/DeleteWorkModal";

import { WorkFormModal } from "@/features/works/WorkFormModal";

import { useWorkReadingProgress } from "@/hooks/useWorkReadingProgress";
import { useWorkChapterReadingProgress } from "@/hooks/useWorkChapterReadingProgress";
import { useWorkReadingAbandoned } from "@/hooks/useWorkReadingAbandoned";
import { useOwners } from "@/hooks/useOwners";
import { useLinkedOwnerForUser } from "@/hooks/useLinkedOwnerForUser";

import { fetchWorkFinancials } from "@/services/financialService";
import {
  fetchWorkFavoritesByWork,
  toggleWorkFavorite,
} from "@/services/workFavoriteService";

import { openExternalUrl } from "@/services/platform/linkService";
import { fetchWorkForEdit, duplicateVolumeEditionInWork } from "@/services/workService";
import {
  canDuplicateVolumeEdition,
  getDuplicateVolumeEditionLabel,
} from "@/utils/volumeIdentity";

import type { SeriesFinancials, Work } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";

import "@/components/common/ghostActionBtn.css";
import "./WorkDetailPage.css";



/**

 * @description Fiche détaillée d'une série (synopsis, métadonnées, tomes).

 */

export function WorkDetailPage() {

  const { workId } = useParams<{ workId: string }>();

  const navigate = useNavigate();

  const { owners } = useOwners();
  const { linkedOwner, loading: linkedOwnerLoading } = useLinkedOwnerForUser();

  const favoriteBarOwners = useMemo(
    () =>
      linkedOwner
        ? owners.filter((owner) => owner.id === linkedOwner.id)
        : [],
    [owners, linkedOwner],
  );

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

  const [duplicatingVolumeId, setDuplicatingVolumeId] = useState<string | null>(null);



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



  const trackingProfile = useMemo(
    () => (work ? resolveWorkTrackingProfile(work) : null),
    [work],
  );

  const physicalVolumes = useMemo(
    () => volumes.filter((volume) => !isChapterSeriesPlaceholder(volume)),
    [volumes],
  );

  const trackableVolumeIds = useMemo(
    () =>
      physicalVolumes
        .map((volume) => volume.id)
        .filter((id): id is string => Boolean(id)),
    [physicalVolumes],
  );

  const chapterCount = trackingProfile?.chapterVfCount ?? 0;
  const chapterReadingActive = Boolean(
    trackingProfile?.hasChapterTracking && chapterCount > 0,
  );
  const volumeReadingActive = Boolean(
    trackingProfile?.hasVolumeTracking && trackableVolumeIds.length > 0,
  );

  const readingProgress = useWorkReadingProgress(
    workId,
    volumeReadingActive ? trackableVolumeIds : [],
  );

  const chapterReading = useWorkChapterReadingProgress(
    workId,
    chapterCount,
    chapterReadingActive,
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
          className="ghost-action-btn"
          onClick={() => navigate("/library")}
          title="Retour à la bibliothèque"
          aria-label="Retour à la bibliothèque"
        >
          <ArrowLeft size={18} aria-hidden />
          <span className="ghost-action-label">Bibliothèque</span>
        </button>

        <p className="work-detail-error">{error ?? "Série introuvable."}</p>

      </main>

    );

  }



  const tags = [...(work.genres ?? []), ...(work.themes ?? [])];

  const ownerById = new Map(owners.map((o) => [o.id, o]));

  const handleDuplicateVolume = async (volume: VolumeFormRow) => {
    if (!workId || !volume.id) {
      return;
    }

    setDuplicatingVolumeId(volume.id);
    try {
      await duplicateVolumeEditionInWork(workId, volume, volumes, work.title);
      await reload();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Impossible de dupliquer le tome.",
      );
    } finally {
      setDuplicatingVolumeId(null);
    }
  };

  const readingStatus = normalizeWorkReadingStatus(work.reading_status);



  const volumeStatsLine = trackingProfile
    ? formatWorkStatsLine(
        volumes,
        trackingProfile,
        work.default_price,
        work.price_format,
      )
    : null;

  const chapterOwnership = getChapterSeriesOwnershipSource(volumes);
  const chapterMihonOwner = chapterOwnership?.mihonOwnerId
    ? ownerById.get(chapterOwnership.mihonOwnerId)
    : null;

  const showReadingToolbar =
    chapterReading.enabled || readingProgress.enabled;

  const combinedReadCount =
    (chapterReading.enabled ? chapterReading.chaptersRead : 0) +
    (readingProgress.enabled ? readingProgress.readCount : 0);

  const combinedTotalCount =
    (chapterReading.enabled ? chapterReading.totalChapters : 0) +
    (readingProgress.enabled ? readingProgress.totalTrackable : 0);

  const sectionTitle = trackingProfile
    ? formatWorkSectionTrackingTitle(
        trackingProfile,
        physicalVolumes.length,
        chapterCount,
      )
    : "Tomes";



  return (

    <main className="work-detail-page">

      <header className="work-detail-header">

        <button
          type="button"
          className="ghost-action-btn"
          onClick={() => navigate("/library")}
          title="Retour à la bibliothèque"
          aria-label="Retour à la bibliothèque"
        >
          <ArrowLeft size={18} aria-hidden />
          <span className="ghost-action-label">Bibliothèque</span>
        </button>

        <div className="work-detail-actions">

          {!linkedOwnerLoading && favoriteBarOwners.length > 0 ? (
            <WorkFavoriteBar
              placement="header"
              owners={favoriteBarOwners}
              favoriteOwnerIds={favoriteOwnerIds}
              disabled={favoriteSaving}
              onToggle={(ownerId, favorited) => {
                if (!workId || ownerId !== linkedOwner?.id) {
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
          ) : null}

          {work.source_url?.trim() ? (
            <button
              type="button"
              className="ghost-action-btn"
              title="Ouvrir sur Nautiljon"
              aria-label="Ouvrir sur Nautiljon"
              onClick={() => void openExternalUrl(work.source_url!)}
            >
              <ExternalLink size={18} aria-hidden />
              <span className="ghost-action-label">Nautiljon</span>
            </button>
          ) : null}

          <button
            type="button"
            className="ghost-action-btn ghost-action-btn--accent"
            title="Modifier"
            aria-label="Modifier la série"
            onClick={() => setModalOpen(true)}
          >
            <Pencil size={18} aria-hidden />
            <span className="ghost-action-label">Modifier</span>
          </button>

          <button
            type="button"
            className="ghost-action-btn ghost-action-btn--danger"
            title="Supprimer"
            aria-label="Supprimer la série"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={18} aria-hidden />
            <span className="ghost-action-label">Supprimer</span>
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



      {workFinancials && physicalVolumes.length > 0 ? (

        <section className="work-detail-section">

          <h2>Coûts de la série</h2>

          <WorkSeriesFinancialCards

            financials={workFinancials}

            owners={owners}

          />

        </section>

      ) : null}

      <section className="work-detail-section">

        <div className="work-detail-section-header">

          <div className="work-detail-section-header-main">
            <h2>{sectionTitle}</h2>
            {showReadingToolbar ? (
              <WorkDetailReadingToolbar
                combinedReadCount={combinedReadCount}
                combinedTotalCount={combinedTotalCount}
                abandoned={readingAbandoned.isAbandoned}
                abandonedDisabled={
                  readingAbandoned.loading ||
                  readingAbandoned.saving ||
                  !readingAbandoned.enabled
                }
                onAbandonedChange={(next) =>
                  void readingAbandoned.setAbandoned(next)
                }
                chapterSegment={
                  chapterReading.enabled
                    ? {
                        readCount: chapterReading.chaptersRead,
                        totalCount: chapterReading.totalChapters,
                        unitLabel: "chapitres",
                        allRead: chapterReading.allRead,
                        markAllDisabled:
                          chapterReading.loading || chapterReading.saving,
                        onMarkAllRead: () => void chapterReading.markAllAsRead(),
                      }
                    : undefined
                }
                volumeSegment={
                  readingProgress.enabled && readingProgress.totalTrackable > 0
                    ? {
                        readCount: readingProgress.readCount,
                        totalCount: readingProgress.totalTrackable,
                        unitLabel: "tomes",
                        allRead: readingProgress.allRead,
                        markAllDisabled:
                          readingProgress.loading || readingAbandoned.loading,
                        onMarkAllRead: () => void readingProgress.markAllAsRead(),
                      }
                    : undefined
                }
              />
            ) : null}
          </div>

          {trackingProfile?.hasVolumeTracking ? (
            <div className="work-detail-section-actions">
              {physicalVolumes.length > 0 ? (
                <div
                  className="work-detail-volume-view-toggle"
                  role="group"
                  aria-label="Affichage des tomes"
                >
                  <button
                    type="button"
                    className={`ghost-action-btn${
                      volumeViewMode === "grid" ? " ghost-action-btn--active" : ""
                    }`}
                    title="Vue grille"
                    aria-label="Vue grille"
                    aria-pressed={volumeViewMode === "grid"}
                    onClick={() => handleVolumeViewMode("grid")}
                  >
                    <LayoutGrid size={18} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={`ghost-action-btn${
                      volumeViewMode === "list" ? " ghost-action-btn--active" : ""
                    }`}
                    title="Vue liste"
                    aria-label="Vue liste"
                    aria-pressed={volumeViewMode === "list"}
                    onClick={() => handleVolumeViewMode("list")}
                  >
                    <List size={18} aria-hidden />
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="ghost-action-btn ghost-action-btn--accent"
                title="Ajouter un tome"
                aria-label="Ajouter un tome"
                onClick={() => setAddVolumeOpen(true)}
              >
                <Plus size={18} aria-hidden />
                <span className="ghost-action-label">Ajouter un tome</span>
              </button>
            </div>
          ) : null}

        </div>

        {trackingProfile?.hasChapterTracking ? (
          <WorkChapterTrackingPanel
            mihonOwner={chapterMihonOwner}
            progress={chapterReading}
            totalChapters={chapterCount}
          />
        ) : null}

        {trackingProfile?.hasVolumeTracking ? (
          physicalVolumes.length === 0 ? (
            <p className="work-detail-empty">Aucun tome enregistré.</p>
          ) : (
            <ul
              className={`work-detail-volumes${
                volumeViewMode === "list" ? " work-detail-volumes--list" : ""
              }`}
            >
              {physicalVolumes.map((vol) => {
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
                      trackingUnit="volume"
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
                      onDuplicate={
                        vol.id && canDuplicateVolumeEdition(vol, volumes)
                          ? () => void handleDuplicateVolume(vol)
                          : undefined
                      }
                      duplicateLabel={getDuplicateVolumeEditionLabel(vol.editionType)}
                      duplicating={duplicatingVolumeId === vol.id}
                    />
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

      </section>



      <EditVolumeModal
        open={editVolume != null}
        workId={work.id}
        workTitle={work.title}
        volume={editVolume}
        allVolumes={volumes}
        owners={owners}
        trackingUnit="volume"
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


