import { useEffect, useState, type CSSProperties } from "react";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import type { AnimeListStatus } from "@/types/anime";
import {
  ANIME_LIST_STATUS_COLORS,
  ANIME_LIST_STATUS_LABELS,
  deriveAnimeListStatus,
} from "@/constants/animeStatus";
import { formatDateFr } from "@/utils/dateFormat";
import "./AnimeWatchPanel.css";

export interface AnimeWatchPanelProps {
  listStatus: AnimeListStatus;
  episodesWatched: number;
  episodesTotal: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  canEdit: boolean;
  onChange: (next: {
    listStatus: AnimeListStatus;
    episodesWatched: number;
    startedAt: string | null;
    finishedAt: string | null;
  }) => void;
}

/**
 * @description Bloc Mon suivi : statut dérivé, slider, toggle abandonnée, dates.
 */
export function AnimeWatchPanel({
  listStatus,
  episodesWatched,
  episodesTotal,
  startedAt,
  finishedAt,
  canEdit,
  onChange,
}: AnimeWatchPanelProps) {
  const max = episodesTotal ?? 0;
  const abandoned = listStatus === "dropped";
  const derivedStatus = deriveAnimeListStatus(
    episodesWatched,
    episodesTotal,
    abandoned,
  );
  const complete = max > 0 && episodesWatched >= max && !abandoned;
  const trackColor = ANIME_LIST_STATUS_COLORS[derivedStatus];

  const [sliderStyle, setSliderStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (complete) {
      setSliderStyle({ background: "#22c55e" });
    } else {
      setSliderStyle({
        background: "linear-gradient(90deg, #7c3aed 0%, #22c55e 100%)",
      });
    }
  }, [complete]);

  /**
   * @description Persiste la progression avec statut recalculé.
   */
  const emit = (
    nextWatched: number,
    nextAbandoned: boolean,
    dates?: { startedAt: string | null; finishedAt: string | null },
  ) => {
    const nextStatus = deriveAnimeListStatus(
      nextWatched,
      episodesTotal,
      nextAbandoned,
    );
    onChange({
      listStatus: nextStatus,
      episodesWatched: nextWatched,
      startedAt: dates?.startedAt ?? startedAt,
      finishedAt: dates?.finishedAt ?? finishedAt,
    });
  };

  return (
    <section className="work-detail-section anime-watch-section">
      <h2>Mon suivi</h2>
      <div className="anime-watch-cards">
        <article className="anime-watch-card">
          <span>Statut</span>
          <strong style={{ color: trackColor }}>
            {ANIME_LIST_STATUS_LABELS[derivedStatus]}
          </strong>
          <div className="anime-watch-abandoned">
            <span className="anime-watch-abandoned-label">Abandonnée :</span>
            <ToggleSwitch
              checked={abandoned}
              disabled={!canEdit}
              title={
                abandoned
                  ? "Retirer le marquage abandonnée"
                  : "Marquer la série comme abandonnée"
              }
              onChange={(checked) => emit(episodesWatched, checked)}
            />
          </div>
        </article>

        <article className="anime-watch-card anime-watch-card--episodes">
          <span>Épisodes vus</span>
          <strong>
            {episodesWatched} / {episodesTotal != null ? episodesTotal : "?"}
          </strong>
          <div className="anime-ep-slider-wrap">
            <input
              className={`anime-ep-slider${complete ? " is-complete" : ""}`}
              type="range"
              min={0}
              max={max > 0 ? max : Math.max(episodesWatched, 1)}
              step={1}
              value={episodesWatched}
              disabled={!canEdit || episodesTotal == null}
              style={sliderStyle}
              onChange={(e) => {
                const value = Number(e.target.value) || 0;
                emit(value, abandoned);
              }}
            />
            <span className="anime-ep-slider-hint">
              {!complete && canEdit
                ? "Glisser pour modifier manuellement"
                : !canEdit
                  ? "Lecture seule"
                  : "\u00a0"}
            </span>
          </div>
        </article>

        {formatDateFr(startedAt) ? (
          <article className="anime-watch-card">
            <span>Début (perso)</span>
            <strong>{formatDateFr(startedAt)}</strong>
          </article>
        ) : null}
        {formatDateFr(finishedAt) ? (
          <article className="anime-watch-card">
            <span>Fin (perso)</span>
            <strong>{formatDateFr(finishedAt)}</strong>
          </article>
        ) : null}
      </div>
    </section>
  );
}
