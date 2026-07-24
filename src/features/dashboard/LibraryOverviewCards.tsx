import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAnimes } from "@/hooks/useAnimes";
import { useWorks } from "@/hooks/useWorks";
import { fetchAnimeProgressForUser } from "@/services/animeProgressService";
import { fetchLibraryUserReadingMeta } from "@/services/readingProgressService";
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

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const [readingMeta, animeProgress] = await Promise.all([
          fetchLibraryUserReadingMeta(works, { targetUserId: user.id }),
          fetchAnimeProgressForUser(user.id),
        ]);
        if (cancelled) return;

        let reading = 0;
        let volumesRead = 0;
        let volumesTotal = 0;
        let chaptersRead = 0;
        let chaptersTotal = 0;
        for (const work of works) {
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
        for (const progress of animeProgress.values()) {
          episodesWatched += progress.episodes_watched;
          if (progress.list_status === "watching") watching += 1;
          if (progress.list_status === "plan_to_watch") planned += 1;
        }

        const episodesTotal = animes.reduce(
          (sum, anime) => sum + (anime.episodes ?? 0),
          0,
        );

        setMangaReading(reading);
        setVolumes({ read: volumesRead, total: volumesTotal });
        setChapters({ read: chaptersRead, total: chaptersTotal });
        setAnimeWatching(watching);
        setEpisodes({ read: episodesWatched, total: episodesTotal });
        setAnimePlanned(planned);
      } catch {
        // ignore dashboard soft errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, works, animes]);

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
        <div className="library-overview-cards">
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
  onClick,
}: {
  label: string;
  value: number | RatioStat;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="library-overview-card"
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
