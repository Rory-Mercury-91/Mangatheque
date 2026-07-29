import { useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { ArrowLeft, Eye, EyeOff, LayoutGrid, List, Pencil, Plus, Trash2 } from "lucide-react";
import { LoadingOverlay } from "@/components/common/LoadingOverlay";
import { LibraryRelationPickerModal } from "@/features/anime/LibraryRelationPickerModal";

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
import { CopyableTitle } from "@/components/common/CopyableTitle";
import { DetailExternalLinks } from "@/components/common/DetailExternalLinks";
import type { DetailExternalLinkItem } from "@/components/common/DetailExternalLinks";
import { InfoBadge } from "@/components/common/InfoBadge";
import { SynopsisBlock } from "@/components/common/SynopsisBlock";
import { formatMediaTagLabel } from "@/constants/mediaTags";
import { formatAnimeRelationLabel } from "@/constants/animeStatus";
import {
  AnimeMediaCarousel,
  type AnimeCarouselCard,
} from "@/features/anime/AnimeMediaCarousel";
import { AnimeImageGallery } from "@/features/anime/AnimeImageGallery";
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

import { useAuth } from "@/contexts/AuthContext";
import { useWorkReadingProgress } from "@/hooks/useWorkReadingProgress";
import { useWorkChapterReadingProgress } from "@/hooks/useWorkChapterReadingProgress";
import { useWorkReadingAbandoned } from "@/hooks/useWorkReadingAbandoned";
import { useOwners } from "@/hooks/useOwners";
import { useLinkedOwnerForUser } from "@/hooks/useLinkedOwnerForUser";

import {
  toggleWorkFavorite,
} from "@/services/workFavoriteService";
import {
  isWorkHiddenForCurrentUser,
  setWorkHidden,
} from "@/services/workHiddenService";
import { openExternalUrl } from "@/services/platform/linkService";
import {
  buildAniListMangaUrl,
  buildMalMangaUrl,
} from "@/utils/trackerUrls";
import {
  fetchAndCacheWorkDetail,
  readWorkDetailCache,
  writeWorkDetailCache,
} from "@/services/workDetailCacheService";
import { patchWorkSynopsis, fetchLocalWorkMalIdMap, fetchWorkByMalId } from "@/services/workService";
import {
  addAnimeRelatedEntry,
  fetchAnimeByMalId,
  fetchAnimes,
  fetchAnimesRelatedToWork,
  removeAnimeRelatedEntry,
} from "@/services/animeService";
import {
  fetchJikanMangaFull,
  fetchJikanMangaPictures,
  fetchJikanMangaRecommendations,
} from "@/services/jikan/jikanMangaApi";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import type { Anime } from "@/types/anime";
import {
  canRemoveAnimeRelated,
  isRelatedSuppressed,
  relatedEntryMatchesWork,
} from "@/types/anime";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import { navigateBackOr } from "@/utils/appNavigation";

import type { SeriesFinancials, Work } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";

import "@/components/common/ghostActionBtn.css";
import "@/pages/AnimeDetailPage.css";
import "./WorkDetailPage.css";



/**

 * @description Fiche détaillée d'une série (synopsis, métadonnées, tomes).

 */

export function WorkDetailPage() {

  const { workId } = useParams<{ workId: string }>();

  const navigate = useNavigate();

  const { user } = useAuth();
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

  const [hidden, setHidden] = useState(false);
  const [hiddenBusy, setHiddenBusy] = useState(false);

  const [relationCards, setRelationCards] = useState<AnimeCarouselCard[]>([]);
  const [pictureItems, setPictureItems] = useState<
    Array<{ medium?: string; large?: string }>
  >([]);
  const [recoCards, setRecoCards] = useState<AnimeCarouselCard[]>([]);
  const [linkAnimeOpen, setLinkAnimeOpen] = useState(false);
  const [libraryAnimes, setLibraryAnimes] = useState<Anime[]>([]);
  const [relationsTick, setRelationsTick] = useState(0);



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
      if (user?.id) {
        setHidden(await isWorkHiddenForCurrentUser(workId));
      } else {
        setHidden(false);
      }
    } catch (err) {
      if (!hadCache) {
        setError(err instanceof Error ? err.message : "Erreur de chargement.");
        setWork(null);
        setVolumes([]);
        setWorkFinancials(null);
        setFavoriteOwnerIds([]);
        setHidden(false);
      }
    } finally {
      setLoading(false);
    }
  }, [workId, user?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const workId = work?.id;
    if (!workId) {
      setRelationCards([]);
      return;
    }

    const mangaMalId = work.mal_id ?? null;
    let cancelled = false;

    void (async () => {
      const cardsByKey = new Map<string, AnimeCarouselCard>();

      const attachLinkedAnime = (anime: Anime) => {
        const link = anime.related.find((entry) =>
          relatedEntryMatchesWork(entry, workId, mangaMalId),
        );
        if (!link) return;
        const key = `anime-local-${anime.id}`;
        cardsByKey.set(key, {
          key,
          title: resolveAnimeDisplayTitle(anime),
          image: anime.cover_url,
          malId: anime.mal_id,
          mediaKind: "anime",
          chip: formatAnimeRelationLabel(link.relation ?? "adaptation"),
          inLibrary: true,
          onOpenLocal: () => navigate(`/anime/${anime.id}`),
          onRemove: canRemoveAnimeRelated(link)
            ? () => {
                void removeAnimeRelatedEntry(
                  anime.id,
                  "manga",
                  mangaMalId ?? 0,
                  workId,
                )
                  .then(() => {
                    requestSupabaseDataReload();
                    setRelationsTick((n) => n + 1);
                  })
                  .catch((err) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Impossible de retirer la relation.",
                    );
                  });
              }
            : undefined,
        });
      };

      try {
        const linkedAnimes = await fetchAnimesRelatedToWork(
          workId,
          mangaMalId,
        );
        for (const anime of linkedAnimes) {
          attachLinkedAnime(anime);
        }
      } catch (err) {
        console.error("[relations] Lookup inverse animés :", err);
      }

      if (mangaMalId != null) {
        try {
          const jikan = await fetchJikanMangaFull(mangaMalId);
          for (const entry of jikan?.related ?? []) {
            if (String(entry.type).toLowerCase() !== "anime") continue;
            const key = `anime-mal-${entry.malId}`;
            const existing = [...cardsByKey.values()].find(
              (card) => card.malId === entry.malId,
            );
            if (existing) {
              if (!existing.chip && entry.relation) {
                existing.chip = formatAnimeRelationLabel(entry.relation);
              }
              continue;
            }
            const local = await fetchAnimeByMalId(entry.malId);
            const localMangaLink = local?.related.find((rel) =>
              relatedEntryMatchesWork(rel, workId, mangaMalId),
            );
            if (localMangaLink && isRelatedSuppressed(localMangaLink)) {
              continue;
            }
            if (local) {
              attachLinkedAnime(local);
              continue;
            }
            cardsByKey.set(key, {
              key,
              title: entry.name || `MAL ${entry.malId}`,
              malId: entry.malId,
              mediaKind: "anime",
              chip: formatAnimeRelationLabel(entry.relation),
              inLibrary: false,
            });
          }
        } catch (err) {
          console.error("[relations] Jikan manga :", err);
        }
      }

      if (!cancelled) {
        setRelationCards(Array.from(cardsByKey.values()));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [work?.id, work?.mal_id, navigate, relationsTick]);

  useEffect(() => {
    const malId = work?.mal_id;
    if (malId == null) {
      setPictureItems([]);
      setRecoCards([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [pics, recs, localMap] = await Promise.all([
          fetchJikanMangaPictures(malId),
          fetchJikanMangaRecommendations(malId),
          fetchLocalWorkMalIdMap(),
        ]);
        if (cancelled) return;
        setPictureItems(pics);
        setRecoCards(
          recs.map((rec) => {
            const localId = localMap.get(rec.malId) ?? null;
            return {
              key: `reco-manga-${rec.malId}`,
              title: rec.title,
              image: rec.image,
              malId: rec.malId,
              mediaKind: "manga" as const,
              inLibrary: Boolean(localId),
              votesTooltip:
                rec.votes > 0
                  ? `${rec.votes} recommandation${rec.votes > 1 ? "s" : ""} MAL`
                  : undefined,
              onOpenLocal: localId
                ? () => navigate(`/work/${localId}`)
                : undefined,
              onAdd: localId
                ? undefined
                : () => {
                    void (async () => {
                      const existing = await fetchWorkByMalId(rec.malId);
                      if (existing) {
                        navigate(`/work/${existing.id}`);
                        return;
                      }
                      await openExternalUrl(buildMalMangaUrl(rec.malId));
                    })();
                  },
            };
          }),
        );
      } catch (err) {
        console.error("[galerie/reco] Jikan manga :", err);
        if (!cancelled) {
          setPictureItems([]);
          setRecoCards([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [work?.mal_id, navigate]);

  const openLinkAnimePicker = async () => {
    if (!work) return;
    try {
      const animes = await fetchAnimes();
      setLibraryAnimes(animes.filter((anime) => anime.mal_id != null));
      setLinkAnimeOpen(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger la bibliothèque animé.",
      );
    }
  };

  const linkAnimeFromWork = async (payload: unknown, relation: string) => {
    if (!work) {
      throw new Error("Œuvre introuvable.");
    }
    const anime = payload as Anime;
    await addAnimeRelatedEntry(anime.id, {
      malId: work.mal_id ?? 0,
      workId: work.id,
      type: "manga",
      name: work.title,
      relation,
      image: work.cover_url,
    });
    requestSupabaseDataReload();
    setRelationsTick((n) => n + 1);
  };

  const animePickerItems = useMemo(() => {
    const linkedAnimeIds = new Set(
      relationCards
        .filter((card) => card.mediaKind === "anime" && card.onOpenLocal)
        .map((card) => card.key),
    );
    // Exclut aussi via malId pour les cartes locales déjà liées.
    const linkedAnimeMalIds = new Set(
      relationCards
        .filter((card) => card.mediaKind === "anime" && card.malId != null)
        .map((card) => Number(card.malId)),
    );
    return libraryAnimes
      .filter((anime) => {
        if (linkedAnimeIds.has(`anime-local-${anime.id}`)) return false;
        if (linkedAnimeMalIds.has(Number(anime.mal_id))) return false;
        return true;
      })
      .map((anime) => ({
        id: anime.id,
        title: resolveAnimeDisplayTitle(anime),
        coverUrl: anime.cover_url,
        subtitle: anime.mal_id != null ? `MAL ${anime.mal_id}` : null,
        payload: anime,
      }));
  }, [libraryAnimes, relationCards]);

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
          onClick={() => navigateBackOr(navigate, "/library/lectures")}
          title="Retour"
          aria-label="Retour"
        >
          <ArrowLeft size={18} aria-hidden />
          <span className="ghost-action-label">Retour</span>
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
          onClick={() => navigateBackOr(navigate, "/library/lectures")}
          title="Retour"
          aria-label="Retour"
        >
          <ArrowLeft size={18} aria-hidden />
          <span className="ghost-action-label">Retour</span>
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

          {user ? (
            <button
              type="button"
              className="ghost-action-btn"
              title={
                hidden
                  ? "Réafficher dans ma liste"
                  : "Masquer de ma liste (hors compteurs)"
              }
              aria-label={
                hidden ? "Démasquer cette série" : "Masquer cette série"
              }
              disabled={hiddenBusy}
              onClick={() => {
                if (!workId) return;
                setHiddenBusy(true);
                void setWorkHidden(workId, !hidden)
                  .then(() => {
                    setHidden(!hidden);
                    requestSupabaseDataReload();
                  })
                  .catch((err) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Impossible de modifier le masquage.",
                    );
                  })
                  .finally(() => setHiddenBusy(false));
              }}
            >
              {hidden ? (
                <Eye size={18} aria-hidden />
              ) : (
                <EyeOff size={18} aria-hidden />
              )}
              <span className="ghost-action-label">
                {hidden ? "Démasquer" : "Masquer"}
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

      {hidden ? (
        <p className="work-detail-hidden-banner" role="status">
          Masquée de ta liste — hors grille et compteurs. Utilise l&apos;œil
          dans les filtres Lectures pour la retrouver, ou{" "}
          <button
            type="button"
            className="work-detail-hidden-banner-action"
            disabled={hiddenBusy}
            onClick={() => {
              if (!workId) return;
              setHiddenBusy(true);
              void setWorkHidden(workId, false)
                .then(() => {
                  setHidden(false);
                  requestSupabaseDataReload();
                })
                .catch((err) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Impossible de démasquer.",
                  );
                })
                .finally(() => setHiddenBusy(false));
            }}
          >
            démasquer
          </button>
          .
        </p>
      ) : null}

      <article className="work-detail-hero">

        <div className="work-detail-hero-grid">

          <div className="work-detail-cover">

            <CoverImage url={work.cover_url} alt={work.title} zoomable />

          </div>

          <div className="work-detail-info">

            <CopyableTitle title={work.title} />



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
        <div className="work-detail-section-header">
          <div className="work-detail-section-header-main">
            <h2>Relations</h2>
          </div>
          <div className="work-detail-section-actions">
            <button
              type="button"
              className="ghost-action-btn"
              title="Lier un animé de la bibliothèque"
              aria-label="Lier un animé de la bibliothèque"
              onClick={() => void openLinkAnimePicker()}
            >
              <Plus size={16} aria-hidden />
              <span className="ghost-action-label">Lier un animé</span>
            </button>
          </div>
        </div>
        <AnimeMediaCarousel
          items={relationCards}
          emptyLabel="Aucune relation connue"
        />
      </section>

      {pictureItems.length > 0 ? (
        <AnimeImageGallery
          pictures={pictureItems}
          title={work.title}
        />
      ) : null}

      <section className="work-detail-section">
        <h2>Recommandations</h2>
        <AnimeMediaCarousel
          items={recoCards}
          emptyLabel={
            work.mal_id
              ? "Aucune recommandation"
              : "Ajoutez un MAL ID pour afficher les recommandations."
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

      <LibraryRelationPickerModal
        open={linkAnimeOpen}
        title="Lier un animé"
        items={animePickerItems}
        initialQuery={work.title}
        emptyLabel="Aucun animé disponible (ou déjà lié)."
        onClose={() => setLinkAnimeOpen(false)}
        onSelect={(payload, relation) => linkAnimeFromWork(payload, relation)}
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


