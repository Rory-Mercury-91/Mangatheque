import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import { CopyableTitle } from "@/components/common/CopyableTitle";
import { DetailExternalLinks } from "@/components/common/DetailExternalLinks";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { AnimeFormModal } from "@/features/anime/AnimeFormModal";
import { AnimeImageGallery } from "@/features/anime/AnimeImageGallery";
import { AnimeMediaCarousel } from "@/features/anime/AnimeMediaCarousel";
import { AnimeStreamingModal } from "@/features/anime/AnimeStreamingModal";
import { AnimeWatchPanel } from "@/features/anime/AnimeWatchPanel";
import { LibraryRelationPickerModal } from "@/features/anime/LibraryRelationPickerModal";
import { WorkFavoriteBar } from "@/features/works/WorkFavoriteBar";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import {
  ANIME_MEDIA_TYPE_LABELS,
  ANIME_NSFW_LABELS,
  formatAnimeAiringStatusLabel,
  formatAnimeRatingLabel,
  formatAnimeRelationLabel,
  formatAnimeSeasonLabel,
  formatAnimeSourceLabel,
  formatBroadcastSlotLabel,
  normalizeAnimeAiringStatus,
  normalizeAnimeNsfw,
} from "@/constants/animeStatus";
import { formatMediaTagLabel } from "@/constants/mediaTags";
import { useAuth } from "@/contexts/AuthContext";
import { useOwners } from "@/hooks/useOwners";
import { useLinkedOwnerForUser } from "@/hooks/useLinkedOwnerForUser";
import {
  addAnimeRelatedEntry,
  deleteAnime,
  enrichAnimeRelationsFromJikan,
  fetchAnimeById,
  fetchAnimeByMalId,
  fetchLocalAnimeMalIds,
  patchAnimeSynopsis,
  removeAnimeRelatedEntry,
} from "@/services/animeService";
import { fetchLocalWorkMalIdMap, fetchWorks } from "@/services/workService";
import {
  fetchAnimeFavoritesByAnime,
  toggleAnimeFavorite,
} from "@/services/animeFavoriteService";
import {
  isAnimeHiddenForCurrentUser,
  setAnimeHidden,
} from "@/services/animeHiddenService";
import {
  fetchAnimeProgress,
  upsertAnimeProgress,
} from "@/services/animeProgressService";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import type { Anime, AnimeListStatus } from "@/types/anime";
import { resolveAnimeDisplayTitle, visibleAnimeRelated, canRemoveAnimeRelated } from "@/types/anime";
import { openExternalUrl } from "@/services/platform/linkService";
import {
  buildAdkamiAnimeUrl,
  buildMalAnimeUrl,
} from "@/utils/animeExternalLinks";
import { resolveStreamingBrand } from "@/utils/streamingBrand";
import { navigateBackOr } from "@/utils/appNavigation";
import type { DetailExternalLinkItem } from "@/components/common/DetailExternalLinks";
import { SynopsisBlock } from "@/components/common/SynopsisBlock";
import type { WorkFormValues } from "@/types/workForm";
import type { Work } from "@/types/database";
import "@/components/common/ghostActionBtn.css";
import "@/pages/WorkDetailPage.css";
import "./AnimeDetailPage.css";

/**
 * @description Fiche détail animé (layout maquette + suivi).
 */
