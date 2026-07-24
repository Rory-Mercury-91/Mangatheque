import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { LibraryFilters } from "@/features/library/LibraryFilters";
import { LibraryPagination } from "@/features/library/LibraryPagination";
import { AnimeFormModal } from "@/features/anime/AnimeFormModal";
import { AnimeTile } from "@/features/anime/AnimeTile";
import { useAnimes } from "@/hooks/useAnimes";
import { useAuth } from "@/contexts/AuthContext";
import { useOwners } from "@/hooks/useOwners";
import { useLibraryPageSize } from "@/hooks/useLibraryPageSize";
import { fetchAnimeFavoritesByAnime } from "@/services/animeFavoriteService";
import { fetchHiddenAnimeIdsForUser } from "@/services/animeHiddenService";
import { fetchAllAnimeProgress } from "@/services/animeProgressService";
import {
  collectAnimeFilterOptions,
  filterAndSortAnimes,
} from "@/services/animeLibraryService";
import {
  clearStoredLibraryFilters,
  consumeLibraryFilterPreset,
  persistLibraryFilters,
  readStoredLibraryFilters,
} from "@/services/libraryFiltersPersistence";
import {
  fetchOwnersWithAccountLinks,
  type OwnerWithAccountLink,
} from "@/services/ownerAccountLinkService";
import type { UserAnimeProgress } from "@/types/anime";
import {
  DEFAULT_LIBRARY_FILTERS,
  type LibraryFiltersState,
} from "@/types/libraryFilters";
import "@/components/common/ghostActionBtn.css";
import "@/pages/LibraryPage.css";

/**
 * @description Bibliothèque Anime — mêmes filtres / bouton Ajouter que Lectures.
 */
