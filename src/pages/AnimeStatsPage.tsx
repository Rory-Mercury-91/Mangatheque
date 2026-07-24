import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { AnimeProgressList } from "@/features/anime-stats/AnimeProgressList";
import { AnimeRecentCarousel } from "@/features/anime-stats/AnimeRecentCarousel";
import { AnimeStatsOverview } from "@/features/anime-stats/AnimeStatsOverview";
import { AnimeStatusBreakdown } from "@/features/anime-stats/AnimeStatusBreakdown";
import { ExportMediaHistoryButton } from "@/features/reading-stats/ExportReadingHistoryButton";
import { OwnerScopeSwitch } from "@/features/reading-stats/OwnerScopeSwitch";
import { deriveAnimeListStatus } from "@/constants/animeStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimes } from "@/hooks/useAnimes";
import { useOwners } from "@/hooks/useOwners";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import {
  fetchAnimeProgressForUser,
  upsertAnimeProgress,
} from "@/services/animeProgressService";
import { buildAnimeStatsSnapshot } from "@/services/animeStatsService";
import {
  buildAnimeWatchLibraryFilterPreset,
  saveLibraryFilterPreset,
} from "@/services/libraryFiltersPersistence";
import {
  fetchOwnersWithAccountLinks,
  type OwnerWithAccountLink,
} from "@/services/ownerAccountLinkService";
import { pushMalAnimeProgress } from "@/services/tracker/malAnimeApi";
import { fetchTrackerAccessToken } from "@/services/tracker/trackerTokenService";
import type { AnimeListStatus, UserAnimeProgress } from "@/types/anime";
import type { AnimeWatchItem } from "@/types/animeStats";
import type { ReadingStatsOwnerScope } from "@/types/readingStats";
import type { SyncReloadOptions } from "@/types/sync";
import "./ReadingStatsPage.css";

/**
 * @description Sous-onglet Suivi Anime — même structure visuelle que le suivi lectures.
 */
