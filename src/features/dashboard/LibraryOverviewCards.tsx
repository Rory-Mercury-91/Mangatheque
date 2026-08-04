import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { normalizeAnimeAiringStatus } from "@/constants/animeStatus";
import { useAuth } from "@/contexts/AuthContext";
import { WatchTimeValue } from "@/features/anime-stats/WatchTimeValue";
import { useAnimes } from "@/hooks/useAnimes";
import { useWorks } from "@/hooks/useWorks";
import { fetchHiddenAnimeIdsForUser } from "@/services/animeHiddenService";
import { fetchAnimeProgressForUser } from "@/services/animeProgressService";
import {
  libraryCacheBundleToMaps,
  readLibraryCacheBundle,
} from "@/services/libraryCacheService";
import { fetchLibraryMetaBundle } from "@/services/libraryMetaBundleService";
import { fetchHiddenWorkIdsForUser } from "@/services/workHiddenService";
import type { LibraryUserReadingMeta } from "@/types/libraryFilters";
import { computeAnimeWatchedSeconds } from "@/utils/animeWatchTime";
import "./LibraryOverviewCards.css";

interface RatioStat {
  read: number;
  total: number;
}

/**
 * @description Cartes aperçu : global foyer, puis progression lecture / anime du compte connecté.
 */
export function LibraryOverviewCards() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { works } = useWorks();
  const { animes } = useAnimes();
  const [mangaReading, setMangaReading] = useState(0);
  const [volumes, setVolumes] = useState<RatioStat>({ read: 0, total: 0 });
  const [chapters, setChapters] = useState<RatioStat>({ read: 0, total: 0 });
  const [animeWatching, setAnimeWatching] = useState(0);
  const [episodes, setEpisodes] = useState<RatioStat>({ read: 0, total: 0 });
  const [animePlanned, setAnimePlanned] = useState(0);
  const [watchTimeSeconds, setWatchTimeSeconds] = useState(0);

  const worksSyncKey = useMemo(
    () => works.map((work) => `${work.id}:${work.updated_at}`).join("|"),
    [works],
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        let readingMeta: Map<string, LibraryUserReadingMeta> | null = null;
        const cached = await readLibraryCacheBundle(user.id, worksSyncKey);
        if (cached) {
          readingMeta = libraryCacheBundleToMaps(cached).readingMetaByWork;
        } else if (works.length > 0) {
          const bundle = await fetchLibraryMetaBundle(works, {
            targetUserId: user.id,
            includeWorkMeta: false,
          });
          readingMeta = bundle.readingMeta;
        } else {
          readingMeta = new Map();
        }

        const [animeProgress, hiddenAnimeIds, hiddenWorkIds] =
          await Promise.all([
            fetchAnimeProgressForUser(user.id),
            fetchHiddenAnimeIdsForUser(user.id),
            fetchHiddenWorkIdsForUser(user.id),
          ]);
        if (cancelled || !readingMeta) return;

        let reading = 0;
        let volumesRead = 0;
        let volumesTotal = 0;
        let chaptersRead = 0;
        let chaptersTotal = 0;
        for (const work of works) {
          if (hiddenWorkIds.has(work.id)) continue;
          const meta = readingMeta.get(work.id);
          if (!meta) continue;
          volumesRead += meta.volumesRead;
          volumesTotal += meta.volumesTotal;
          chaptersRead += meta.chaptersRead;
          chaptersTotal += meta.chaptersTotal;
          if (meta.userReadingStatus === "ongoing") reading += 1;
        }

        let watching = 0;
        let planned = 0;
        let episodesWatched = 0;
        let watchedSeconds = 0;
        const animeById = new Map(animes.map((anime) => [anime.id, anime]));
        for (const progress of animeProgress.values()) {
          if (hiddenAnimeIds.has(progress.anime_id)) continue;
          const anime = animeById.get(progress.anime_id);
          if (
            anime &&
            normalizeAnimeAiringStatus(anime.status) === "not_yet_aired"
          ) {
            continue;
          }
          episodesWatched += progress.episodes_watched;
          if (anime) {
            watchedSeconds += computeAnimeWatchedSeconds(
              anime,
              progress.episodes_watched,
            );
          }
          if (progress.list_status === "watching") watching += 1;
          if (progress.list_status === "plan_to_watch") planned += 1;
        }

        const episodesTotal = animes.reduce((sum, anime) => {
          if (hiddenAnimeIds.has(anime.id)) return sum;
          if (normalizeAnimeAiringStatus(anime.status) === "not_yet_aired") {
            return sum;
          }
          return sum + (anime.episodes ?? 0);
        }, 0);

        setMangaReading(reading);
        setVolumes({ read: volumesRead, total: volumesTotal });
        setChapters({ read: chaptersRead, total: chaptersTotal });
        setAnimeWatching(watching);
        setEpisodes({ read: episodesWatched, total: episodesTotal });
        setAnimePlanned(planned);
        setWatchTimeSeconds(watchedSeconds);
      } catch {
        // ignore dashboard soft errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, works, animes, worksSyncKey]);

  return (
    <section className="dashboard-section library-overview">
      <h2>Aperçu bibliothèque</h2>

      <div className="library-overview-row">
        <div className="library-overview-cards library-overview-cards--global">
          <OverviewCard
            label="Séries lectures"
            value={works.length}
            onClick={() => navigate("/library/lectures")}
          />
          <OverviewCard
            label="Séries anime"
            value={animes.length}
            onClick={() => navigate("/library/anime")}
          />
        </div>
      </div>

      <div className="library-overview-row">
        <div className="library-overview-cards">
          <OverviewCard
            label="En cours (lecture)"
            value={mangaReading}
            onClick={() => navigate("/reading/lectures")}
          />
          <OverviewCard
            label="Tomes lus"
            value={volumes}
            onClick={() => navigate("/reading/lectures")}
          />
          <OverviewCard
            label="Chapitres lus"
            value={chapters}
            onClick={() => navigate("/reading/lectures")}
          />
        </div>
      </div>

      <div className="library-overview-row">
        <div className="library-overview-cards library-overview-cards--anime">
          <OverviewCard
            label="En cours (animé)"
            value={animeWatching}
            onClick={() => navigate("/reading/anime")}
          />
          <OverviewCard
            label="Épisodes vus"
            value={episodes}
            onClick={() => navigate("/reading/anime")}
          />
          <div className="library-overview-card library-overview-card--watch">
            <button
              type="button"
              className="library-overview-card-main"
              onClick={() => navigate("/reading/anime")}
            >
              <span>Temps visionné</span>
            </button>
            <WatchTimeValue seconds={watchTimeSeconds} variant="overview" />
          </div>
          <OverviewCard
            label="À voir (animé)"
            value={animePlanned}
            onClick={() => navigate("/library/anime")}
          />
        </div>
      </div>
    </section>
  );
}

function OverviewCard({
  label,
  value,
  title,
  onClick,
}: {
  label: string;
  value: number | RatioStat;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="library-overview-card"
      title={title}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>
        {typeof value === "number" ? (
          value
        ) : (
          <>
            {value.read}
            <span className="library-overview-sep"> / </span>
            {value.total}
          </>
        )}
      </strong>
    </button>
  );
}