export function AnimeLibraryPage() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { owners } = useOwners();
  const { animes, loading, error, reload } = useAnimes();
  const pageSize = useLibraryPageSize();

  const [modalOpen, setModalOpen] = useState(false);
  const [filters, setFilters] = useState<LibraryFiltersState>({
    ...DEFAULT_LIBRARY_FILTERS,
    sort: "created_desc",
    watchStatuses: [],
    airingStatuses: [],
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [ownerLinks, setOwnerLinks] = useState<OwnerWithAccountLink[]>([]);
  const [progressByUserId, setProgressByUserId] = useState<
    Map<string, Map<string, UserAnimeProgress>>
  >(new Map());
  const [favoritesByAnime, setFavoritesByAnime] = useState<
    Map<string, string[]>
  >(new Map());
  const [hiddenAnimeIds, setHiddenAnimeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const filtersHydratedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    const userKey = userId ?? "anonymous";

    if (filtersHydratedForUserRef.current === userKey) {
      return;
    }
    filtersHydratedForUserRef.current = userKey;

    const preset = consumeLibraryFilterPreset();
    if (preset) {
      const next = {
        ...DEFAULT_LIBRARY_FILTERS,
        ...preset,
        sort: preset.sort || "created_desc",
      };
      setFilters(next);
      setCurrentPage(1);
      persistLibraryFilters(userId, next, "anime");
      return;
    }

    const stored = readStoredLibraryFilters(userId, "anime");
    if (stored) {
      setFilters({
        ...DEFAULT_LIBRARY_FILTERS,
        ...stored,
        sort: stored.sort || "created_desc",
      });
      return;
    }

    setFilters({
      ...DEFAULT_LIBRARY_FILTERS,
      sort: "created_desc",
      watchStatuses: [],
      airingStatuses: [],
    });
  }, [session?.user?.id]);

  useEffect(() => {
    void fetchOwnersWithAccountLinks()
      .then(setOwnerLinks)
      .catch(() => setOwnerLinks([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchAllAnimeProgress(),
      fetchAnimeFavoritesByAnime(),
      user?.id
        ? fetchHiddenAnimeIdsForUser(user.id)
        : Promise.resolve(new Set<string>()),
    ])
      .then(([rows, favorites, hidden]) => {
        if (cancelled) return;
        const map = new Map<string, Map<string, UserAnimeProgress>>();
        for (const row of rows) {
          let byAnime = map.get(row.user_id);
          if (!byAnime) {
            byAnime = new Map();
            map.set(row.user_id, byAnime);
          }
          byAnime.set(row.anime_id, row);
        }
        setProgressByUserId(map);
        setFavoritesByAnime(favorites);
        setHiddenAnimeIds(hidden);
      })
      .catch(() => {
        if (!cancelled) {
          setProgressByUserId(new Map());
          setFavoritesByAnime(new Map());
          setHiddenAnimeIds(new Set());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [animes, user?.id]);

  const linkedUserIdByOwnerId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const owner of ownerLinks) {
      map.set(owner.id, owner.linkedUserId);
    }
    return map;
  }, [ownerLinks]);

  const filterOptions = useMemo(
    () => collectAnimeFilterOptions(animes),
    [animes],
  );

  const filtered = useMemo(
    () =>
      filterAndSortAnimes(animes, {
        filters,
        progressByUserId,
        linkedUserIdByOwnerId,
        fallbackUserId: user?.id ?? null,
        favoritesByAnime,
        hiddenAnimeIds,
      }),
    [
      animes,
      filters,
      progressByUserId,
      linkedUserIdByOwnerId,
      user?.id,
      favoritesByAnime,
      hiddenAnimeIds,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    filters.search,
    filters.sort,
    filters.ownerFilterById,
    filters.watchStatuses,
    filters.airingStatuses,
    filters.favoriteOwnerIds,
    filters.demographics,
    filters.tags,
    filters.showHiddenAnimes,
  ]);

  const handleFiltersChange = useCallback(
    (next: LibraryFiltersState) => {
      setFilters(next);
      setCurrentPage(1);
      persistLibraryFilters(session?.user?.id ?? null, next, "anime");
    },
    [session?.user?.id],
  );

  const handleSearchCommit = useCallback(
    (search: string) => {
      setFilters((prev) => {
        if (prev.search === search) return prev;
        const next = { ...prev, search };
        persistLibraryFilters(session?.user?.id ?? null, next, "anime");
        return next;
      });
      setCurrentPage(1);
    },
    [session?.user?.id],
  );

  const resetFilters = useCallback(() => {
    clearStoredLibraryFilters(session?.user?.id ?? null, "anime");
    setFilters({
      ...DEFAULT_LIBRARY_FILTERS,
      sort: "created_desc",
      watchStatuses: [],
      airingStatuses: [],
      showHiddenAnimes: false,
    });
    setCurrentPage(1);
  }, [session?.user?.id]);

  const visibleTotalCount = filters.showHiddenAnimes
    ? hiddenAnimeIds.size
    : Math.max(0, animes.length - hiddenAnimeIds.size);

  return (
    <main className="library-page library-page--with-overlay">
      <header className="library-header">
        <div className="library-title">
          <h1>Anime</h1>
        </div>
        <div className="library-header-actions">
          <button
            type="button"
            className="ghost-action-btn ghost-action-btn--accent library-add-btn"
            title="Ajouter un animé"
            aria-label="Ajouter un animé"
            onClick={() => setModalOpen(true)}
          >
            <Plus size={18} aria-hidden />
            <span className="ghost-action-label">Ajouter</span>
          </button>
        </div>
      </header>

      {loading ? (
        <LoadingOverlayHost className="library-page-body">
          <LoadingOverlay message="Chargement des animés…" />
        </LoadingOverlayHost>
      ) : error ? (
        <p className="library-error">{error}</p>
      ) : (
        <div className="library-page-body loading-overlay-host">
          <LibraryFilters
            variant="anime"
            filters={filters}
            owners={owners}
            demographics={filterOptions.demographics}
            tags={filterOptions.tags}
            resultCount={filtered.length}
            totalCount={visibleTotalCount}
            currentPage={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            onChange={handleFiltersChange}
            onSearchCommit={handleSearchCommit}
            onReset={resetFilters}
          />

          {animes.length === 0 ? (
            <section className="library-empty">
              <p>Aucun animé pour l&apos;instant.</p>
              <p>Ajoutez une série via le bouton « Ajouter » (import MAL).</p>
            </section>
          ) : (
            <>
              <div className="library-grid">
                {pageItems.map((anime) => (
                  <AnimeTile
                    key={anime.id}
                    anime={anime}
                    isFavorite={(favoritesByAnime.get(anime.id)?.length ?? 0) > 0}
                    onClick={(id) => navigate(`/anime/${id}`)}
                  />
                ))}
              </div>
              {filtered.length === 0 ? (
                <p className="library-empty">
                  {filters.showHiddenAnimes
                    ? "Aucune série masquée."
                    : "Aucun animé pour ces filtres."}
                </p>
              ) : null}
              <LibraryPagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      )}

      <AnimeFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(id) => {
          void reload();
          navigate(`/anime/${id}`);
        }}
      />
    </main>
  );
}