export function AnimeDetailPage() {
  const { animeId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { owners } = useOwners();
  const { linkedOwner, loading: linkedOwnerLoading } = useLinkedOwnerForUser();

  const [anime, setAnime] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addMalId, setAddMalId] = useState<number | null>(null);
  const [addWorkDraft, setAddWorkDraft] = useState<Partial<WorkFormValues> | null>(
    null,
  );
  const [streamingEditOpen, setStreamingEditOpen] = useState(false);
  const [linkMangaOpen, setLinkMangaOpen] = useState(false);
  const [libraryWorks, setLibraryWorks] = useState<Work[]>([]);
  const [localMalIds, setLocalMalIds] = useState<Set<number>>(new Set());
  const [localWorkMalIds, setLocalWorkMalIds] = useState(
    () => new Map<number, string>(),
  );
  const [favoriteOwnerIds, setFavoriteOwnerIds] = useState<string[]>([]);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [hiddenBusy, setHiddenBusy] = useState(false);
  const [listStatus, setListStatus] = useState<AnimeListStatus>("plan_to_watch");
  const [episodesWatched, setEpisodesWatched] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);

  const favoriteBarOwners = useMemo(
    () =>
      linkedOwner
        ? owners.filter((owner) => owner.id === linkedOwner.id)
        : [],
    [owners, linkedOwner],
  );

  const load = useCallback(async () => {
    if (!animeId) return;
    setLoading(true);
    setError(null);
    try {
      const [row, malIds, workMalIds, favorites] = await Promise.all([
        fetchAnimeById(animeId),
        fetchLocalAnimeMalIds(),
        fetchLocalWorkMalIdMap(),
        fetchAnimeFavoritesByAnime(),
      ]);
      if (!row) {
        setAnime(null);
        setError("Animé introuvable.");
        return;
      }
      setAnime(row);
      setLocalMalIds(malIds);
      setLocalWorkMalIds(workMalIds);
      setFavoriteOwnerIds(favorites.get(animeId) ?? []);
      if (user?.id) {
        const [progress, isHidden] = await Promise.all([
          fetchAnimeProgress(user.id, animeId),
          isAnimeHiddenForCurrentUser(animeId),
        ]);
        setHidden(isHidden);
        if (progress) {
          setListStatus(progress.list_status);
          setEpisodesWatched(progress.episodes_watched);
          setStartedAt(progress.started_at);
          setFinishedAt(progress.finished_at);
        } else {
          setListStatus("plan_to_watch");
          setEpisodesWatched(0);
          setStartedAt(null);
          setFinishedAt(null);
        }
      } else {
        setHidden(false);
      }

      // MAL related_manga est souvent vide : compléter via Jikan en arrière-plan.
      void enrichAnimeRelationsFromJikan(row).then((enriched) => {
        if (enriched.id === animeId) {
          setAnime(enriched);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [animeId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayTitle = anime ? resolveAnimeDisplayTitle(anime) : "";
  const displayLower = displayTitle.trim().toLowerCase();

  const titleBadges = useMemo(() => {
    if (!anime) return [];
    const badges: Array<{ key: string; label: string; className: string }> = [];
    const en = anime.title_en?.trim();
    const ja = anime.title_ja?.trim();
    const main = anime.title.trim();
    if (en && en.toLowerCase() !== displayLower) {
      badges.push({ key: "en", label: en, className: "title-badge--en" });
    }
    if (ja && ja.toLowerCase() !== displayLower) {
      badges.push({ key: "ja", label: ja, className: "title-badge--ja" });
    }
    // Titre original seulement s'il diffère du titre affiché (ex. FR affiché)
    if (
      anime.title_fr?.trim() &&
      main &&
      main.toLowerCase() !== displayLower
    ) {
      badges.push({ key: "orig", label: main, className: "title-badge--orig" });
    }
    return badges;
  }, [anime, displayLower]);

  const seasonLabel = formatAnimeSeasonLabel(anime?.season, anime?.year);

  const externalLinks = useMemo((): DetailExternalLinkItem[] => {
    if (!anime) return [];
    const links: DetailExternalLinkItem[] = [
      {
        id: "mal",
        label: "MyAnimeList",
        title: `Ouvrir sur MyAnimeList (ID ${anime.mal_id})`,
        onOpen: () => void openExternalUrl(buildMalAnimeUrl(anime.mal_id)),
      },
    ];
    if (anime.source_url?.trim()) {
      links.push({
        id: "nautiljon",
        label: "Nautiljon",
        title: "Ouvrir sur Nautiljon",
        onOpen: () => void openExternalUrl(anime.source_url!),
      });
    }
    if (anime.adkami_id != null) {
      links.push({
        id: "adkami",
        label: "ADKami",
        title: `Ouvrir sur ADKami (${anime.adkami_section ?? "anime"}/${anime.adkami_id})`,
        onOpen: () =>
          void openExternalUrl(
            buildAdkamiAnimeUrl(
              anime.adkami_id!,
              anime.adkami_section ?? "anime",
            ),
          ),
      });
    }
    return links;
  }, [anime]);

  const saveProgress = async (next: {
    listStatus: AnimeListStatus;
    episodesWatched: number;
    startedAt: string | null;
    finishedAt: string | null;
  }) => {
    if (!user?.id || !anime) return;
    setListStatus(next.listStatus);
    setEpisodesWatched(next.episodesWatched);
    setStartedAt(next.startedAt);
    setFinishedAt(next.finishedAt);
    await upsertAnimeProgress(user.id, anime.id, {
      listStatus: next.listStatus,
      episodesWatched: next.episodesWatched,
      startedAt: next.startedAt,
      finishedAt: next.finishedAt,
    });
    requestSupabaseDataReload();
  };

  const handleDelete = async () => {
    if (!anime) return;
    if (!window.confirm(`Supprimer « ${displayTitle} » ?`)) return;
    await deleteAnime(anime.id);
    requestSupabaseDataReload();
    navigate("/library/anime");
  };

  const openOrAddAnime = async (malId: number) => {
    const existing = await fetchAnimeByMalId(malId);
    if (existing) {
      navigate(`/anime/${existing.id}`);
      return;
    }
    setAddMalId(malId);
  };

  const removeRelation = async (
    type: string,
    malId: number,
    workId?: string | null,
  ) => {
    if (!anime) return;
    try {
      const updated = await removeAnimeRelatedEntry(
        anime.id,
        type,
        malId,
        workId,
      );
      setAnime(updated);
      requestSupabaseDataReload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de retirer la relation.",
      );
    }
  };

  const openLinkMangaPicker = async () => {
    try {
      const works = await fetchWorks();
      setLibraryWorks(works);
      setLinkMangaOpen(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger la bibliothèque manga.",
      );
    }
  };

  const linkMangaWork = async (payload: unknown, relation: string) => {
    if (!anime) return;
    const work = payload as Work;
    const updated = await addAnimeRelatedEntry(anime.id, {
      malId: work.mal_id ?? 0,
      workId: work.id,
      type: "manga",
      name: work.title,
      relation,
      image: work.cover_url,
    });
    setAnime(updated);
    void fetchLocalWorkMalIdMap().then(setLocalWorkMalIds);
    requestSupabaseDataReload();
  };

  const tags = useMemo(() => {
    if (!anime) return [];
    return [
      ...anime.genres,
      ...anime.themes,
      ...anime.explicit_genres,
    ];
  }, [anime]);

  const relationCards = useMemo(() => {
    if (!anime) return [];
    return visibleAnimeRelated(anime.related)
      .filter((r) => {
        const type = String(r.type).toLowerCase();
        return type === "anime" || type === "manga";
      })
      .map((r) => {
        const type = String(r.type).toLowerCase();
        const isAnime = type === "anime";
        const workIdFromEntry = r.workId?.trim() || undefined;
        const workId =
          !isAnime
            ? workIdFromEntry ??
              (r.malId > 0 ? localWorkMalIds.get(r.malId) : undefined)
            : undefined;
        const inLibrary = isAnime
          ? r.malId > 0 && localMalIds.has(r.malId)
          : workId != null;
        const canAddMissing =
          !inLibrary && r.malId > 0;
        return {
          key: workIdFromEntry
            ? `${type}-work-${workIdFromEntry}`
            : `${type}-${r.malId}`,
          title: r.name,
          image: r.image,
          malId: r.malId > 0 ? r.malId : undefined,
          mediaKind: (isAnime ? "anime" : "manga") as "anime" | "manga",
          chip: formatAnimeRelationLabel(r.relation),
          inLibrary,
          onAdd: canAddMissing
            ? isAnime
              ? () => void openOrAddAnime(r.malId)
              : () =>
                  setAddWorkDraft({
                    malId: r.malId,
                    title: r.name,
                  })
            : undefined,
          onOpenLocal: inLibrary
            ? () => {
                if (isAnime) {
                  void fetchAnimeByMalId(r.malId).then((row) => {
                    if (row) navigate(`/anime/${row.id}`);
                  });
                  return;
                }
                if (workId) navigate(`/work/${workId}`);
              }
            : undefined,
          onRemove: canRemoveAnimeRelated(r)
            ? () => void removeRelation(type, r.malId, workIdFromEntry)
            : undefined,
        };
      });
  }, [anime, localMalIds, localWorkMalIds, navigate]);

  const mangaPickerItems = useMemo(() => {
    const linkedWorkIds = new Set(
      visibleAnimeRelated(anime?.related ?? [])
        .filter((r) => String(r.type).toLowerCase() === "manga")
        .map((r) => r.workId?.trim())
        .filter((id): id is string => Boolean(id)),
    );
    const linkedMangaMalIds = new Set(
      visibleAnimeRelated(anime?.related ?? [])
        .filter(
          (r) =>
            String(r.type).toLowerCase() === "manga" && Number(r.malId) > 0,
        )
        .map((r) => Number(r.malId)),
    );
    return libraryWorks
      .filter((work) => {
        if (linkedWorkIds.has(work.id)) return false;
        if (work.mal_id != null && linkedMangaMalIds.has(work.mal_id)) {
          return false;
        }
        return true;
      })
      .map((work) => ({
        id: work.id,
        title: work.title,
        coverUrl: work.cover_url,
        subtitle:
          work.mal_id != null
            ? `MAL ${work.mal_id}`
            : "Sans MAL ID",
        payload: work,
      }));
  }, [anime?.related, libraryWorks]);

  const recoCards = useMemo(() => {
    if (!anime) return [];
    return anime.recommendations.map((r) => {
      const inLibrary = localMalIds.has(r.malId);
      return {
        key: `reco-${r.malId}`,
        title: r.title,
        image: r.image,
        malId: r.malId,
        mediaKind: "anime" as const,
        inLibrary,
        votesTooltip:
          r.votes > 0
            ? `${r.votes} recommandation${r.votes > 1 ? "s" : ""} MAL`
            : undefined,
        onAdd: () => void openOrAddAnime(r.malId),
        onOpenLocal: inLibrary
          ? () => {
              void fetchAnimeByMalId(r.malId).then((row) => {
                if (row) navigate(`/anime/${row.id}`);
              });
            }
          : undefined,
      };
    });
  }, [anime, localMalIds, navigate]);

  const airingNormalized = normalizeAnimeAiringStatus(anime?.status);
  const airingLabel = formatAnimeAiringStatusLabel(anime?.status);

  const isFinished = airingNormalized === "finished_airing";

  const mediaLabel = anime?.media_type
    ? ANIME_MEDIA_TYPE_LABELS[anime.media_type] ?? anime.media_type
    : "—";

  const durationLabel =
    anime?.duration_seconds != null
      ? `${Math.round(anime.duration_seconds / 60)} min`
      : null;

  return (
    <div className="work-detail-page anime-detail-page">
      <LoadingOverlayHost>
        {loading ? <LoadingOverlay message="Chargement…" /> : null}

        <header className="work-detail-header">
          <button
            type="button"
            className="ghost-action-btn"
            onClick={() => navigateBackOr(navigate, "/library/anime")}
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
                  if (!anime || ownerId !== linkedOwner?.id) return;
                  setFavoriteSaving(true);
                  void toggleAnimeFavorite(anime.id, ownerId, favorited)
                    .then(() => {
                      setFavoriteOwnerIds((prev) =>
                        favorited
                          ? [...new Set([...prev, ownerId])]
                          : prev.filter((id) => id !== ownerId),
                      );
                      requestSupabaseDataReload();
                    })
                    .catch((err) => {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Favori impossible.",
                      );
                    })
                    .finally(() => setFavoriteSaving(false));
                }}
              />
            ) : null}
            {anime ? (
              <DetailExternalLinks links={externalLinks} placement="header" />
            ) : null}
            {anime && user ? (
              <button
                type="button"
                className="ghost-action-btn"
                title={
                  hidden
                    ? "Réafficher dans ma liste"
                    : "Masquer de ma liste (hors compteurs)"
                }
                aria-label={
                  hidden ? "Démasquer cet animé" : "Masquer cet animé"
                }
                disabled={hiddenBusy}
                onClick={() => {
                  setHiddenBusy(true);
                  void setAnimeHidden(anime.id, !hidden)
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
              className="ghost-action-btn"
              onClick={() => setEditOpen(true)}
              disabled={!anime}
            >
              Modifier
            </button>
            <button
              type="button"
              className="ghost-action-btn"
              onClick={() => void handleDelete()}
              disabled={!anime}
            >
              Supprimer
            </button>
          </div>
        </header>

        {error ? <p className="work-detail-error">{error}</p> : null}

        {anime && hidden ? (
          <p className="anime-detail-hidden-banner" role="status">
            Masquée de ta liste — hors grille et compteurs. Utilise l&apos;œil
            dans les filtres Anime pour la retrouver, ou{" "}
            <button
              type="button"
              className="anime-detail-hidden-banner-action"
              disabled={hiddenBusy}
              onClick={() => {
                setHiddenBusy(true);
                void setAnimeHidden(anime.id, false)
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

        {anime ? (
          <>
            <article className="work-detail-hero">
              <div className="work-detail-hero-grid">
                <div className="work-detail-cover">
                  <CoverImage
                    url={anime.cover_url}
                    alt={displayTitle}
                    variant="fill"
                    zoomable
                  />
                </div>
                <div className="work-detail-info">
                  <CopyableTitle title={displayTitle} />
                  {titleBadges.length > 0 ? (
                    <div className="title-badges">
                      {titleBadges.map((b) => (
                        <span
                          key={b.key}
                          className={`title-badge ${b.className}`}
                        >
                          <em>{b.key === "orig" ? "ORIG" : b.key.toUpperCase()}</em>{" "}
                          {b.label}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="work-detail-badge-row">
                    {anime.demographics[0] ? (
                      <span className="info-badge" style={{ "--info-badge-color": "#a78bfa" } as CSSProperties}>
                        {formatMediaTagLabel(anime.demographics[0])}
                      </span>
                    ) : null}
                    {airingLabel ? (
                      <span className="info-badge" style={{ "--info-badge-color": "#64748b" } as CSSProperties}>
                        {airingLabel}
                      </span>
                    ) : null}
                    {seasonLabel ? (
                      <span className="chip chip-season">{seasonLabel}</span>
                    ) : null}
                    {anime.rating ? (
                      <span className="chip chip-amber">
                        {formatAnimeRatingLabel(anime.rating) ?? anime.rating}
                      </span>
                    ) : null}
                    {anime.nsfw && normalizeAnimeNsfw(anime.nsfw) !== "white" ? (
                      <span className="chip chip-danger">
                        {ANIME_NSFW_LABELS[normalizeAnimeNsfw(anime.nsfw)]}
                      </span>
                    ) : null}
                  </div>

                  {tags.length > 0 ? (
                    <div className="badge-list">
                      {tags.map((tag) => (
                        <span key={tag} className="badge badge--tag">
                          {formatMediaTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <dl className="meta-grid">
                    <div className="work-detail-stats-row">
                      <dt className="work-detail-stats-label">Type</dt>
                      <dd className="work-detail-stats-value">{mediaLabel}</dd>
                    </div>
                    {anime.source ? (
                      <div className="work-detail-stats-row">
                        <dt className="work-detail-stats-label">Source</dt>
                        <dd className="work-detail-stats-value">
                          {formatAnimeSourceLabel(anime.source) ?? anime.source}
                        </dd>
                      </div>
                    ) : null}
                    {anime.episodes != null ? (
                      <div className="work-detail-stats-row">
                        <dt className="work-detail-stats-label">Épisodes</dt>
                        <dd className="work-detail-stats-value">
                          {anime.episodes}
                          {durationLabel ? ` · ${durationLabel} / ép.` : ""}
                        </dd>
                      </div>
                    ) : null}
                    {anime.adkami_id != null &&
                    (anime.adkami_episode_offset ?? 0) > 0 ? (
                      <div className="work-detail-stats-row">
                        <dt className="work-detail-stats-label">
                          Offset ADKami
                        </dt>
                        <dd className="work-detail-stats-value">
                          −{anime.adkami_episode_offset} (ép. local = ADKami −{" "}
                          {anime.adkami_episode_offset})
                        </dd>
                      </div>
                    ) : null}
                    {!isFinished && (anime.broadcast_day || anime.broadcast_time) ? (
                      <div className="work-detail-stats-row">
                        <dt className="work-detail-stats-label">Créneau Japon</dt>
                        <dd className="work-detail-stats-value">
                          {formatBroadcastSlotLabel(
                            anime.broadcast_day,
                            anime.broadcast_time,
                          )}
                        </dd>
                      </div>
                    ) : null}
                    {anime.studios.length > 0 ? (
                      <div className="work-detail-stats-row">
                        <dt className="work-detail-stats-label">Studios</dt>
                        <dd className="work-detail-stats-value">
                          {anime.studios.join(", ")}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </div>

              {anime.synopsis ? (
                <SynopsisBlock
                  synopsis={anime.synopsis}
                  autoTranslate
                  onPersist={async (text) => {
                    await patchAnimeSynopsis(anime.id, text);
                    setAnime((prev) =>
                      prev ? { ...prev, synopsis: text } : prev,
                    );
                  }}
                />
              ) : null}
            </article>

            <DetailExternalLinks links={externalLinks} placement="section" />

            <AnimeWatchPanel
              listStatus={listStatus}
              episodesWatched={episodesWatched}
              episodesTotal={anime.episodes}
              startedAt={startedAt}
              finishedAt={finishedAt}
              canEdit={Boolean(user)}
              onChange={(next) => void saveProgress(next)}
            />

            <section className="work-detail-section">
              <div className="work-detail-section-header">
                <div className="work-detail-section-header-main">
                  <h2>Streaming</h2>
                </div>
                {user ? (
                  <div className="work-detail-section-actions">
                    <button
                      type="button"
                      className="ghost-action-btn"
                      title={
                        anime.streaming.length > 0
                          ? "Modifier les liens streaming"
                          : "Ajouter un lien streaming"
                      }
                      aria-label={
                        anime.streaming.length > 0
                          ? "Modifier les liens streaming"
                          : "Ajouter un lien streaming"
                      }
                      onClick={() => setStreamingEditOpen(true)}
                    >
                      {anime.streaming.length > 0 ? (
                        <Pencil size={16} aria-hidden />
                      ) : (
                        <Plus size={16} aria-hidden />
                      )}
                      <span className="ghost-action-label">
                        {anime.streaming.length > 0 ? "Modifier" : "Ajouter"}
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
              {anime.streaming.length > 0 ? (
                <div className="anime-stream-list">
                  {anime.streaming.map((s) => {
                    const brand = resolveStreamingBrand(s.name, s.url);
                    return (
                      <button
                        key={`${s.name}-${s.url}`}
                        type="button"
                        className={`anime-stream-link${
                          brand ? ` anime-stream-link--${brand.id}` : ""
                        }`}
                        title={brand?.label ?? s.name}
                        aria-label={`Ouvrir sur ${brand?.label ?? s.name}`}
                        onClick={() => void openExternalUrl(s.url)}
                      >
                        {brand ? (
                          <img
                            className="anime-stream-logo"
                            src={brand.logoSrc}
                            alt=""
                            aria-hidden
                          />
                        ) : (
                          <span>▶ {s.name}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="anime-empty">Aucune plateforme listée</p>
              )}
            </section>

            {anime.pictures.length > 0 ? (
              <AnimeImageGallery
                pictures={anime.pictures}
                title={displayTitle}
              />
            ) : null}

            <section className="work-detail-section">
              <div className="work-detail-section-header">
                <div className="work-detail-section-header-main">
                  <h2>Relations</h2>
                </div>
                <div className="work-detail-section-actions">
                  <button
                    type="button"
                    className="ghost-action-btn"
                    title="Lier un manga de la bibliothèque"
                    aria-label="Lier un manga de la bibliothèque"
                    onClick={() => void openLinkMangaPicker()}
                  >
                    <Plus size={16} aria-hidden />
                    <span className="ghost-action-label">Lier un manga</span>
                  </button>
                </div>
              </div>
              <AnimeMediaCarousel
                items={relationCards}
                emptyLabel="Aucune relation — liez un manga manuellement ou attendez l'enrichissement MAL/Jikan."
              />
            </section>

            <section className="work-detail-section">
              <h2>Recommandations</h2>
              <AnimeMediaCarousel
                items={recoCards}
                emptyLabel="Aucune recommandation"
              />
            </section>
          </>
        ) : null}
      </LoadingOverlayHost>

      <AnimeFormModal
        open={editOpen}
        animeId={anime?.id}
        onClose={() => setEditOpen(false)}
        onSaved={() => void load()}
      />
      <AnimeFormModal
        open={addMalId != null}
        initialMalId={addMalId}
        onClose={() => setAddMalId(null)}
        onSaved={(id) => {
          setAddMalId(null);
          navigate(`/anime/${id}`);
        }}
      />
      <WorkFormModal
        open={addWorkDraft != null}
        owners={owners}
        initialValues={addWorkDraft ?? undefined}
        onClose={() => setAddWorkDraft(null)}
        onSaved={(workId) => {
          setAddWorkDraft(null);
          void fetchLocalWorkMalIdMap().then(setLocalWorkMalIds);
          if (workId) navigate(`/work/${workId}`);
        }}
      />
      {anime ? (
        <AnimeStreamingModal
          open={streamingEditOpen}
          animeId={anime.id}
          initialStreaming={anime.streaming}
          onClose={() => setStreamingEditOpen(false)}
          onSaved={(streaming) => {
            setAnime((prev) => (prev ? { ...prev, streaming } : prev));
          }}
        />
      ) : null}
      <LibraryRelationPickerModal
        open={linkMangaOpen}
        title="Lier un manga"
        items={mangaPickerItems}
        initialQuery={anime ? resolveAnimeDisplayTitle(anime) : ""}
        emptyLabel="Aucune œuvre disponible (ou déjà liée)."
        onClose={() => setLinkMangaOpen(false)}
        onSelect={(payload, relation) => linkMangaWork(payload, relation)}
      />
    </div>
  );
}