export function AnimeStatsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { owners } = useOwners();
  const { animes, loading: animesLoading, reload: reloadAnimes } = useAnimes();

  const [ownerScope, setOwnerScope] = useState<ReadingStatsOwnerScope>("all");
  const [ownerLinks, setOwnerLinks] = useState<OwnerWithAccountLink[]>([]);
  const [progressMap, setProgressMap] = useState(
    () => new Map<string, UserAnimeProgress>(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const animesSyncKey = useMemo(
    () => animes.map((anime) => `${anime.id}:${anime.updated_at}`).join("|"),
    [animes],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchOwnersWithAccountLinks()
      .then((links) => {
        if (cancelled) return;
        setOwnerLinks(links);
        if (!user?.id) return;
        const mine = links.find((owner) => owner.linkedUserId === user.id);
        if (!mine) return;
        setOwnerScope((current) => (current === "all" ? mine.id : current));
      })
      .catch(() => {
        if (!cancelled) setOwnerLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const linkedUserIdByOwnerId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const owner of ownerLinks) {
      map.set(owner.id, owner.linkedUserId);
    }
    return map;
  }, [ownerLinks]);

  const progressUserId = useMemo(() => {
    if (ownerScope === "all") return user?.id ?? null;
    return linkedUserIdByOwnerId.get(ownerScope) ?? null;
  }, [linkedUserIdByOwnerId, ownerScope, user?.id]);

  const canEdit = useMemo(() => {
    if (!user?.id || ownerScope === "all") return false;
    return linkedUserIdByOwnerId.get(ownerScope) === user.id;
  }, [linkedUserIdByOwnerId, ownerScope, user?.id]);

  const selectedOwnerUnlinked =
    ownerScope !== "all" && linkedUserIdByOwnerId.get(ownerScope) == null;

  const reload = useCallback(
    async (options?: SyncReloadOptions) => {
      if (animesLoading) return;

      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      if (!progressUserId) {
        setProgressMap(new Map());
        if (!silent) setLoading(false);
        return;
      }

      try {
        setProgressMap(await fetchAnimeProgressForUser(progressUserId));
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "Chargement impossible.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [animesLoading, progressUserId],
  );

  useEffect(() => {
    if (animesLoading) return;
    void reload({ silent: hasLoadedRef.current });
    hasLoadedRef.current = true;
  }, [reload, animesLoading, animesSyncKey]);

  useSupabaseSync(() => {
    void reloadAnimes({ silent: true });
    void reload({ silent: true });
  });

  const snapshot = useMemo(
    () => buildAnimeStatsSnapshot(animes, progressMap),
    [animes, progressMap],
  );

  const openLibraryWithStatus = useCallback(
    (status: AnimeListStatus) => {
      saveLibraryFilterPreset(
        buildAnimeWatchLibraryFilterPreset(
          status,
          ownerScope === "all" ? undefined : ownerScope,
        ),
      );
      navigate("/library/anime");
    },
    [navigate, ownerScope],
  );

  const handleIncrementEpisode = useCallback(
    async (item: AnimeWatchItem) => {
      if (!canEdit || !user?.id) return;

      const nextWatched = item.episodesWatched + 1;
      const nextStatus = deriveAnimeListStatus(
        nextWatched,
        item.episodesTotal,
        item.listStatus === "dropped",
      );

      const saved = await upsertAnimeProgress(user.id, item.animeId, {
        listStatus: nextStatus,
        episodesWatched: nextWatched,
      });

      setProgressMap((previous) => {
        const next = new Map(previous);
        next.set(item.animeId, saved);
        return next;
      });

      const anime = animes.find((entry) => entry.id === item.animeId);
      if (anime) {
        try {
          const token = await fetchTrackerAccessToken("mal");
          if (token) {
            await pushMalAnimeProgress(token, anime.mal_id, {
              status: nextStatus,
              episodesWatched: nextWatched,
              startedAt: saved.started_at,
              finishedAt: saved.finished_at,
            });
          }
        } catch {
          // Push MAL best-effort
        }
      }
    },
    [animes, canEdit, user?.id],
  );

  if (loading && !hasLoadedRef.current && snapshot.libraryCount === 0) {
    return (
      <LoadingOverlayHost className="reading-stats-page">
        <header className="reading-stats-header">
          <h1>Suivi anime</h1>
        </header>
        <LoadingOverlay message="Chargement du suivi…" />
      </LoadingOverlayHost>
    );
  }

  return (
    <div className="reading-stats-page">
      <header className="reading-stats-header">
        <div className="reading-stats-header-main">
          <h1>Suivi anime</h1>
          <p className="reading-stats-subtitle">
            Catalogue anime complet. Le toggle choisit le compte lié dont on
            affiche la progression. L&apos;édition (+1) n&apos;est possible que
            sur le toggle lié à votre compte connecté.
          </p>
        </div>
        <OwnerScopeSwitch
          owners={owners}
          value={ownerScope}
          onChange={setOwnerScope}
        />
      </header>

      {selectedOwnerUnlinked ? (
        <p className="reading-stats-error" role="status">
          Ce propriétaire n&apos;est pas lié à un compte. Liez-le dans Journal →
          Comptes pour afficher sa progression.
        </p>
      ) : null}

      {!canEdit && !selectedOwnerUnlinked ? (
        <p className="reading-stats-readonly" role="status">
          Consultation seule — passez sur votre pastille propriétaire pour
          modifier la progression.
        </p>
      ) : null}

      {error ? (
        <p className="reading-stats-error" role="alert">
          {error}
        </p>
      ) : null}

      <ExportMediaHistoryButton
        animeItems={snapshot.allItems}
        progressUserId={progressUserId}
      />

      <LoadingOverlayHost>
        {loading || animesLoading ? (
          <LoadingOverlay message="Chargement du suivi…" />
        ) : null}

        <section className="reading-stats-section">
          <h2>Aperçu</h2>
          <AnimeStatsOverview snapshot={snapshot} />
        </section>

        <section className="reading-stats-section">
          <h2>Statut des séries</h2>
          <AnimeStatusBreakdown
            snapshot={snapshot}
            onStatusClick={openLibraryWithStatus}
          />
        </section>

        <section className="reading-stats-section">
          <h2>Derniers visionnages</h2>
          <AnimeRecentCarousel items={snapshot.recentItems} />
        </section>

        <section className="reading-stats-section">
          <h2>En cours</h2>
          <AnimeProgressList
            items={snapshot.watchingItems}
            onIncrementEpisode={canEdit ? handleIncrementEpisode : undefined}
          />
        </section>
      </LoadingOverlayHost>
    </div>
  );
}
