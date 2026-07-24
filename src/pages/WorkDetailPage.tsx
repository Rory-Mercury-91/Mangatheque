import { useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { ArrowLeft, LayoutGrid, List, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

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
import { DetailExternalLinks } from "@/components/common/DetailExternalLinks";
import type { DetailExternalLinkItem } from "@/components/common/DetailExternalLinks";
import { InfoBadge } from "@/components/common/InfoBadge";
import { SynopsisBlock } from "@/components/common/SynopsisBlock";
import { formatMediaTagLabel } from "@/constants/mediaTags";
import { formatAnimeRelationLabel } from "@/constants/animeStatus";
import { AnimeFormModal } from "@/features/anime/AnimeFormModal";
import {
  AnimeMediaCarousel,
  type AnimeCarouselCard,
} from "@/features/anime/AnimeMediaCarousel";
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
import { shouldKeepChapterReadingGap } from "@/utils/chapterReadingGap";
import { buildWorkStatsSegments } from "@/utils/workVolumeStats";
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

import {
  toggleWorkFavorite,
} from "@/services/workFavoriteService";
import { openExternalUrl } from "@/services/platform/linkService";
import {
  buildAniListMangaUrl,
  buildMalMangaUrl,
} from "@/utils/trackerUrls";
import { syncWorkFromTracker } from "@/services/tracker/trackerSyncService";
import { formatTrackerSyncMessage } from "@/utils/trackerSyncMessage";
import type { TrackerProvider } from "@/types/tracker";
import {
  fetchAndCacheWorkDetail,
  readWorkDetailCache,
  writeWorkDetailCache,
} from "@/services/workDetailCacheService";
import { patchWorkSynopsis } from "@/services/workService";
import {
  fetchAnimeByMalId,
  fetchAnimesRelatedToMangaMalId,
} from "@/services/animeService";
import { fetchJikanMangaFull } from "@/services/jikan/jikanMangaApi";
import { resolveAnimeDisplayTitle } from "@/types/anime";

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

  const [trackerSyncBusy, setTrackerSyncBusy] = useState<TrackerProvider | null>(
    null,
  );
  const [trackerSyncMessage, setTrackerSyncMessage] = useState<string | null>(
    null,
  );
  const [relationCards, setRelationCards] = useState<AnimeCarouselCard[]>([]);
  const [addAnimeMalId, setAddAnimeMalId] = useState<number | null>(null);



  const reload = useCallback(async () => {
    if (!workId) {
      return;
    }

    let hadCache = false;
    const cached = await readWorkDetailCache(workId);
    if (cached) {
      hadCache = true;
      setWork(cached.work);
      setVolumes(cached.volumes);
      setFavoriteOwnerIds(cached.favoriteOwnerIds);
      setWorkFinancials(cached.financials);
      setError(null);
      setLoading(false);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const entry = await fetchAndCacheWorkDetail(workId);
      setWork(entry.work);
      setVolumes(entry.volumes);
      setFavoriteOwnerIds(entry.favoriteOwnerIds);
      setWorkFinancials(entry.financials);
      setError(null);
    } catch (err) {
      if (!hadCache) {
        setError(err instanceof Error ? err.message : "Erreur de chargement.");
        setWork(null);
        setVolumes([]);
        setWorkFinancials(null);
        setFavoriteOwnerIds([]);
      }
    } finally {
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const mangaMalId = work?.mal_id;
    if (mangaMalId == null) {
      setRelationCards([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      const byMalId = new Map<number, AnimeCarouselCard>();

      try {
        const linkedAnimes = await fetchAnimesRelatedToMangaMalId(mangaMalId);
        for (const anime of linkedAnimes) {
          const link = anime.related.find(
            (entry) =>
              entry.malId === mangaMalId &&
              String(entry.type).toLowerCase() === "manga",
          );
          byMalId.set(anime.mal_id, {
            key: `anime-${anime.mal_id}`,
            title: resolveAnimeDisplayTitle(anime),
            image: anime.cover_url,
            malId: anime.mal_id,
            mediaKind: "anime",
            chip: formatAnimeRelationLabel(link?.relation ?? "adaptation"),
            inLibrary: true,
            onOpenLocal: () => navigate(`/anime/${anime.id}`),
          });
        }
      } catch (err) {
        console.error("[relations] Lookup inverse animés :", err);
      }

      try {
        const jikan = await fetchJikanMangaFull(mangaMalId);
        for (const entry of jikan?.related ?? []) {
          if (String(entry.type).toLowerCase() !== "anime") continue;
          const existing = byMalId.get(entry.malId);
          if (existing) {
            if (!existing.chip && entry.relation) {
              existing.chip = formatAnimeRelationLabel(entry.relation);
            }
            continue;
          }
          const local = await fetchAnimeByMalId(entry.malId);
          byMalId.set(entry.malId, {
            key: `anime-${entry.malId}`,
            title: entry.name || `MAL ${entry.malId}`,
            malId: entry.malId,
            mediaKind: "anime",
            chip: formatAnimeRelationLabel(entry.relation),
            inLibrary: Boolean(local),
            onOpenLocal: local
              ? () => navigate(`/anime/${local.id}`)
              : undefined,
            onAdd: local
              ? undefined
              : () => setAddAnimeMalId(entry.malId),
          });
        }
      } catch (err) {
        console.error("[relations] Jikan manga :", err);
      }

      if (!cancelled) {
        setRelationCards(Array.from(byMalId.values()));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [work?.mal_id, navigate]);



  const trackingProfile = useMemo(
    () => (work ? resolveWorkTrackingProfile(work) : null),
    [work],
  );

  const physicalVolumes = useMemo(
    () => volumes.filter((volume) => !isChapterSeriesPlaceholder(volume)),
    [volumes],
  );

  /** Catalogue complet : tous les tomes, pas seulement les possédés. */
  const trackableVolumeIds = useMemo(
    () =>
      physicalVolumes
        .map((volume) => volume.id)
        .filter((id): id is string => Boolean(id)),
    [physicalVolumes],
  );

  const chapterOwnership = useMemo(
    () => getChapterSeriesOwnershipSource(volumes),
    [volumes],
  );

  const chapterCount = trackingProfile?.chapterVfCount ?? 0;
  const chapterReadingActive = Boolean(
    trackingProfile?.hasChapterTracking && chapterCount > 0,
  );
  const volumeReadingActive = Boolean(
    trackingProfile?.hasVolumeTracking && trackableVolumeIds.length > 0,
  );
  const keepChapterReadingGap = shouldKeepChapterReadingGap(
    work ? normalizeWorkReadingStatus(work.reading_status) : undefined,
    Boolean(trackingProfile?.hasChapterTracking),
  );

  const handleChapterTotalsExpanded = useCallback(
    (totals: { chapterVfCount: number; chapterVoTotal: number | null }) => {
      setWork((previous) => {
        if (!previous) {
          return previous;
        }

        const legacyChapterOnly =
          (previous.tracking_unit ?? "volume") === "chapter" &&
          previous.chapters_vf_count == null;

        return {
          ...previous,
          chapters_vf_count: totals.chapterVfCount,
          chapters_vo_total: totals.chapterVoTotal,
          ...(legacyChapterOnly
            ? {
                volumes_vf_count: totals.chapterVfCount,
                volumes_vo_total: totals.chapterVoTotal,
              }
            : {}),
        };
      });
    },
    [],
  );

  const readingProgress = useWorkReadingProgress(
    workId,
    volumeReadingActive ? trackableVolumeIds : [],
  );

  const chapterReading = useWorkChapterReadingProgress(
    workId,
    chapterCount,
    chapterReadingActive,
    handleChapterTotalsExpanded,
    keepChapterReadingGap,
  );

  const readingAbandoned = useWorkReadingAbandoned(workId);

  const externalLinks = useMemo((): DetailExternalLinkItem[] => {
    if (!work) return [];
    const links: DetailExternalLinkItem[] = [];
    if (work.source_url?.trim()) {
      links.push({
        id: "nautiljon",
        label: "Nautiljon",
        title: "Ouvrir sur Nautiljon",
        onOpen: () => void openExternalUrl(work.source_url!),
      });
    }
    if (work.mal_id != null) {
      links.push({
        id: "mal",
        label: "MyAnimeList",
        title: `Ouvrir sur MyAnimeList (ID ${work.mal_id})`,
        onOpen: () => void openExternalUrl(buildMalMangaUrl(work.mal_id!)),
      });
    }
    if (work.anilist_id != null) {
      links.push({
        id: "anilist",
        label: "AniList",
        title: `Ouvrir sur AniList (ID ${work.anilist_id})`,
        onOpen: () =>
          void openExternalUrl(buildAniListMangaUrl(work.anilist_id!)),
      });
    }
    return links;
  }, [work]);

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
          onClick={() => navigate("/library/lectures")}
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

  const readingStatus = normalizeWorkReadingStatus(work.reading_status);



  const volumeStatsSegments = trackingProfile
    ? buildWorkStatsSegments(
        volumes,
        trackingProfile,
        work.default_price,
        work.price_format,
      )
    : [];

  const chapterMihonOwners = (chapterOwnership?.mihonOwnerIds ?? [])
    .map((id) => ownerById.get(id))
    .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner));

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
          onClick={() => navigate("/library/lectures")}
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

          {externalLinks.length > 0 ? (
            <DetailExternalLinks links={externalLinks} placement="header" />
          ) : null}

          {work.mal_id != null ? (
            <button
              type="button"
              className="ghost-action-btn"
              title="Synchroniser avec MyAnimeList (import + push)"
              aria-label="Synchroniser la progression MyAnimeList"
              disabled={trackerSyncBusy != null}
              onClick={() => {
                setTrackerSyncBusy("mal");
                setTrackerSyncMessage(null);
                void syncWorkFromTracker(work, "mal")
                  .then(async (result) => {
                    if (result.skippedReason) {
                      setTrackerSyncMessage(result.skippedReason);
                      return;
                    }
                    if (
                      result.chapterVfTotal != null &&
                      result.chapterVfTotal > 0
                    ) {
                      handleChapterTotalsExpanded({
                        chapterVfCount: result.chapterVfTotal,
                        chapterVoTotal: null,
                      });
                    }
                    setTrackerSyncMessage(
                      formatTrackerSyncMessage(result, "MAL synchronisé."),
                    );
                    await reload();
                  })
                  .catch((err) => {
                    setTrackerSyncMessage(
                      err instanceof Error ? err.message : "Sync MAL impossible.",
                    );
                  })
                  .finally(() => setTrackerSyncBusy(null));
              }}
            >
              <RefreshCw size={18} aria-hidden />
              <span className="ghost-action-label">
                {trackerSyncBusy === "mal" ? "MAL…" : "Sync MAL"}
              </span>
            </button>
          ) : null}

          {work.anilist_id != null ? (
            <button
              type="button"
              className="ghost-action-btn"
              title="Synchroniser avec AniList (import + push)"
              aria-label="Synchroniser la progression AniList"
              disabled={trackerSyncBusy != null}
              onClick={() => {
                setTrackerSyncBusy("anilist");
                setTrackerSyncMessage(null);
                void syncWorkFromTracker(work, "anilist")
                  .then(async (result) => {
                    if (result.skippedReason) {
                      setTrackerSyncMessage(result.skippedReason);
                      return;
                    }
                    if (
                      result.chapterVfTotal != null &&
                      result.chapterVfTotal > 0
                    ) {
                      handleChapterTotalsExpanded({
                        chapterVfCount: result.chapterVfTotal,
                        chapterVoTotal: null,
                      });
                    }
                    setTrackerSyncMessage(
                      formatTrackerSyncMessage(result, "AniList synchronisé."),
                    );
                    await reload();
                  })
                  .catch((err) => {
                    setTrackerSyncMessage(
                      err instanceof Error
                        ? err.message
                        : "Sync AniList impossible.",
                    );
                  })
                  .finally(() => setTrackerSyncBusy(null));
              }}
            >
              <RefreshCw size={18} aria-hidden />
              <span className="ghost-action-label">
                {trackerSyncBusy === "anilist" ? "AniList…" : "Sync AniList"}
              </span>
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

        <div className="work-detail-hero-grid">

          <div className="work-detail-cover">

            <CoverImage url={work.cover_url} alt={work.title} zoomable />

          </div>

          <div className="work-detail-info">

            <h1>{work.title}</h1>



            <div className="work-detail-badge-row">

              {work.demographic_type ? (

                <InfoBadge
                  label={formatMediaTagLabel(work.demographic_type)}
                  color="#a78bfa"
                />

              ) : null}

              <InfoBadge

                label={getWorkStatusLabel(readingStatus)}

                color={getWorkStatusColor(readingStatus)}

              />

            </div>

            {trackerSyncMessage ? (
              <p className="work-detail-tracker-msg">{trackerSyncMessage}</p>
            ) : null}



            {tags.length > 0 ? <BadgeList items={tags} variant="tag" /> : null}



            <div className="work-detail-meta-block">

              {work.publisher_vf || volumeStatsSegments.length > 0 ? (
                <dl className="work-detail-stats-block">
                  {work.publisher_vf ? (
                    <div className="work-detail-stats-row">
                      <dt className="work-detail-stats-label">Éditeur</dt>
                      <dd className="work-detail-stats-value">
                        {work.publisher_vf}
                      </dd>
                    </div>
                  ) : null}
                  {volumeStatsSegments.map((segment) => (
                    <div key={segment.label} className="work-detail-stats-row">
                      <dt className="work-detail-stats-label">{segment.label}</dt>
                      <dd className="work-detail-stats-value">{segment.text}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

            </div>

          </div>

        </div>

        {work.synopsis ? (
          <SynopsisBlock
            synopsis={work.synopsis}
            onPersist={async (text) => {
              await patchWorkSynopsis(work.id, text);
              const next = { ...work, synopsis: text };
              setWork(next);
              void writeWorkDetailCache({
                workId: work.id,
                work: next,
                volumes,
                financials: workFinancials,
                favoriteOwnerIds,
              });
            }}
          />
        ) : null}

      </article>

      <DetailExternalLinks links={externalLinks} placement="section" />

      <section className="work-detail-section">
        <h2>Relations</h2>
        <AnimeMediaCarousel
          items={relationCards}
          emptyLabel={
            work.mal_id
              ? "Aucune relation connue"
              : "Ajoutez un MAL ID pour afficher les relations"
          }
        />
      </section>

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
                keepOngoingWhenCaughtUp={keepChapterReadingGap}
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
            mihonOwners={chapterMihonOwners}
            progress={chapterReading}
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
                const mihonOwners = (vol.mihonOwnerIds ?? [])
                  .map((id) => ownerById.get(id))
                  .filter((owner): owner is NonNullable<typeof owner> =>
                    Boolean(owner),
                  );
                const purchaseOwners = (vol.ownerIds ?? [])
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
                      mihonOwners={mihonOwners}
                      purchaseOwners={purchaseOwners}
                      isRead={vol.id ? readingProgress.isRead(vol.id) : false}
                      isAbandoned={readingAbandoned.isAbandoned}
                      onToggleRead={
                        vol.id && readingProgress.enabled
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

      <AnimeFormModal
        open={addAnimeMalId != null}
        initialMalId={addAnimeMalId}
        onClose={() => setAddAnimeMalId(null)}
        onSaved={(animeId) => {
          setAddAnimeMalId(null);
          if (animeId) navigate(`/anime/${animeId}`);
        }}
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

        onDeleted={() => navigate("/library/lectures")}

      />

    </main>

  );

}


