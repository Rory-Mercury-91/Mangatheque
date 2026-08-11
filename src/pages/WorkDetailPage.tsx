import { useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { ArrowLeft, Eye, EyeOff, GitMerge, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { LoadingOverlay } from "@/components/common/LoadingOverlay";
import { LibraryRelationPickerModal } from "@/features/anime/LibraryRelationPickerModal";
import { ImportMergeModal } from "@/features/import/ImportMergeModal";
import type { ImportMergePreview } from "@/services/importMergeService";
import {
  commitWorksMerge,
  prepareWorksMergePreview,
} from "@/services/workMergeService";
import { useWorks } from "@/hooks/useWorks";

import { AddVolumeModal } from "@/features/works/AddVolumeModal";
import { EditVolumeModal } from "@/features/works/EditVolumeModal";
import { WorkDetailReadingSection } from "@/features/works/WorkDetailReadingSection";
import { WorkDetailSectionNav } from "@/features/works/WorkDetailSectionNav";
import { WorkFavoriteBar } from "@/features/works/WorkFavoriteBar";
import { WorkReferencesModal } from "@/features/mihon/WorkReferencesModal";
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
import { resolveWorkTrackingProfile } from "@/utils/workTracking";

import { DeleteWorkModal } from "@/features/works/DeleteWorkModal";

import { WorkFormModal } from "@/features/works/WorkFormModal";
import { WorkLocalArchiveSection } from "@/features/works/WorkLocalArchiveSection";
import type { WorkLocalArchiveIncompleteSummary } from "@/features/works/WorkLocalArchiveSection";
import { WorkReleaseScheduleCard } from "@/features/works/WorkReleaseScheduleCard";
import { WorkReleaseScheduleModal } from "@/features/works/WorkReleaseScheduleModal";
import {
  catchUpWorkReleaseSchedule,
  fetchWorkReleaseSchedule,
} from "@/services/workReleaseScheduleService";

import { useAuth } from "@/contexts/AuthContext";
import { useDevMode } from "@/hooks/useDevMode";
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
import { openCatalogLink, openExternalUrl } from "@/services/platform/linkService";
import {
  buildAniListMangaUrl,
  buildMalMangaUrl,
} from "@/utils/trackerUrls";
import {
  fetchAndCacheWorkDetail,
  readWorkDetailCache,
  writeWorkDetailCache,
} from "@/services/workDetailCacheService";
import { patchWorkSynopsis, fetchLocalWorkMalIdMap, fetchLocalWorkAnilistIdMap, fetchWorkByMalId } from "@/services/workService";
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
} from "@/services/jikan/jikanMangaApi";
import { fetchWorkRecommendations } from "@/services/workRecommendationsService";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import type { Anime } from "@/types/anime";
import {
  canRemoveAnimeRelated,
  isRelatedSuppressed,
  relatedEntryMatchesWork,
} from "@/types/anime";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import { navigateBackOr } from "@/utils/appNavigation";

import type { SeriesFinancials, Work, WorkReleaseSchedule } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";
import {
  fetchWorkMihonSources,
  type WorkMihonSource,
} from "@/services/mihon/workMihonSourceService";
import { fetchMihonSourceMap } from "@/services/mihon/mihonSourceIndexService";
import {
  formatMihonSourceDisplay,
  toMihonSourceNameMap,
} from "@/utils/mihonSourceDisplay";

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
  const [devMode] = useDevMode();
  const { owners } = useOwners();
  const { works: libraryWorks } = useWorks();
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
  const [mergePickerOpen, setMergePickerOpen] = useState(false);
  const [mergeFromWorkId, setMergeFromWorkId] = useState<string | null>(null);
  const [mergeFromTitle, setMergeFromTitle] = useState("");
  const [mergePreview, setMergePreview] = useState<ImportMergePreview | null>(
    null,
  );
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [libraryAnimes, setLibraryAnimes] = useState<Anime[]>([]);
  const [relationsTick, setRelationsTick] = useState(0);
  const [mihonSources, setMihonSources] = useState<WorkMihonSource[]>([]);
  const [releaseSchedule, setReleaseSchedule] =
    useState<WorkReleaseSchedule | null>(null);
  const [releaseScheduleModalOpen, setReleaseScheduleModalOpen] =
    useState(false);
  const [mihonSourcesModalOpen, setMihonSourcesModalOpen] = useState(false);
  const [knownMihonSourceNames, setKnownMihonSourceNames] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const [archiveIncomplete, setArchiveIncomplete] =
    useState<WorkLocalArchiveIncompleteSummary | null>(null);



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
      try {
        setMihonSources(await fetchWorkMihonSources(workId));
      } catch {
        setMihonSources([]);
      }
      try {
        await catchUpWorkReleaseSchedule(workId, {
          workTitle: entry.work.title,
        });
        setReleaseSchedule(await fetchWorkReleaseSchedule(workId));
      } catch {
        setReleaseSchedule(null);
      }
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
        setMihonSources([]);
        setReleaseSchedule(null);
      }
    } finally {
      setLoading(false);
    }
  }, [workId, user?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const map = await fetchMihonSourceMap();
        if (!cancelled) {
          setKnownMihonSourceNames(toMihonSourceNameMap(map));
        }
      } catch {
        if (!cancelled) {
          setKnownMihonSourceNames(new Map());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const malId = work?.mal_id ?? null;
    const anilistId = work?.anilist_id ?? null;
    if (malId == null && anilistId == null) {
      setPictureItems([]);
      setRecoCards([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [pics, recs, malMap, anilistMap] = await Promise.all([
          malId != null
            ? fetchJikanMangaPictures(malId)
            : Promise.resolve([]),
          fetchWorkRecommendations({ malId, anilistId }),
          fetchLocalWorkMalIdMap(),
          fetchLocalWorkAnilistIdMap(),
        ]);
        if (cancelled) return;
        setPictureItems(pics);
        setRecoCards(
          recs.map((rec) => {
            const localId =
              (rec.malId != null ? malMap.get(rec.malId) : undefined) ??
              (rec.anilistId != null
                ? anilistMap.get(rec.anilistId)
                : undefined) ??
              null;
            const sourceLabel = rec.source === "mal" ? "MAL" : "AniList";
            return {
              key: `reco-manga-${rec.source}-${rec.malId ?? rec.anilistId}`,
              title: rec.title,
              image: rec.image,
              malId: rec.malId ?? undefined,
              mediaKind: "manga" as const,
              inLibrary: Boolean(localId),
              votesTooltip:
                rec.votes > 0
                  ? `${rec.votes} recommandation${rec.votes > 1 ? "s" : ""} ${sourceLabel}`
                  : undefined,
              onOpenLocal: localId
                ? () => navigate(`/work/${localId}`)
                : undefined,
              onAdd: localId
                ? undefined
                : () => {
                    void (async () => {
                      if (rec.malId != null) {
                        const existing = await fetchWorkByMalId(rec.malId);
                        if (existing) {
                          navigate(`/work/${existing.id}`);
                          return;
                        }
                        await openExternalUrl(buildMalMangaUrl(rec.malId));
                        return;
                      }
                      if (rec.anilistId != null) {
                        await openExternalUrl(
                          buildAniListMangaUrl(rec.anilistId),
                        );
                      }
                    })();
                  },
            };
          }),
        );
      } catch (err) {
        console.error("[galerie/reco] manga :", err);
        if (!cancelled) {
          setPictureItems([]);
          setRecoCards([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [work?.mal_id, work?.anilist_id, navigate]);

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

  const mergePickerItems = useMemo(() => {
    if (!work) return [];
    return libraryWorks
      .filter((item) => item.id !== work.id)
      .map((item) => ({
        id: item.id,
        title: item.title,
        coverUrl: item.cover_url,
        subtitle:
          item.mal_id != null
            ? `MAL ${item.mal_id}`
            : item.anilist_id != null
              ? `AniList ${item.anilist_id}`
              : null,
        payload: item,
      }));
  }, [libraryWorks, work]);

  /**
   * @description Prépare la fusion : cette fiche conserve, l'autre est absorbée.
   */
  const handleMergePick = async (payload: unknown) => {
    if (!work) return;
    const other = payload as Work;
    setMergeBusy(true);
    setError(null);
    try {
      const preview = await prepareWorksMergePreview(work.id, other.id, owners);
      setMergeFromWorkId(other.id);
      setMergeFromTitle(other.title);
      setMergePreview(preview);
      setMergeModalOpen(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Préparation de la fusion impossible.",
      );
    } finally {
      setMergeBusy(false);
    }
  };

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
        onOpen: () => void openCatalogLink(work.source_url!, "Nautiljon"),
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

  const editableMihonSources = useMemo((): WorkMihonSource[] => {
    if (!work) return [];
    if (mihonSources.length > 0) {
      return mihonSources;
    }
    const legacySourceId = work.mihon_source_id?.trim() ?? "";
    const legacySourceName = work.mihon_source_name?.trim() ?? "";
    const legacyCatalogUrl = work.mihon_catalog_url?.trim() ?? "";
    if (!legacySourceId && !legacySourceName && !legacyCatalogUrl) {
      return [];
    }
    return [
      {
        id: "legacy",
        workId: work.id,
        sourceId: legacySourceId,
        sourceName: legacySourceName || null,
        catalogUrl: legacyCatalogUrl || null,
        createdAt: work.created_at,
      },
    ];
  }, [mihonSources, work]);

  useEffect(() => {
    setArchiveIncomplete(null);
  }, [workId]);

  const handleArchiveIncompleteSummaryChange = useCallback(
    (summary: WorkLocalArchiveIncompleteSummary | null) => {
      setArchiveIncomplete(summary);
    },
    [],
  );

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

  const showSeriesCosts = Boolean(
    trackingProfile?.hasVolumeTracking &&
      workFinancials &&
      physicalVolumes.length > 0,
  );

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

          {devMode ? (
            <button
              type="button"
              className="ghost-action-btn"
              title="Fusionner avec une autre fiche (cette fiche est conservée)"
              aria-label="Fusionner avec une autre fiche"
              disabled={mergeBusy}
              onClick={() => setMergePickerOpen(true)}
            >
              <GitMerge size={18} aria-hidden />
              <span className="ghost-action-label">Fusionner</span>
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

              {work.publisher_vf ||
              volumeStatsSegments.length > 0 ||
              archiveIncomplete ? (
                <dl className="work-detail-stats-block">
                  {work.publisher_vf ? (
                    <div className="work-detail-stats-row">
                      <dt className="work-detail-stats-label">Éditeur</dt>
                      <dd className="work-detail-stats-value">
                        {work.publisher_vf}
                      </dd>
                    </div>
                  ) : null}
                  {volumeStatsSegments.map((segment) => {
                    const attachArchiveBadge =
                      Boolean(archiveIncomplete) &&
                      (segment.label === "Possédés" ||
                        segment.label === "Parution chapitres");
                    return (
                      <div key={segment.label} className="work-detail-stats-row">
                        <dt className="work-detail-stats-label">
                          {segment.label}
                        </dt>
                        <dd className="work-detail-stats-value">
                          <span className="work-detail-stats-value-main">
                            {segment.text}
                          </span>
                          {attachArchiveBadge && archiveIncomplete ? (
                            <span
                              className="work-detail-archive-incomplete-badge"
                              title={`${archiveIncomplete.missingCount} ${
                                archiveIncomplete.unit === "chapter"
                                  ? "chapitre(s)"
                                  : "volume(s)"
                              } manquant(s) en archive locale (${archiveIncomplete.receivedCount}/${archiveIncomplete.expectedCount})`}
                            >
                              <TriangleAlert size={12} aria-hidden />
                              {archiveIncomplete.receivedCount}/
                              {archiveIncomplete.expectedCount} en local
                            </span>
                          ) : null}
                        </dd>
                      </div>
                    );
                  })}
                  {archiveIncomplete &&
                  !volumeStatsSegments.some(
                    (segment) =>
                      segment.label === "Possédés" ||
                      segment.label === "Parution chapitres",
                  ) ? (
                    <div className="work-detail-stats-row">
                      <dt className="work-detail-stats-label">Archive locale</dt>
                      <dd className="work-detail-stats-value">
                        <span
                          className="work-detail-archive-incomplete-badge"
                          title={`${archiveIncomplete.missingCount} ${
                            archiveIncomplete.unit === "chapter"
                              ? "chapitre(s)"
                              : "volume(s)"
                          } manquant(s) (${archiveIncomplete.receivedCount}/${archiveIncomplete.expectedCount})`}
                        >
                          <TriangleAlert size={12} aria-hidden />
                          {archiveIncomplete.receivedCount}/
                          {archiveIncomplete.expectedCount} en local
                        </span>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

            </div>

          </div>

        </div>

      </article>

      <WorkDetailSectionNav
        items={[
          ...(work.synopsis
            ? [{ id: "work-detail-synopsis", label: "Synopsis" }]
            : []),
          ...(trackingProfile?.hasVolumeTracking ||
          trackingProfile?.hasChapterTracking
            ? [{ id: "work-detail-reading", label: "Ma lecture" }]
            : []),
          ...(showSeriesCosts
            ? [{ id: "work-detail-costs", label: "Coûts" }]
            : []),
          { id: "work-detail-release", label: "Parution" },
          { id: "work-detail-references", label: "Références" },
          { id: "work-detail-relations", label: "Relations" },
          ...(pictureItems.length > 0
            ? [{ id: "work-detail-gallery", label: "Galerie" }]
            : []),
          ...(recoCards.length > 0
            ? [{ id: "work-detail-recommendations", label: "Recos" }]
            : []),
          { id: "work-detail-archive", label: "Archive" },
        ]}
      />

      {work.synopsis ? (
        <SynopsisBlock
          collapsible
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

      {trackingProfile?.hasVolumeTracking ||
      trackingProfile?.hasChapterTracking ? (
        <WorkDetailReadingSection
          hasVolumeTracking={Boolean(trackingProfile?.hasVolumeTracking)}
          hasChapterTracking={Boolean(trackingProfile?.hasChapterTracking)}
          physicalVolumes={physicalVolumes}
          chapterCount={chapterCount}
          volumeViewMode={volumeViewMode}
          onVolumeViewMode={handleVolumeViewMode}
          onAddVolume={() => setAddVolumeOpen(true)}
          onEditVolume={(volume) => setEditVolume(volume)}
          ownerById={ownerById}
          defaultPrice={work.default_price}
          chapterMihonOwners={chapterMihonOwners}
          chapterReading={chapterReading}
          readingProgress={readingProgress}
          readingAbandoned={readingAbandoned}
          keepChapterReadingGap={keepChapterReadingGap}
        />
      ) : null}

      {showSeriesCosts ? (
        <section
          id="work-detail-costs"
          className="work-detail-section"
        >
          <h2>Coûts de la série</h2>
          <WorkSeriesFinancialCards
            financials={workFinancials!}
            owners={owners}
          />
        </section>
      ) : null}

      <WorkReleaseScheduleCard
        schedule={releaseSchedule}
        onEdit={() => setReleaseScheduleModalOpen(true)}
      />

      <DetailExternalLinks
        links={externalLinks}
        placement="section"
        title="Références"
        sectionId="work-detail-references"
        actions={
          <button
            type="button"
            className="ghost-action-btn"
            title="Gérer les références"
            aria-label="Gérer les références"
            onClick={() => setMihonSourcesModalOpen(true)}
          >
            <Pencil size={16} aria-hidden />
            <span className="ghost-action-label">Gérer</span>
          </button>
        }
      >
        <div className="work-detail-reference-block">
          <h3>Sources Mihon</h3>
          {editableMihonSources.length > 0 ? (
            <div className="work-detail-mihon-sources">
              {editableMihonSources.map((source) => {
                const display = formatMihonSourceDisplay(
                  source.sourceId,
                  source.sourceName,
                  knownMihonSourceNames,
                );
                const url = display.obsolete
                  ? null
                  : source.catalogUrl?.trim() || null;
                return url ? (
                  <button
                    key={source.id}
                    type="button"
                    className="work-detail-mihon-chip"
                    title={display.title}
                    onClick={() => void openCatalogLink(url, display.label)}
                  >
                    {display.label}
                  </button>
                ) : (
                  <span
                    key={source.id}
                    className={
                      display.obsolete
                        ? "work-detail-mihon-chip is-obsolete"
                        : "work-detail-mihon-chip is-static"
                    }
                    title={display.title}
                  >
                    {display.label}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="work-detail-mihon-empty">
              Aucune source Mihon renseignée.
            </p>
          )}
        </div>
      </DetailExternalLinks>

      <section
        id="work-detail-relations"
        className="work-detail-section"
      >
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
        <div id="work-detail-gallery">
          <AnimeImageGallery pictures={pictureItems} title={work.title} />
        </div>
      ) : null}

      {recoCards.length > 0 ? (
        <section
          id="work-detail-recommendations"
          className="work-detail-section"
        >
          <h2>Recommandations</h2>
          <AnimeMediaCarousel
            items={recoCards}
            emptyLabel="Aucune recommandation"
          />
        </section>
      ) : null}

      <WorkLocalArchiveSection
        work={work}
        onIncompleteSummaryChange={handleArchiveIncompleteSummaryChange}
      />

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

      <WorkReferencesModal
        open={mihonSourcesModalOpen}
        workId={work.id}
        workTitle={work.title}
        initialSourceUrl={work.source_url}
        initialMalId={work.mal_id}
        initialAnilistId={work.anilist_id}
        initialMihonSources={editableMihonSources}
        knownSourceNames={knownMihonSourceNames}
        onClose={() => setMihonSourcesModalOpen(false)}
        onSaved={() => void reload()}
      />

      <WorkReleaseScheduleModal
        open={releaseScheduleModalOpen}
        workId={work.id}
        workTitle={work.title}
        initialSchedule={releaseSchedule}
        mihonSources={editableMihonSources}
        onClose={() => setReleaseScheduleModalOpen(false)}
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

      <LibraryRelationPickerModal
        open={mergePickerOpen}
        title="Fusionner avec…"
        items={mergePickerItems}
        initialQuery={work.title}
        emptyLabel="Aucune autre fiche à fusionner."
        showRelationSelect={false}
        onClose={() => setMergePickerOpen(false)}
        onSelect={(payload) => handleMergePick(payload)}
      />

      <ImportMergeModal
        open={mergeModalOpen}
        preview={mergePreview}
        title="Fusionner deux fiches"
        confirmLabel="Fusionner et supprimer le doublon"
        onClose={() => {
          setMergeModalOpen(false);
          setMergePreview(null);
          setMergeFromWorkId(null);
          setMergeFromTitle("");
        }}
        commitMerge={async (preview) => {
          if (!mergeFromWorkId) {
            throw new Error("Fiche source manquante pour la fusion.");
          }
          await commitWorksMerge(
            preview.workId,
            mergeFromWorkId,
            preview.mergedValues,
            mergeFromTitle || "doublon",
          );
        }}
        onMerged={() => {
          setMergeFromWorkId(null);
          setMergeFromTitle("");
          setMergePreview(null);
          void reload();
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


